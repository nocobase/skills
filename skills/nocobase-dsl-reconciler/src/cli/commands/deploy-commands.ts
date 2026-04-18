/**
 * Deploy-family CLI commands: push, deploy (legacy), deploy-acl,
 * deploy-workflows, rollback, clean.
 *
 * Extracted from cli.ts — behaviour unchanged, only relocation.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NocoBaseClient } from '../../client';
import { validate, verifySql, expandPopups } from '../../deploy';
import { ensureAllCollections } from '../../deploy/collection-deployer';
import { createDeployContext } from '../../deploy/deploy-context';
import { deploySurface } from '../../deploy/surface-deployer';
import { deployPopup } from '../../deploy/popups/popup-deployer';
import { reorderTableColumns } from '../../deploy/column-reorder';
import { postVerify } from '../../deploy/post-verify';
import { deployProject } from '../../deploy/project-deployer';
import { deployAcl } from '../../acl/acl-deployer';
import { deployWorkflows } from '../../workflow/workflow-deployer';
import { RefResolver } from '../../refs';
import { loadYaml, saveYaml } from '../../utils/yaml';
import { slugify } from '../../utils/slugify';
import { catchSwallow } from '../../utils/swallow';
import type { ModuleState } from '../../types/state';
import { resolveWorkspacePath } from '../workspace-paths';
import { ensureProjectGit, gitSnapshot } from '../git-ops';

export async function cmdDeploy(args: string[]) {
  const modDirArg = args[0];
  if (!modDirArg) { console.error('Usage: cli.ts deploy <dir> [--force] [--plan]'); process.exit(1); }
  const modDir = resolveWorkspacePath(modDirArg);
  const force = args.includes('--force');
  const planOnly = args.includes('--plan');

  const nb = await NocoBaseClient.create();
  const ctx = createDeployContext(nb, { force });

  // Validate
  const { errors, plan, structure, enhance } = await validate(modDir, nb);

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
  const mod = modDir;
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

export async function cmdDeployProject(args: string[]) {
  const dir = args[0];
  if (!dir) { console.error('Usage: cli.ts push <dir> [--force] [--plan] [--group <key>] [--page X] [--incremental] [--copy]\n\n  --group <key>     Deploy only the route subtree whose key matches.\n  --incremental     Skip pages whose DSL files have not changed since the last\n                    push (uses git diff vs state.last_deployed_sha; falls back\n                    to full push when not in git or sha missing).\n  --copy            Bypass spec validation errors (warnings still shown).\n                    ONLY accepted on a workspace produced by duplicate-project\n                    (presence of .duplicate-source marker). Refused otherwise.'); process.exit(1); }
  const force = args.includes('--force');
  const planOnly = args.includes('--plan');
  const blueprint = args.includes('--blueprint');
  const incremental = args.includes('--incremental');
  const copy = args.includes('--copy');
  const groupIdx = args.indexOf('--group');
  const group = groupIdx >= 0 ? args[groupIdx + 1] : undefined;
  const pageIdx = args.indexOf('--page');
  const page = pageIdx >= 0 ? args[pageIdx + 1] : undefined;

  const absDir = resolveWorkspacePath(dir);

  // Pre-deploy git snapshot (rollback point). Auto-init a local repo for
  // the project if missing, so this works the very first time and stays
  // decoupled from any parent repo above workspaces/.
  if (!planOnly) {
    await ensureProjectGit(absDir, console.log);
    const { execSync } = await import('node:child_process');
    try {
      execSync('git rev-parse --git-dir', { cwd: absDir, stdio: 'pipe' });
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: absDir, stdio: 'pipe' }).toString().trim();
      if (branch) await gitSnapshot(absDir, branch);
    } catch (e) { catchSwallow(e, 'not a git repo — skip'); }
  }

  await deployProject(absDir, { force, planOnly, group, page, blueprint, incremental, copy });
}

export async function cmdClean(args: string[]) {
  const dryRun = args.includes('--dry-run');
  const nb = await NocoBaseClient.create();
  const { cleanOrphanModels } = await import('../../deploy/orphan-cleaner');
  const result = await cleanOrphanModels(nb, { dryRun }, console.log);
  if (dryRun && result.orphans) {
    console.log('  (dry-run — rerun without --dry-run to actually delete)');
  }
}

/**
 * Rollback — delete templates created by the most recent deploy.
 *
 * Reads state.yaml._last_deploy_created_templates (written by deploy-project)
 * and destroys each UID in NocoBase. Use before `git revert` if you want the
 * live instance to match the reverted YAML state.
 */
export async function cmdRollback(args: string[]) {
  const dir = args[0];
  const clean = args.includes('--clean');  // also prune orphan flowModels + stale usage records
  if (!dir) { console.error('Usage: cli.ts rollback <project-dir> [--clean]'); process.exit(1); }
  const absDir = resolveWorkspacePath(dir);
  const stateFile = path.join(absDir, 'state.yaml');
  if (!fs.existsSync(stateFile)) { console.error(`state.yaml not found in ${absDir}`); process.exit(1); }
  const state = loadYaml<ModuleState>(stateFile);
  const uids = (state as unknown as Record<string, unknown>)._last_deploy_created_templates as string[] | undefined;
  const nb = await NocoBaseClient.create();

  if (uids?.length) {
    console.log(`Rolling back ${uids.length} templates created by last deploy…`);
    const { deleteTemplatesByUid } = await import('../../deploy/templates/template-deployer');
    await deleteTemplatesByUid(nb, uids, console.log);
    delete (state as unknown as Record<string, unknown>)._last_deploy_created_templates;
    saveYaml(stateFile, state);
  } else {
    console.log('No templates recorded from last deploy.');
  }

  if (clean) {
    console.log('\nDeep cleanup (--clean):');
    await deepCleanTemplates(nb);
  }

  console.log('Rollback done.');
}

/**
 * Aggressive cleanup: reachable flowModels from active route trees + template targets
 * are preserved; everything else is deleted. Also cleans stale flowModelTemplateUsages
 * records (NocoBase doesn't cascade-delete them when flowModels disappear, which keeps
 * usageCount artificially high and blocks template deletion).
 */
async function deepCleanTemplates(nb: NocoBaseClient): Promise<void> {
  // 1. Collect reachable flowModel UIDs
  const routesResp = await nb.http.get(`${nb.baseUrl}/api/desktopRoutes:list`, { params: { paginate: false, tree: true } });
  const topRoutes = (routesResp.data.data || []) as Record<string, unknown>[];
  const rootUids = new Set<string>();
  function walkRoute(r: Record<string, unknown>) {
    if (r.schemaUid) rootUids.add(r.schemaUid as string);
    for (const c of ((r.children || []) as Record<string, unknown>[])) walkRoute(c);
  }
  for (const r of topRoutes) walkRoute(r);

  const allFm: Record<string, unknown>[] = [];
  for (let p = 1; p <= 10; p++) {
    const r = await nb.http.get(`${nb.baseUrl}/api/flowModels:list`, { params: { pageSize: 5000, page: p } });
    const d = (r.data.data || []) as Record<string, unknown>[];
    allFm.push(...d);
    if (d.length < 5000) break;
  }
  const childrenIdx = new Map<string, Record<string, unknown>[]>();
  for (const n of allFm) {
    const p = (n.parentId as string) || '__root__';
    if (!childrenIdx.has(p)) childrenIdx.set(p, []);
    childrenIdx.get(p)!.push(n);
  }
  const reachable = new Set<string>(rootUids);
  const queue: string[] = Array.from(rootUids);
  while (queue.length) {
    const u = queue.shift()!;
    for (const k of (childrenIdx.get(u) || [])) {
      const uid = k.uid as string;
      if (!reachable.has(uid)) { reachable.add(uid); queue.push(uid); }
    }
  }

  // 2. Also preserve template target trees
  const tResp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:list`, { params: { pageSize: 1000 } });
  const templates = (tResp.data.data || []) as Record<string, unknown>[];
  for (const t of templates) {
    const tgt = t.targetUid as string | undefined;
    if (!tgt || reachable.has(tgt)) continue;
    reachable.add(tgt);
    queue.push(tgt);
  }
  while (queue.length) {
    const u = queue.shift()!;
    for (const k of (childrenIdx.get(u) || [])) {
      const uid = k.uid as string;
      if (!reachable.has(uid)) { reachable.add(uid); queue.push(uid); }
    }
  }

  const orphans = allFm.filter(n => !reachable.has(n.uid as string));
  console.log(`  flowModels: ${allFm.length} total, ${reachable.size} reachable, ${orphans.length} orphan`);

  // 3. Batch delete orphans (20 parallel)
  let delFm = 0;
  for (let i = 0; i < orphans.length; i += 20) {
    const batch = orphans.slice(i, i + 20);
    const results = await Promise.allSettled(batch.map(o =>
      nb.http.post(`${nb.baseUrl}/api/flowModels:destroy`, {}, { params: { filterByTk: o.uid as string } })
    ));
    for (const r of results) if (r.status === 'fulfilled') delFm++;
  }
  console.log(`  deleted ${delFm} orphan flowModels`);

  // 4. Clean stale usage records (modelUid no longer exists)
  const usages: Record<string, unknown>[] = [];
  for (let p = 1; p <= 5; p++) {
    const r = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplateUsages:list`, { params: { pageSize: 1000, page: p } });
    const d = (r.data.data || []) as Record<string, unknown>[];
    usages.push(...d);
    if (d.length < 1000) break;
  }
  const liveUids = new Set(allFm.filter(n => reachable.has(n.uid as string)).map(n => n.uid as string));
  const staleUsages = usages.filter(u => !liveUids.has(u.modelUid as string));
  let delU = 0;
  for (const u of staleUsages) {
    try {
      await nb.http.post(`${nb.baseUrl}/api/flowModelTemplateUsages:destroy`, {}, { params: { filterByTk: u.uid as string } });
      delU++;
    } catch (e) { catchSwallow(e, 'stale usage destroy — next page continues'); }
  }
  console.log(`  deleted ${delU}/${staleUsages.length} stale usage records`);

  // 5. Delete templates whose usageCount dropped to 0
  const fresh: Record<string, unknown>[] = [];
  for (let p = 1; p <= 3; p++) {
    const r = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:list`, { params: { pageSize: 1000, page: p } });
    const d = (r.data.data || []) as Record<string, unknown>[];
    fresh.push(...d);
    if (d.length < 1000) break;
  }
  const zeroUse = fresh.filter(t => ((t.usageCount as number) || 0) === 0);
  let delT = 0;
  for (const t of zeroUse) {
    try {
      await nb.http.post(`${nb.baseUrl}/api/flowModelTemplates:destroy`, {}, { params: { filterByTk: t.uid as string } });
      delT++;
    } catch (e) { catchSwallow(e, 'zero-usage template destroy — plugin may still hold a ref'); }
  }
  console.log(`  deleted ${delT}/${zeroUse.length} zero-usage templates`);
  console.log(`  templates remaining: ${fresh.length - delT}`);
}

export async function cmdDeployAcl(args: string[]) {
  const dirArg = args[0];
  if (!dirArg) { console.error('Usage: cli.ts deploy-acl <project-dir> [--dry-run]'); process.exit(1); }
  const dir = resolveWorkspacePath(dirArg);
  const dryRun = args.includes('--dry-run');
  const nb = await NocoBaseClient.create();
  await deployAcl(nb, dir, console.log, { dryRun });
}

export async function cmdDeployWorkflows(args: string[]) {
  const dirArg = args[0];
  if (!dirArg) { console.error('Usage: cli.ts deploy-workflows <project-dir> [--copy]'); process.exit(1); }
  const dir = resolveWorkspacePath(dirArg);
  const copyMode = args.includes('--copy');
  const nb = await NocoBaseClient.create();
  // copyMode preserved for backward compat — older DeployWorkflowsOptions
  // accepted it; current type doesn't, cast silences the gap.
  await deployWorkflows(nb, dir, { copyMode } as Parameters<typeof deployWorkflows>[2]);
}
