#!/usr/bin/env node
/**
 * NocoBase DSL Reconciler CLI
 *
 * Usage:
 *   npx tsx cli/cli.ts deploy <dir> [--force] [--plan]
 *   npx tsx cli/cli.ts verify-sql <dir>
 *   npx tsx cli/cli.ts export <page-title> <outdir>
 */
import { NocoBaseClient } from '../client';
import { validate, verifySql, expandPopups } from '../deploy';
import { ensureAllCollections } from '../deploy/collection-deployer';
import { createDeployContext } from '../deploy/deploy-context';
import { deploySurface } from '../deploy/surface-deployer';
import { deployPopup } from '../deploy/popup-deployer';
import { reorderTableColumns } from '../deploy/column-reorder';
import { postVerify } from '../deploy/post-verify';
import { exportPageSurface, exportAllPopups, exportProject } from '../export';
import { exportAcl } from '../acl/acl-exporter';
import { deployAcl } from '../acl/acl-deployer';
import { exportWorkflows } from '../workflow/workflow-exporter';
import { deployWorkflows } from '../workflow/workflow-deployer';
import { validateWorkflow, formatValidationResult } from '../workflow/validator';
import type { WorkflowSpec } from '../workflow/types';
import { scaffold } from '../deploy/scaffold';
import { deployProject } from '../deploy/project-deployer';
import { sync } from '../sync';
import { RefResolver } from '../refs';
import { loadYaml, saveYaml } from '../utils/yaml';
import { slugify } from '../utils/slugify';
import type { ModuleState, PageState } from '../types/state';
import type { EnhanceSpec } from '../types/spec';
import * as fs from 'node:fs';
import * as path from 'node:path';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('Usage: cli.ts <command> [options]');
    console.log('Commands: deploy, deploy-project, rollback, scaffold, seed, verify-sql, export, export-project, sync, graph, export-acl, deploy-acl, export-workflows, deploy-workflows, validate-workflows');
    process.exit(1);
  }

  switch (command) {
    case 'deploy':
      await cmdDeploy(args.slice(1));
      break;
    case 'deploy-project':
      await cmdDeployProject(args.slice(1));
      break;
    case 'rollback':
      await cmdRollback(args.slice(1));
      break;
    case 'scaffold':
      cmdScaffold(args.slice(1));
      break;
    case 'seed':
      await cmdSeed(args.slice(1));
      break;
    case 'verify-data':
      await cmdVerifyData(args.slice(1));
      break;
    case 'verify-sql':
      await cmdVerifySql(args.slice(1));
      break;
    case 'export':
      await cmdExport(args.slice(1));
      break;
    case 'export-project':
      await cmdExportProject(args.slice(1));
      break;
    case 'graph':
      await cmdGraph(args.slice(1));
      break;
    case 'sync':
      await cmdSync(args.slice(1));
      break;
    case 'export-acl':
      await cmdExportAcl(args.slice(1));
      break;
    case 'deploy-acl':
      await cmdDeployAcl(args.slice(1));
      break;
    case 'export-workflows':
      await cmdExportWorkflows(args.slice(1));
      break;
    case 'deploy-workflows':
      await cmdDeployWorkflows(args.slice(1));
      break;
    case 'validate-workflows':
      cmdValidateWorkflows(args.slice(1));
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

async function cmdDeploy(args: string[]) {
  const modDir = args[0];
  if (!modDir) { console.error('Usage: cli.ts deploy <dir> [--force] [--plan]'); process.exit(1); }
  const force = args.includes('--force');
  const planOnly = args.includes('--plan');

  const nb = await NocoBaseClient.create();
  const ctx = createDeployContext(nb, { force });

  // Validate
  const { errors, warnings, plan, structure, enhance } = await validate(modDir, nb);

  // Print plan
  console.log('\n  ── Plan ──');
  console.log(`  Collections: ${plan.collections.length}`);
  for (const c of plan.collections) console.log(`    ${c.status === 'new' ? '+' : '='} ${c.name}`);
  console.log(`  Pages: ${plan.pages.length}`);
  for (const p of plan.pages) console.log(`    ${p.name}: ${p.blocks} blocks (${p.types.join(', ')})`);

  if (errors.length) {
    console.log(`\n  Validation failed (${errors.length} errors):`);
    for (const e of errors) console.log(`    ✗ ${e}`);
    process.exit(1);
  }
  console.log('  ✓ Validation passed');
  if (planOnly) return;

  // Deploy
  console.log(`\n  Connected to ${nb.baseUrl}`);

  // Collections
  await ensureAllCollections(nb, structure.collections || {});

  // State
  const mod = path.resolve(modDir);
  const stateFile = path.join(mod, 'state.yaml');
  const state: ModuleState = fs.existsSync(stateFile)
    ? loadYaml<ModuleState>(stateFile)
    : { pages: {} };

  // Routes: find or create group + pages
  const moduleName = structure.module || path.basename(mod);
  if (!state.group_id) {
    const result = await nb.createGroup(moduleName, structure.icon || 'appstoreoutlined');
    state.group_id = result.routeId;
    console.log(`  + group: ${moduleName}`);
  }

  // Pages
  for (const ps of structure.pages) {
    const pageKey = slugify(ps.page);
    let pageState = state.pages[pageKey];

    if (!pageState?.tab_uid) {
      const result = await nb.createPage(ps.page, state.group_id, ps.icon);
      pageState = {
        route_id: result.routeId,
        page_uid: result.pageUid,
        tab_uid: result.tabSchemaUid,
        grid_uid: result.gridUid,
        blocks: {},
      };
      console.log(`  + page: ${ps.page}`);
    } else {
      console.log(`  = page: ${ps.page}`);
    }

    const blocksState = await deploySurface(
      ctx, pageState.tab_uid, ps, { modDir: mod, existingState: pageState.blocks },
    );
    pageState.blocks = blocksState;
    state.pages[pageKey] = pageState;
  }

  // Popups
  const resolver = new RefResolver(state);
  const popups = expandPopups(enhance.popups || []);

  for (const popupSpec of popups) {
    const targetRef = popupSpec.target;
    let targetUid: string;
    try {
      targetUid = resolver.resolveUid(targetRef);
    } catch (e) {
      console.log(`  ! popup ${targetRef}: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const pp = targetRef.split('.').pop() || '';
    await deployPopup(ctx, targetUid, targetRef, popupSpec, { modDir: mod, popupPath: pp });
  }

  // Final column reorder
  for (const ps of structure.pages) {
    const pageKey = slugify(ps.page);
    const pageState = state.pages[pageKey];
    for (const bs of ps.blocks) {
      if (bs.type !== 'table') continue;
      const blockUid = pageState?.blocks?.[bs.key]?.uid;
      const specFields = (bs.fields || [])
        .map(f => typeof f === 'string' ? f : (f.field || ''))
        .filter(Boolean);
      if (blockUid && specFields.length) {
        await reorderTableColumns(nb, blockUid, specFields);
      }
    }
  }

  // Save state
  saveYaml(stateFile, state);
  console.log('\n  State saved. Done.');

  // Post-verify
  const pv = await postVerify(nb, structure, enhance, state, popups, (ref) => resolver.resolveUid(ref));
  if (pv.errors.length) {
    console.log('\n  ── Post-deploy errors ──');
    for (const e of pv.errors) console.log(`  ✗ ${e}`);
  }
  if (pv.warnings.length) {
    console.log('\n  ── Hints ──');
    for (const w of pv.warnings) console.log(`  💡 ${w}`);
  }

  // SQL verification
  const sql = await verifySql(modDir, nb, structure);
  console.log(`\n  ── SQL Verification: ${sql.passed} passed, ${sql.failed} failed ──`);
  for (const r of sql.results) {
    if (!r.ok) console.log(`  ✗ ${r.label}: ${r.error}`);
  }
}

async function cmdVerifySql(args: string[]) {
  const modDir = args[0];
  if (!modDir) { console.error('Usage: cli.ts verify-sql <dir>'); process.exit(1); }

  const nb = await NocoBaseClient.create();
  const result = await verifySql(modDir, nb);

  console.log(`── Verify SQL (${result.results.length} queries) ──`);
  console.log(`  Target: ${nb.baseUrl} (PostgreSQL)\n`);
  for (const r of result.results) {
    console.log(r.ok ? `  ✓ ${r.label} (${r.rows} rows)` : `  ✗ ${r.label}\n    Error: ${r.error}`);
  }
  console.log(`\n  Result: ${result.passed} passed, ${result.failed} failed`);
  if (result.failed > 0) process.exit(1);
}

async function cmdExport(args: string[]) {
  const pageTitle = args[0];
  const outDir = args[1];
  if (!pageTitle || !outDir) { console.error('Usage: cli.ts export <page-title> <outdir>'); process.exit(1); }

  const nb = await NocoBaseClient.create();
  const routes = await nb.routes.list();

  // Find page by title
  let tabUid = '';
  for (const r of routes) {
    if ((r.title || '') === pageTitle && r.type === 'flowPage') {
      // Find tabs child
      for (const r2 of routes) {
        if (r2.parentId === r.id && r2.type === 'tabs') {
          tabUid = r2.schemaUid || '';
          break;
        }
      }
      break;
    }
  }

  if (!tabUid) { console.error(`Page '${pageTitle}' not found`); process.exit(1); }

  fs.mkdirSync(outDir, { recursive: true });
  const jsDir = path.join(outDir, 'js');
  fs.mkdirSync(jsDir, { recursive: true });

  const spec = await exportPageSurface(nb, tabUid, jsDir, slugify(pageTitle));

  // Extract and export popups
  const popupRefs = (spec.popups || []) as { field: string; field_uid: string }[];
  if (popupRefs.length) {
    const popupsDir = path.join(outDir, 'popups');
    await exportAllPopups(nb, popupRefs, jsDir, popupsDir, slugify(pageTitle));
  }

  // Save structure
  delete spec._state;
  delete spec.popups;
  saveYaml(path.join(outDir, 'structure.yaml'), { module: pageTitle, pages: [{ page: pageTitle, ...spec }] });
  console.log(`Exported to ${outDir}`);
}

async function cmdDeployProject(args: string[]) {
  const dir = args[0];
  if (!dir) { console.error('Usage: cli.ts deploy-project <dir> [--force] [--plan] [--group X] [--page X] [--blueprint] [--copy]'); process.exit(1); }
  const force = args.includes('--force');
  const planOnly = args.includes('--plan');
  const blueprint = args.includes('--blueprint');
  const copyMode = args.includes('--copy');
  const groupIdx = args.indexOf('--group');
  const group = groupIdx >= 0 ? args[groupIdx + 1] : undefined;
  const pageIdx = args.indexOf('--page');
  const page = pageIdx >= 0 ? args[pageIdx + 1] : undefined;

  const absDir = path.resolve(dir);

  // ── Git detection (always — sync is mandatory for git repos) ──
  let isGit = false;
  let mainBranch = '';
  if (!planOnly) {
    const { execSync } = await import('node:child_process');
    try {
      execSync('git rev-parse --git-dir', { cwd: absDir, stdio: 'pipe' });
      mainBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: absDir, stdio: 'pipe' }).toString().trim();
      isGit = !!mainBranch;
    } catch { /* not a git repo — skip all git operations */ }
  }

  const targetGroup = group || autoDetectGroup(absDir);

  // ── Step 1: Pre-deploy ──
  if (isGit) {
    if (targetGroup && fs.existsSync(path.join(absDir, 'state.yaml'))) {
      // Incremental deploy: export live state first (capture UI changes)
      await preDeployExport(absDir, targetGroup, mainBranch);
    } else {
      // First deploy: just snapshot local YAML
      await gitSnapshot(absDir, mainBranch);
    }
  }

  // ── Step 2: Deploy ──
  await deployProject(absDir, { force, planOnly, group, page, blueprint, copyMode });
  if (planOnly) return;

  // ── Step 3: Post-deploy sync (export + diff — mandatory for git repos) ──
  if (isGit && targetGroup) {
    await deploySyncWorktree(absDir, targetGroup, mainBranch);
  }
}

/**
 * Rollback — delete templates created by the most recent deploy.
 *
 * Reads state.yaml._last_deploy_created_templates (written by deploy-project)
 * and destroys each UID in NocoBase. Use before `git revert` if you want the
 * live instance to match the reverted YAML state.
 */
async function cmdRollback(args: string[]) {
  const dir = args[0];
  if (!dir) { console.error('Usage: cli.ts rollback <project-dir>'); process.exit(1); }
  const absDir = path.resolve(dir);
  const stateFile = path.join(absDir, 'state.yaml');
  if (!fs.existsSync(stateFile)) { console.error(`state.yaml not found in ${absDir}`); process.exit(1); }
  const state = loadYaml<ModuleState>(stateFile);
  const uids = (state as any)._last_deploy_created_templates as string[] | undefined;
  if (!uids?.length) { console.log('Nothing to roll back — no templates were recorded from last deploy.'); return; }

  console.log(`Rolling back ${uids.length} templates created by last deploy…`);
  const nb = await NocoBaseClient.create();
  const { deleteTemplatesByUid } = await import('../deploy/template-deployer');
  await deleteTemplatesByUid(nb, uids, console.log);
  delete (state as any)._last_deploy_created_templates;
  saveYaml(stateFile, state);
  console.log('Rollback done. Templates removed; state.yaml cleared of rollback list.');
}

// ── Deploy-sync helpers ──

/** Auto-detect group title from routes.yaml (first group entry). */
function autoDetectGroup(projectDir: string): string {
  try {
    const { loadYaml } = require('../utils/yaml');
    const routes = loadYaml(path.join(projectDir, 'routes.yaml'));
    if (Array.isArray(routes)) {
      const g = routes.find((r: any) => r.type === 'group' || r.children);
      return g?.title || '';
    }
  } catch { /* skip */ }
  return '';
}

/**
 * Pre-deploy: export live NocoBase state to a worktree BEFORE deploying.
 *
 * If user modified pages in the NocoBase UI since last deploy, those changes
 * are captured in the pre-deploy-live branch. The deploy still runs from the
 * main branch YAML, but the user can compare/merge the live state afterwards.
 *
 * Flow:
 *   1. Commit local YAML changes (rollback point)
 *   2. Export live state to worktree (pre-deploy-live branch)
 *   3. Show diff: local YAML vs live NocoBase
 *   4. Proceed with deploy from local YAML
 */
async function preDeployExport(absDir: string, group: string, mainBranch: string): Promise<void> {
  const { execSync } = await import('node:child_process');

  // Skip for first deploy (no state.yaml = nothing deployed yet)
  if (!fs.existsSync(path.join(absDir, 'state.yaml'))) return;

  try {
    // Commit any pending local changes first (rollback point)
    execSync('git add -A', { cwd: absDir, stdio: 'pipe' });
    const localStatus = execSync('git status --porcelain', { cwd: absDir, stdio: 'pipe' }).toString().trim();
    if (localStatus) {
      execSync('git commit -m "pre-deploy snapshot"', { cwd: absDir, stdio: 'pipe' });
      console.log('  git: pre-deploy snapshot saved');
    }

    // Export live state to worktree
    const liveBranch = 'pre-deploy-live';
    const wtDir = absDir + '-live';
    try { execSync(`git worktree remove --force "${wtDir}"`, { cwd: absDir, stdio: 'pipe' }); } catch { /* ok */ }
    try { execSync(`git branch -D ${liveBranch}`, { cwd: absDir, stdio: 'pipe' }); } catch { /* ok */ }
    execSync(`git worktree add "${wtDir}" -b ${liveBranch}`, { cwd: absDir, stdio: 'pipe' });

    // Copy state.yaml so export can match UIDs
    const stateFile = path.join(absDir, 'state.yaml');
    if (fs.existsSync(stateFile)) fs.copyFileSync(stateFile, path.join(wtDir, 'state.yaml'));

    const nb = await NocoBaseClient.create();
    await exportProject(nb, { outDir: wtDir, group });

    execSync('git add -A', { cwd: wtDir, stdio: 'pipe' });
    const liveStatus = execSync('git status --porcelain', { cwd: wtDir, stdio: 'pipe' }).toString().trim();
    if (liveStatus) {
      execSync('git commit -m "pre-deploy: live state"', { cwd: wtDir, stdio: 'pipe' });
    }

    // Show diff: local YAML vs live NocoBase
    const diff = execSync(
      `git diff --stat ${mainBranch}..${liveBranch} -- pages/ ":(exclude)**/page.yaml" ":(exclude)**/_refs.yaml"`,
      { cwd: absDir, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    ).trim();

    if (diff) {
      const lines = diff.split('\n');
      console.log(`\n  ⚠ Live state differs from local DSL (${lines.length - 1} files):`);
      console.log(lines.slice(0, 10).map(l => '    ' + l).join('\n'));
      if (lines.length > 11) console.log(`    ... and ${lines.length - 11} more`);
      console.log(`  To review:  git diff ${mainBranch}..${liveBranch}`);
      console.log(`  To adopt:   git merge ${liveBranch}`);
      console.log('  Proceeding with deploy from local DSL...\n');
    }

    // Cleanup worktree (branch preserved)
    try { execSync(`git worktree remove --force "${wtDir}"`, { cwd: absDir, stdio: 'pipe' }); } catch { /* ok */ }
    if (!diff) {
      try { execSync(`git branch -D ${liveBranch}`, { cwd: absDir, stdio: 'pipe' }); } catch { /* ok */ }
    }
  } catch (e) {
    console.log('  ! pre-deploy sync: ' + (e instanceof Error ? e.message.slice(0, 60) : e));
  }
}

/** Step 1: Commit current state as rollback point. */
async function gitSnapshot(absDir: string, branch: string): Promise<void> {
  const { execSync } = await import('node:child_process');
  try {
    execSync('git add -A', { cwd: absDir, stdio: 'pipe' });
    const status = execSync('git status --porcelain', { cwd: absDir, stdio: 'pipe' }).toString().trim();
    if (status) {
      execSync(`git commit -m "pre-deploy snapshot (${branch})"`, { cwd: absDir, stdio: 'pipe' });
      console.log('  git: pre-deploy snapshot saved');
    }
  } catch (e) {
    console.log('  git: snapshot skipped — ' + (e instanceof Error ? e.message.slice(0, 60) : e));
  }
}

/**
 * Steps 3-6: Create worktree → export → diff → cleanup.
 *
 * Flow:
 *   1. git worktree add <dir>-worktree -b deploy-sync
 *   2. Copy state.yaml (has deployed UIDs)
 *   3. export-project into worktree
 *   4. git add + commit in worktree
 *   5. git diff main..deploy-sync --stat
 *   6. Remove worktree (branch preserved for review/merge)
 */
async function deploySyncWorktree(absDir: string, group: string, mainBranch: string): Promise<void> {
  const { execSync } = await import('node:child_process');
  const branch = 'deploy-sync';
  const wtDir = absDir + '-worktree';

  try {
    console.log('\n  ── Deploy sync ──');

    // Clean previous worktree/branch
    try { execSync(`git worktree remove --force "${wtDir}"`, { cwd: absDir, stdio: 'pipe' }); } catch { /* ok */ }
    try { execSync(`git branch -D ${branch}`, { cwd: absDir, stdio: 'pipe' }); } catch { /* ok */ }

    // Create worktree on new branch from current HEAD
    execSync(`git worktree add "${wtDir}" -b ${branch}`, { cwd: absDir, stdio: 'pipe' });

    // Copy state.yaml to worktree (has deployed UIDs for export matching)
    const stateFile = path.join(absDir, 'state.yaml');
    if (fs.existsSync(stateFile)) {
      fs.copyFileSync(stateFile, path.join(wtDir, 'state.yaml'));
    }

    // Export live NocoBase state into worktree
    const nb = await NocoBaseClient.create();
    await exportProject(nb, { outDir: wtDir, group });

    // Commit export result in worktree
    execSync('git add -A', { cwd: wtDir, stdio: 'pipe' });
    const status = execSync('git status --porcelain', { cwd: wtDir, stdio: 'pipe' }).toString().trim();
    if (status) {
      execSync('git commit -m "post-deploy export"', { cwd: wtDir, stdio: 'pipe' });
    }

    // Show diff: main..deploy-sync (content files only, exclude metadata)
    const diff = execSync(
      `git diff --stat ${mainBranch}..${branch} -- . ":(exclude)**/page.yaml" ":(exclude)**/_refs.yaml" ":(exclude)_graph.yaml"`,
      { cwd: absDir, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    ).trim();

    if (diff) {
      const lines = diff.split('\n');
      console.log(`\n  Diff (${mainBranch} → ${branch}):`);
      console.log(lines.map(l => '    ' + l).join('\n'));
      console.log(`\n  To review:  git diff ${mainBranch}..${branch}`);
      console.log(`  To merge:   git merge ${branch}`);
      console.log(`  To discard: git branch -D ${branch}`);
    } else {
      console.log('  ✓ No diff — DSL matches live state');
      // No changes → clean up branch too
      try { execSync(`git branch -D ${branch}`, { cwd: absDir, stdio: 'pipe' }); } catch { /* ok */ }
    }

    // Always remove worktree (branch stays if there are changes)
    try { execSync(`git worktree remove --force "${wtDir}"`, { cwd: absDir, stdio: 'pipe' }); } catch { /* ok */ }
  } catch (e) {
    console.log('  ! deploy-sync failed: ' + (e instanceof Error ? e.message.slice(0, 80) : e));
    // Best-effort cleanup
    try { execSync(`git worktree remove --force "${wtDir}"`, { cwd: absDir, stdio: 'pipe' }); } catch { /* ok */ }
  }
}

async function cmdGraph(args: string[]) {
  const dir = args[0];
  if (!dir) { console.error('Usage: cli.ts graph <project-dir>'); process.exit(1); }

  const { buildGraph } = await import('../graph/graph-builder');
  const { saveYaml } = await import('../utils/yaml');

  const graph = buildGraph(dir);
  const stats = graph.stats();
  console.log('Graph:', stats);

  // Generate _refs.yaml for each page
  const nodes = (graph as any).nodes as Map<string, any>;
  let refsCount = 0;
  for (const [id, n] of nodes) {
    if (n.type !== 'page') continue;
    const refs = graph.pageRefs(id);
    const pageDir = path.join(dir, n.meta?.dir || `pages/${n.name}`);
    if (fs.existsSync(pageDir)) {
      saveYaml(path.join(pageDir, '_refs.yaml'), {
        _generated: true,
        _readonly: 'This file is auto-generated. Edits will be overwritten.',
        ...refs,
      });
      refsCount++;
    }
  }
  console.log(`Generated ${refsCount} _refs.yaml files`);

  // Save full graph
  saveYaml(path.join(dir, '_graph.yaml'), {
    stats,
    ...graph.toJSON(),
  });
  console.log(`Saved _graph.yaml`);
}

function cmdScaffold(args: string[]) {
  const dir = args[0];
  const name = args[1];
  if (!dir || !name) {
    console.error('Usage: cli.ts scaffold <dir> <module-name> [--pages P1,P2,...] [--collections C1,C2,...]');
    console.error('\nOptions:');
    console.error('  --pages        Comma-separated page names (default: Dashboard,Main)');
    console.error('  --collections  Comma-separated collection names (default: auto from pages)');
    console.error('\nExample:');
    console.error('  cli.ts scaffold /tmp/pm PM --pages Dashboard,Projects,Tasks --collections nb_pm_projects,nb_pm_tasks');
    process.exit(1);
  }
  const pagesIdx = args.indexOf('--pages');
  const collIdx = args.indexOf('--collections');
  const collections = collIdx >= 0 && args[collIdx + 1]
    ? args[collIdx + 1].split(',').map(s => s.trim())
    : undefined;
  let pages: string[];
  if (pagesIdx >= 0 && args[pagesIdx + 1]) {
    pages = args[pagesIdx + 1].split(',').map(s => s.trim());
  } else if (collections?.length) {
    // Auto-derive page names from collection names: nb_erp_purchase_orders → PurchaseOrders
    // Always include Dashboard as first page
    const prefix = `nb_${name.toLowerCase()}_`;
    pages = ['Dashboard', ...collections.map(c => {
      const short = c.startsWith(prefix) ? c.slice(prefix.length) : c;
      return short.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    })];
  } else {
    pages = ['Dashboard', 'Main'];
  }
  scaffold(dir, name, pages, collections);
}

async function cmdExportProject(args: string[]) {
  const outDir = args[0];
  if (!outDir) { console.error('Usage: cli.ts export-project <outdir> [--group "Main"]'); process.exit(1); }
  const groupIdx = args.indexOf('--group');
  const group = groupIdx >= 0 ? args[groupIdx + 1] : undefined;
  const nb = await NocoBaseClient.create();
  await exportProject(nb, { outDir, group });
}

async function cmdSync(args: string[]) {
  const modDir = args[0];
  if (!modDir) { console.error('Usage: cli.ts sync <dir> [--page <name>]'); process.exit(1); }
  const pageIdx = args.indexOf('--page');
  const pageFilter = pageIdx >= 0 ? args[pageIdx + 1] : undefined;
  const nb = await NocoBaseClient.create();
  await sync(modDir, nb, pageFilter);
}

async function cmdExportAcl(args: string[]) {
  const outDir = args[0];
  if (!outDir) { console.error('Usage: cli.ts export-acl <outdir> [--roles role1,role2]'); process.exit(1); }
  const rolesIdx = args.indexOf('--roles');
  const roles = rolesIdx >= 0 && args[rolesIdx + 1] ? args[rolesIdx + 1].split(',').map(s => s.trim()) : undefined;
  const nb = await NocoBaseClient.create();
  await exportAcl(nb, { outDir, roles });
}

async function cmdDeployAcl(args: string[]) {
  const dir = args[0];
  if (!dir) { console.error('Usage: cli.ts deploy-acl <project-dir> [--dry-run]'); process.exit(1); }
  const dryRun = args.includes('--dry-run');
  const nb = await NocoBaseClient.create();
  await deployAcl(nb, dir, console.log, { dryRun });
}

async function cmdExportWorkflows(args: string[]) {
  const outDir = args[0];
  if (!outDir) { console.error('Usage: cli.ts export-workflows <outdir> [--enabled] [--type X] [--title-pattern X]'); process.exit(1); }
  const nb = await NocoBaseClient.create();
  const filter: Record<string, unknown> = {};
  if (args.includes('--enabled')) filter.enabled = true;
  const typeIdx = args.indexOf('--type');
  if (typeIdx >= 0) filter.type = args[typeIdx + 1];
  const patternIdx = args.indexOf('--title-pattern');
  if (patternIdx >= 0) filter.titlePattern = args[patternIdx + 1];
  await exportWorkflows(nb, { outDir, filter: filter as any });
}

async function cmdDeployWorkflows(args: string[]) {
  const dir = args[0];
  if (!dir) { console.error('Usage: cli.ts deploy-workflows <project-dir> [--copy]'); process.exit(1); }
  const copyMode = args.includes('--copy');
  const nb = await NocoBaseClient.create();
  await deployWorkflows(nb, dir, { copyMode });
}

function cmdValidateWorkflows(args: string[]) {
  const dir = args[0];
  if (!dir) { console.error('Usage: cli.ts validate-workflows <project-dir>'); process.exit(1); }

  const wfBaseDir = path.join(dir, 'workflows');
  if (!fs.existsSync(wfBaseDir)) {
    console.error('No workflows/ directory found');
    process.exit(1);
  }

  const entries = fs.readdirSync(wfBaseDir, { withFileTypes: true });
  const wfDirs = entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(name => fs.existsSync(path.join(wfBaseDir, name, 'workflow.yaml')));

  if (!wfDirs.length) {
    console.log('No workflow.yaml files found');
    return;
  }

  console.log(`  Validating ${wfDirs.length} workflow(s)...\n`);
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const slug of wfDirs) {
    const spec = loadYaml<WorkflowSpec>(path.join(wfBaseDir, slug, 'workflow.yaml'));
    const result = validateWorkflow(spec);

    const errors = result.errors.filter(e => e.level === 'error');
    const warnings = result.errors.filter(e => e.level === 'warn');
    totalErrors += errors.length;
    totalWarnings += warnings.length;

    if (result.errors.length) {
      console.log(formatValidationResult(result, spec.title));
    } else {
      console.log(`  ✓ ${spec.title}: passed`);
    }
  }

  console.log(`\n  Result: ${wfDirs.length} workflow(s), ${totalErrors} error(s), ${totalWarnings} warning(s)`);
  if (totalErrors > 0) process.exit(1);
}

async function cmdVerifyData(args: string[]) {
  const dir = args[0];
  if (!dir) { console.log('Usage: verify-data <project-dir>'); process.exit(1); }
  const { verifyData } = await import('./verify-data');
  const result = await verifyData(path.resolve(dir));
  if (result.failed > 0) process.exit(1);
}

async function cmdSeed(args: string[]) {
  const dir = args[0];
  if (!dir) { console.log('Usage: seed <project-dir> [--count N]'); process.exit(1); }
  const countIdx = args.indexOf('--count');
  const count = countIdx >= 0 ? parseInt(args[countIdx + 1], 10) : 5;
  const { seedData } = await import('./seed');
  await seedData(path.resolve(dir), { count });
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
