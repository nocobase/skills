/**
 * Project-level deployer — deploy from directory structure.
 *
 * Reads:
 *   routes.yaml           → menu tree
 *   collections/*.yaml    → data models
 *   pages/<group>/<page>/ → page.yaml + layout.yaml + popups/ + js/ + charts/
 *
 * Deploy flow:
 *   1. Validate all pages
 *   2. Ensure collections
 *   3. Create routes (groups + pages)
 *   4. Deploy each page surface (blocks + layout)
 *   5. Deploy popups
 *   6. Post-verify
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
// execSync removed — git operations moved to CLI layer
import { NocoBaseClient } from '../client';
import { createDeployContext, type DeployContext } from './deploy-context';
import type { ModuleState, PageState, BlockState } from '../types/state';
import type { StructureSpec, PageSpec, BlockSpec, PopupSpec, CollectionDef, EnhanceSpec } from '../types/spec';
import { loadYaml, saveYaml, dumpYaml } from '../utils/yaml';
import { buildGraph } from '../graph/graph-builder';
import { slugify } from '../utils/slugify';
import { ensureAllCollections } from './collection-deployer';
import { deploySurface, type SurfaceOpts } from './surface-deployer';
import { deployPopup, type PopupOpts } from './popups/popup-deployer';
import { expandPopups } from './popups/popup-expander';
import { deployTemplates, cleanStaleTemplateUsages, type TemplateUidMap, type PendingPopupTemplate } from './templates/template-deployer';
import { resetAllCaches } from './cache-manager';
import { catchSwallow } from '../utils/swallow';
import { reorderTableColumns } from './column-reorder';
import { postVerify } from './post-verify';
import { rewriteWorkflowKeys, type WorkflowKeyMap } from './rewrite-workflow-keys';
import { rewriteTemplateUids } from './templates/template-uid-rewriter';
import { ensurePopupBindings } from './popups/popup-bindings';
import { extractBlockState, buildPopupTargetFields } from './blocks/block-state-extractor';
import { cleanupDuplicatePages, syncMenuOrder, syncRoutesYaml, enablePageTabs } from './routes/route-lifecycle';
import { verifySqlFromPages } from './sql-verifier';
import { discoverPages, routeKey, type RouteEntry, type PageInfo } from './page-discovery';
import { RefResolver } from '../refs';
import { pageToBlueprint } from './blueprint-converter';
import { BLOCK_TYPE_TO_MODEL } from '../utils/block-types';

export async function deployProject(
  projectDir: string,
  opts: { force?: boolean; planOnly?: boolean; group?: string; page?: string; blueprint?: boolean; incremental?: boolean; copy?: boolean } = {},
  log: (msg: string) => void = console.log,
): Promise<void> {
  const root = path.resolve(projectDir);

  // ── 1. Read project structure ──
  const routesFile = path.join(root, 'routes.yaml');
  if (!fs.existsSync(routesFile)) throw new Error(`routes.yaml not found in ${root}`);
  const routes = loadYaml<RouteEntry[]>(routesFile);

  // Pollution guard: if templates/ is wildly larger than pages/, the source
  // was probably an unscoped pull from a multi-project NocoBase. Pushing
  // would mass-create unrelated templates. Warn loudly.
  const { warnIfPolluted } = await import('../duplicate/duplicate-project');
  warnIfPolluted(root, log);

  // Normalize: default type = flowPage (group if has children)
  const normalizeRoutes = (entries: RouteEntry[]) => {
    for (const r of entries) {
      if (!r.type) r.type = r.children?.length ? 'group' : 'flowPage';
      if (r.children) normalizeRoutes(r.children);
    }
  };
  normalizeRoutes(routes);

  // Check menu icons — default icons are bad UX
  const DEFAULT_ICONS = new Set(['fileoutlined', 'appstoreoutlined', '']);
  function checkIcons(entries: RouteEntry[]) {
    for (const r of entries) {
      if (!r.icon || DEFAULT_ICONS.has(r.icon.toLowerCase())) {
        log(`  ⚠ menu "${r.title}" uses default icon — consider setting a meaningful icon`);
      }
      if (r.children) checkIcons(r.children);
    }
  }
  checkIcons(routes);

  // Read collections
  const collDefs: Record<string, CollectionDef> = {};
  const collDir = path.join(root, 'collections');
  if (fs.existsSync(collDir)) {
    for (const f of fs.readdirSync(collDir).filter(f => f.endsWith('.yaml'))) {
      const coll = loadYaml<Record<string, unknown>>(path.join(collDir, f));
      const name = (coll.name as string) || f.replace('.yaml', '');
      collDefs[name] = {
        title: (coll.title as string) || name,
        titleField: (coll.titleField as string) || undefined,
        fields: (coll.fields as CollectionDef['fields']) || [],
        triggers: (coll.triggers as CollectionDef['triggers']) || undefined,
        template: (coll.template as string) || undefined,
      };
    }
  }

  // Discover all pages from directory tree
  // --group only controls the target menu group name in NocoBase, not page file discovery
  const pagesDir = path.join(root, 'pages');
  let pages = discoverPages(pagesDir, routes);

  // Filter to single page if specified
  if (opts.page) {
    pages = pages.filter(p =>
      p.title === opts.page || p.slug === slugify(opts.page!)
    );
    if (!pages.length) {
      log(`  Page '${opts.page}' not found`);
      process.exit(1);
    }
    log(`  Deploying single page: ${pages[0].title}`);
  }

  // ── 2. Plan ──
  log('\n  ── Plan ──');
  log(`  Collections: ${Object.keys(collDefs).length}`);
  log(`  Pages: ${pages.length}`);
  for (const p of pages) {
    const blockCount = p.layout.blocks?.length || 0;
    const popupCount = p.popups.length;
    log(`    ${p.title}: ${blockCount} blocks, ${popupCount} popups`);
  }

  // Validation
  let hasError = false;
  for (const p of pages) {
    const blocks = p.layout.blocks || [];
    if (blocks.length > 2 && !p.layout.layout) {
      log(`    ✗ Page '${p.title}' has ${blocks.length} blocks but no layout`);
      hasError = true;
    }
    // Multi-tab: every tab must have a title
    const tabs = p.layout.tabs;
    if (tabs && tabs.length > 1) {
      for (let ti = 0; ti < tabs.length; ti++) {
        if (!tabs[ti].title) {
          log(`    ✗ Page '${p.title}' tab ${ti} has no title`);
          hasError = true;
        }
      }
    }
  }
  if (hasError) { log('\n  Validation failed'); process.exit(1); }

  // ── Spec validation (runs before connect — pure YAML checks) ──
  {
    const { validatePageSpecs } = await import('./spec-validator');
    const specIssues = validatePageSpecs(pages, root);
    const specErrors = specIssues.filter(i => i.level === 'error');
    const specWarnings = specIssues.filter(i => i.level === 'warn');
    if (specErrors.length) {
      // Copy-mode bypass: a workspace freshly minted by duplicate-project carries
      // every quirk of the source spec — invalid layouts, missing popup bindings,
      // orphan defaults — and the user wants to push first then iterate. Strict
      // validation blocks that. We accept --copy ONLY when a `.duplicate-source`
      // marker is present (written by duplicate-project), so generic projects
      // can't sneak around the validator by passing the flag.
      const dupMarker = path.join(root, '.duplicate-source');
      const isDupWorkspace = fs.existsSync(dupMarker);
      if (opts.copy && isDupWorkspace) {
        log('\n  ── Spec Validation ERRORS (bypassed in --copy mode) ──');
        for (const e of specErrors) log(`  ✗ [${e.page}${e.block ? '/' + e.block : ''}] ${e.message}`);
        log(`\n  ${specErrors.length} errors bypassed (--copy + .duplicate-source). ${specWarnings.length} warnings.`);
        log('  ⚠ Bypass is intentional for duplicate workspaces — fix errors before promoting to a non-duplicate workspace.');
      } else {
        log('\n  ── Spec Validation ERRORS (blocking deployment) ──');
        for (const e of specErrors) log(`  ✗ [${e.page}${e.block ? '/' + e.block : ''}] ${e.message}`);
        log(`\n  ${specErrors.length} errors, ${specWarnings.length} warnings. Fix errors before deploying.`);
        if (opts.copy && !isDupWorkspace) {
          log('  --copy was passed but .duplicate-source marker is missing — refusing bypass on a non-duplicate workspace.');
        }
        // No escape hatch outside duplicate workspaces. Deploying a spec with
        // known-bad DSL creates NocoBase state that has to be hand-cleaned later
        // (dangling blocks, silent 400s on m2o clicks, empty popup targets).
        // If an error is a false positive, fix the rule.
        process.exit(1);
      }
    }
    if (specWarnings.length) {
      log('\n  ── Spec Warnings ──');
      for (const w of specWarnings) log(`  ⚠ [${w.page}${w.block ? '/' + w.block : ''}] ${w.message}`);
    }
  }
  log('  ✓ Validation passed');

  // ── 2b. Build graph for circular ref detection ──
  const graph = buildGraph(root);
  const graphStats = graph.stats();
  if (graphStats.cycles > 0) {
    log(`  ⚠ ${graphStats.cycles} circular popup references detected — deploy will stop at cycle boundary`);
  }
  log(`  Graph: ${graphStats.nodes} nodes, ${graphStats.edges} edges`);

  // Incremental scope (computed once, used by both --plan preview and the
  // actual deploy below). state.yaml may not exist yet — peek at it.
  let incScope: import('./incremental').IncrementalScope | null = null;
  if (opts.incremental) {
    const peekStateFile = path.join(root, 'state.yaml');
    const peekState: Record<string, unknown> = fs.existsSync(peekStateFile)
      ? loadYaml<Record<string, unknown>>(peekStateFile) : {};
    const { computeIncrementalScope } = await import('./incremental');
    incScope = computeIncrementalScope(root, peekState.last_deployed_sha as string | undefined);
    log(`  ${incScope.reason}`);
    if (!incScope.full && incScope.pages) {
      const matched = pages.filter(p => incScope!.pages!.has(p.key));
      log(`  incremental preview: ${matched.length}/${pages.length} page(s) would deploy`);
      if (matched.length) log(`    [${[...incScope.pages].slice(0, 8).join(', ')}${incScope.pages.size > 8 ? ', ...' : ''}]`);
    }
  }

  if (opts.planOnly) {
    // Generate _refs.yaml in plan mode too
    const nodes = (graph as any).nodes as Map<string, any>;
    for (const [id, n] of nodes) {
      if (n.type !== 'page') continue;
      const refs = graph.pageRefs(id);
      const pageDir = path.join(root, n.meta?.dir || `pages/${n.name}`);
      if (fs.existsSync(pageDir)) {
        saveYaml(path.join(pageDir, '_refs.yaml'), {
          _generated: true, _readonly: 'Auto-generated. Edits will be overwritten.',
          ...refs,
        });
      }
    }
    return;
  }

  // ── 2c. Save state only (no git auto-commit — baseline stays clean) ──

  // ── 3. Connect + deploy ──
  const nb = await NocoBaseClient.create();
  const ctx = createDeployContext(nb, opts, log);
  // Reset per-deploy caches (m2o metadata, promoted popups, created templates)
  resetAllCaches();
  log(`\n  Connected to ${nb.baseUrl}`);

  // State
  const stateFile = path.join(root, 'state.yaml');
  const state: ModuleState = fs.existsSync(stateFile)
    ? loadYaml<ModuleState>(stateFile)
    : { pages: {} };

  // Reconcile state.yaml against live NB: state holds UIDs from the last
  // push, but NB may have been rolled back / wiped since. Dead UIDs cause
  // zombie updateModel calls later. Drop them now so deployer treats those
  // positions as "create fresh" instead of "update ghost".
  if (!opts.planOnly) {
    try {
      const { reconcileStateWithLive } = await import('./state-reconciler');
      await reconcileStateWithLive(nb, state, log);
    } catch (e) {
      log(`  . state reconcile: ${e instanceof Error ? e.message.slice(0, 80) : e} (continuing)`);
    }
  }

  // ── Incremental scope (opt-in via --incremental) ──
  // Use the scope computed earlier (during plan preview). When NOTHING
  // changed (no pages, no collections, no templates, no workflows),
  // short-circuit entirely.
  let activePages = pages;
  if (incScope && !incScope.full && incScope.pages) {
    activePages = pages.filter(p => incScope!.pages!.has(p.key));
    const nothingChanged = !activePages.length
      && !incScope.collections?.size
      && !incScope.templates?.size
      && !incScope.workflows?.size;
    if (nothingChanged) {
      log('  ✓ no DSL changes — skipping all deploy phases');
      const { getCurrentSha } = await import('./incremental');
      const sha = getCurrentSha(root);
      if (sha) (state as Record<string, unknown>).last_deployed_sha = sha;
      saveYaml(stateFile, state);
      log('  State saved. Done.');
      return;
    }
    log(`  incremental: deploying ${activePages.length}/${pages.length} page(s)`);
  }

  // (removed) copy-mode state reset. Use `cli duplicate-project` to produce
  // a DSL with fresh UIDs + no state.yaml; deploy then creates everything
  // from scratch without any runtime state-rewriting.

  // Collections (skip when single-page deploy; with incremental, narrow to
  // changed collections only).
  const skipCollPhase = incScope ? !incScope.collections?.size : false;
  if (!opts.page && !skipCollPhase) {
    const collFilter = incScope?.collections && !incScope.full ? incScope.collections : undefined;
    if (collFilter) {
      log(`  incremental: ${collFilter.size} collection(s) targeted: ${[...collFilter].slice(0, 6).join(', ')}${collFilter.size > 6 ? ', ...' : ''}`);
    }
    await ensureAllCollections(nb, collDefs, log, collFilter);
  } else if (skipCollPhase) {
    log('  ✓ collections phase skipped (no collections/*.yaml changes)');
  }

  // Deploy workflows BEFORE templates+pages so the source-key → live-key map
  // is available when we rewrite `workflowKey:` references in page DSL.
  // After duplicate-project, every workflow gets a fresh NB key — pages still
  // hold the source key from pull time, so without this rewrite the Copy
  // would trigger the source CRM's workflow (cross-project pollution).
  let wfKeyMap: WorkflowKeyMap = new Map();
  const skipWfEarly = incScope ? !incScope.workflows?.size : false;
  if (skipWfEarly) {
    log('  ✓ workflows phase skipped (no workflows/ changes)');
  } else if (fs.existsSync(path.join(root, 'workflows'))) {
    try {
      const { deployWorkflows } = await import('../workflow/workflow-deployer');
      log('\n  ── Workflows ──');
      wfKeyMap = await deployWorkflows(nb, root, { log });
    } catch (e) {
      log(`  ! workflows: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
    }
  }

  // Deploy templates (before pages, so popupTemplateUid can be mapped)
  let templateUidMap: TemplateUidMap = new Map();
  let pendingPopups: PendingPopupTemplate[] = [];
  const skipTpl = incScope ? !incScope.templates?.size : false;
  if (!opts.page && !skipTpl) {
    const tplResult = await deployTemplates(nb, root, log, state.template_uids);
    templateUidMap = tplResult.uidMap;
    pendingPopups = tplResult.pendingPopupTemplates;
    // Persist template UIDs to state for next deploy
    state.template_uids = { ...(state.template_uids || {}), ...tplResult.deployedTemplates } as typeof state.template_uids;
    saveYaml(stateFile, state);
  } else if (skipTpl) {
    log('  ✓ templates phase skipped (no templates/ changes)');
    // Reuse previously persisted template UIDs so page deploy can still resolve refs
    if (state.template_uids) {
      for (const [k, v] of Object.entries(state.template_uids)) {
        templateUidMap.set(k, v as string);
      }
    }
  }

  // For pending popup templates: expand their content inline into the first referencing popup

  // Build name→{uid,targetUid} map from live templates so DSL `ref:` blocks
  // that omit `uid`/`targetUid` (freshly authored templates with only `name`)
  // can still be wired up to the right live template at deploy time.
  const templateNameMap = new Map<string, string>();
  const templateNameToTarget = new Map<string, string>();
  try {
    const resp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:list`, { params: { pageSize: 200 } });
    for (const t of resp.data?.data || []) {
      if (t.name && t.uid) templateNameMap.set(t.name, t.uid);
      if (t.name && t.targetUid) templateNameToTarget.set(t.name, t.targetUid);
    }
  } catch (e) { catchSwallow(e, 'name→uid template map: flowModelTemplates:list unavailable, rewrites fall back to uid-only'); }

  // Rewrite template UIDs in page specs (old exported UIDs → new deployed UIDs)
  rewriteTemplateUids(pages, templateUidMap, templateNameMap, templateNameToTarget);

  // Rewrite `workflowKey:` references using the source-key → live-key map
  // built during workflow deploy (no-op when source CRM redeploys; rewrites
  // for Copy pushes where workflow keys changed).
  if (wfKeyMap.size) {
    const rewroteCount = rewriteWorkflowKeys(pages, wfKeyMap);
    if (rewroteCount) log(`  rewrote ${rewroteCount} workflowKey ref(s) in page DSL`);
  }

  // Routes + pages.
  // DSL is the source of truth — title controls display, key controls identity.
  // `--group <key>` filters to a single top-level route subtree.
  state.group_ids = state.group_ids || {};
  const deployedKeys = new Set<string>();
  for (const routeEntry of routes) {
    const rkey = routeKey(routeEntry);
    if (opts.group && rkey !== opts.group) continue;
    if (routeEntry.type === 'group') {
      if (deployedKeys.has(rkey)) continue;
      deployedKeys.add(rkey);
      // Swap state.group_id to the per-route group id so deployGroup reuses the correct id
      state.group_id = state.group_ids[rkey];
      await deployGroup(ctx, routeEntry, activePages, state, root, opts.blueprint || false);
      if (state.group_id) state.group_ids[rkey] = state.group_id;
    } else if (routeEntry.type === 'flowPage') {
      const pageInfo = activePages.find(p => p.key === rkey);
      if (pageInfo) {
        try { await deployOnePage(ctx, pageInfo, state, null); }
        catch (e) {
          const err = e as any;
          const apiData = err.response?.data ? ` body=${JSON.stringify(err.response.data).slice(0, 300)}` : '';
          const apiUrl = err.response?.config?.url ? ` [${err.response.config.method} ${err.response.config.url}]` : (err.config?.url ? ` [${err.config.method} ${err.config.url}]` : '');
          log(`  ✗ page ${pageInfo.title}: ${err.message || e}${apiUrl}${apiData}`);
          if (process.env.NB_DEBUG) {
            log(`    [debug] err keys: ${Object.keys(err || {}).join(',') || '(none)'}`);
            log(`    [debug] err.status=${err.status} err.code=${err.code} err.name=${err.name} isAxios=${err.isAxiosError}`);
            if (err.response) log(`    [debug] resp status=${err.response.status} url=${err.response.config?.url}`);
            log(`    [debug] stack: ${(err.stack || '').split('\n').slice(0, 6).join(' || ')}`);
          }
        }
      }
    }
  }

  // Final column reorder
  for (const p of activePages) {
    const pageKey = p.key;
    const pageState = state.pages[pageKey];
    for (const bs of p.layout.blocks || []) {
      if (bs.type !== 'table') continue;
      const blockUid = pageState?.blocks?.[bs.key]?.uid;
      const specFields = (bs.fields || []).map(f => typeof f === 'string' ? f : f.field || '').filter(Boolean);
      if (blockUid && specFields.length) {
        const jsKeys = (bs.js_columns || []).map((j: any) => j.key as string);
        const colOrder = (bs as any).column_order as string[] | undefined;
        await reorderTableColumns(nb, blockUid, specFields, jsKeys, colOrder);
      }
    }
  }

  // Capture HEAD SHA so the next --incremental push can compute a diff.
  if (opts.incremental) {
    const { getCurrentSha } = await import('./incremental');
    const sha = getCurrentSha(root);
    if (sha) (state as Record<string, unknown>).last_deployed_sha = sha;
  }

  // Save state
  saveYaml(stateFile, state);
  log('\n  State saved. Done.');

  // Post-verify — replace $SELF in popup targets before verification
  const allPopups = pages.flatMap(p =>
    p.popups.map(ps => ({
      ...ps,
      target: ps.target.replace('$SELF', `$${p.key}`),
    })),
  );
  const structure: StructureSpec = { module: path.basename(root), collections: collDefs, pages: pages.map(p => p.layout) };
  const enhance: EnhanceSpec = { popups: allPopups };
  const resolver = new RefResolver(state);
  const pv = await postVerify(nb, structure, enhance, state, allPopups, ref => resolver.resolveUid(ref));
  if (pv.errors.length) {
    log('\n  ── Post-deploy errors ──');
    for (const e of pv.errors) log(`  ✗ ${e}`);
  }
  if (pv.warnings.length) {
    log('\n  ── Hints ──');
    for (const w of pv.warnings) log(`  💡 ${w}`);
  }

  // (removed) Runtime convertPopupToTemplate loop. Was used in --copy mode to
  // auto-promote inline popups into shared templates with per-deploy UIDs.
  // Replaced by explicit DSL transformation: use `cli duplicate-project` to
  // produce an isolated DSL with new UIDs, then `cli push` deploys it as-is.
  // Inline popups stay inline; templated popups stay templated; conversion
  // (when needed) is an offline DSL operation, not runtime magic.

  // Ensure popup template blocks have binding: 'currentRecord' (for edit/detail popups)
  await ensurePopupBindings(nb, state, log);

  // Re-run m2o popup binding on all page blocks (popup templates may not have existed during fillBlock)
  log(`\n  ── Post-deploy: m2o popup binding ──`);
  const { enableM2oClickToOpen } = await import('./blocks/block-filler');
  for (const [pageKey, pageState] of Object.entries(state.pages)) {
    const pageInfo = pages.find(p => p.key === pageKey);
    if (!pageInfo) continue;
    const blockColl = pageInfo.layout?.coll as string || '';

    // Main page blocks
    for (const [, blockInfo] of Object.entries(pageState.blocks || {})) {
      if (!blockInfo.uid) continue;
      if (blockColl) {
        await enableM2oClickToOpen(nb, blockInfo.uid, blockColl, pageInfo.dir, log);
      }
    }

    // Popup blocks (nested m2o fields need their own binding — e.g., the `table`
    // m2o field inside a reservation detail popup needs clickToOpen too)
    for (const [, popupInfo] of Object.entries((pageState as any).popups || {})) {
      for (const [, popupBlock] of Object.entries((popupInfo as any).blocks || {})) {
        const pbInfo = popupBlock as { uid?: string; type?: string };
        if (!pbInfo.uid) continue;
        // Use the popup's coll (fallback to page coll for self-referencing details)
        const popupColl = ((popupInfo as any).coll as string) || blockColl;
        if (popupColl) {
          await enableM2oClickToOpen(nb, pbInfo.uid, popupColl, pageInfo.dir, log);
        }
      }
    }
  }

  // SQL verify
  const sqlResult = await verifySqlFromPages(nb, pages);
  log(`\n  ── SQL Verification: ${sqlResult.passed} passed, ${sqlResult.failed} failed ──`);
  for (const r of sqlResult.results) {
    if (!r.ok) log(`  ✗ ${r.label}: ${r.error}`);
  }

  // Data verification is now a separate step: npx tsx cli/cli.ts verify-data <dir>
  // Deploy no longer blocks on missing/broken test data — AI inserts data after deploy,
  // then runs verify-data as a separate validation pass.

  // Set menu sort to match routes.yaml declaration order
  await syncMenuOrder(nb, state, routes, log);

  // Persist UIDs created during this deploy so a future rollback can remove them.
  // We do NOT auto-delete here — a user's manually created template may be 0-usage
  // but legitimate. Cleanup happens only via explicit `rollback` CLI command.
  const { listCreatedThisRun } = await import('./templates/template-deployer');
  const createdUids = listCreatedThisRun();
  if (createdUids.length) {
    (state as any)._last_deploy_created_templates = createdUids;
  } else {
    delete (state as any)._last_deploy_created_templates;
  }

  saveYaml(stateFile, state);

  // Auto-clean stale flowModelTemplateUsages rows. This is the NocoBase bug
  // that makes template counts accumulate indefinitely — usage rows don't get
  // cascade-deleted when their flowModel is destroyed. Cheap operation (no-op
  // when nothing is stale), so runs unconditionally to keep the DB tidy.
  await cleanStaleTemplateUsages(nb, log);

  // (Workflows now deploy BEFORE templates+pages — see "Deploy workflows
  // BEFORE templates+pages" above. Position matters because page DSL
  // `workflowKey:` references must be rewritten before pages compose.)

  // (removed) Auto-sync routes.yaml from live state. Push is one-way DSL→NB
  // per PHILOSOPHY.md — overwriting the DSL with mid-deploy state has bitten
  // us when a push is killed and the partial sync truncates routes.yaml,
  // making the next push deploy LESS than the previous. Use `cli pull` to
  // explicitly reconcile from live.

  // Rebuild graph + _refs.yaml after sync
  try {
    const freshGraph = buildGraph(root);
    const gNodes = (freshGraph as any).nodes as Map<string, any>;
    let refsCount = 0;
    for (const [, n] of gNodes) {
      if (n.type !== 'page') continue;
      const refs = freshGraph.pageRefs(n.id || '');
      const pageDir = path.join(root, n.meta?.dir || `pages/${n.name}`);
      if (fs.existsSync(pageDir)) {
        saveYaml(path.join(pageDir, '_refs.yaml'), {
          _generated: true, _readonly: 'Auto-generated. Edits will be overwritten.',
          ...refs,
        });
        refsCount++;
      }
    }
    saveYaml(path.join(root, '_graph.yaml'), { stats: freshGraph.stats(), ...freshGraph.toJSON() });
    log(`  ✓ Graph: ${freshGraph.stats().nodes} nodes, ${refsCount} _refs.yaml`);
  } catch (e) {
    log(`  ! Graph rebuild: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }

  // Post-deploy git sync is handled by CLI (cmdDeployProject → deploy-sync worktree)
}

// ── Template UID rewriting ──

/**
 * Rewrite old exported template UIDs in page specs to match deployed UIDs.
 * Handles two cases:
 *   1. templateRef.templateUid — block reference specs
 *   2. popupSettings.popupTemplateUid — field popup specs
 */
// Template UID rewriting: see ./template-uid-rewriter.ts
// (pre-deploy pass that remaps DSL UIDs → live UIDs across pages/popups/tabs)

// ── Git helpers ──

// (gitSnapshot / gitDiff removed — using worktree-based diff now)

async function deployGroup(
  ctx: DeployContext,
  routeEntry: RouteEntry,
  pages: PageInfo[],
  state: ModuleState,
  root: string,
  useBlueprint = false,
): Promise<void> {
  const { nb, log } = ctx;
  // Blueprint mode: let applyBlueprint create navigation + pages in one call
  if (useBlueprint) {
    // Ensure group exists — find existing by title first, create only if not found
    if (!state.group_id) {
      const liveRoutes = await nb.http.get(`${nb.baseUrl}/api/desktopRoutes:list`, { params: { paginate: 'false', tree: 'true' } });
      const existingGroup = (liveRoutes.data.data || []).find((r: any) => r.type === 'group' && r.title === routeEntry.title);
      if (existingGroup) {
        state.group_id = existingGroup.id;
        log(`  ⚠ group "${routeEntry.title}" already exists in NocoBase — adopting it (state was empty for key "${routeKey(routeEntry)}").`);
        log(`     If this DSL is meant to be SEPARATE from that live group, change the title in routes.yaml or use a different key.`);
        log(`  = group: ${routeEntry.title} (found existing)`);
      } else {
        const result = await nb.createGroup(routeEntry.title, routeEntry.icon || 'appstoreoutlined');
        state.group_id = result.routeId;
        log(`  + group: ${routeEntry.title}`);
      }
      nb.routes.clearCache();
    } else {
      log(`  = group: ${routeEntry.title}`);
    }

    const stateFile = path.join(root, 'state.yaml');
    const children = routeEntry.children || [];
    for (let ci = 0; ci < children.length; ci++) {
      const child = children[ci];
      if (child.type === 'flowPage') {
        const pageInfo = pages.find(p => p.key === routeKey(child));
        if (pageInfo) {
          await deployPageBlueprint(ctx, pageInfo, state, state.group_id!, routeEntry.title);
          // Set sort to match declaration order
          const pageKey = pageInfo.key;
          const routeId = (state.pages[pageKey] as Record<string, unknown>)?.route_id as number | undefined;
          if (routeId) {
            await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`, { sort: ci + 1 }, { params: { 'filter[id]': routeId } }).catch(() => {});
          }
          saveYaml(stateFile, state);
        }
      } else if (child.type === 'group') {
        const subGroupKey = `_subgroup_${routeKey(child)}`;
        let subGroupId = (state as unknown as Record<string, unknown>)[subGroupKey] as number | undefined;
        if (!subGroupId) {
          const result = await nb.createGroup(child.title, child.icon || 'folderoutlined', state.group_id!);
          subGroupId = result.routeId;
          (state as unknown as Record<string, unknown>)[subGroupKey] = subGroupId;
          log(`  + sub-group: ${child.title}`);
        } else {
          log(`  = sub-group: ${child.title}`);
        }
        // Set sort on sub-group to match declaration order
        await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`, { sort: ci + 1 }, { params: { 'filter[id]': subGroupId } }).catch(() => {});
        const subChildren = child.children || [];
        for (let si = 0; si < subChildren.length; si++) {
          const sc = subChildren[si];
          const pageInfo = pages.find(p => p.key === routeKey(sc));
          if (pageInfo) {
            await deployPageBlueprint(ctx, pageInfo, state, subGroupId, child.title);
            // Set sort on sub-group child
            const pageKey = pageInfo.key;
            const routeId = (state.pages[pageKey] as Record<string, unknown>)?.route_id as number | undefined;
            if (routeId) {
              await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`, { sort: si + 1 }, { params: { 'filter[id]': routeId } }).catch(() => {});
            }
            saveYaml(stateFile, state);
          }
        }
      }
    }
    return;
  }

  // Legacy mode: multi-step deploy — find existing group first
  if (!state.group_id) {
    const liveRoutes = await nb.http.get(`${nb.baseUrl}/api/desktopRoutes:list`, { params: { paginate: 'false', tree: 'true' } });
    const existingGroup = (liveRoutes.data.data || []).find((r: any) => r.type === 'group' && r.title === routeEntry.title);
    if (existingGroup) {
      state.group_id = existingGroup.id;
      log(`  ⚠ group "${routeEntry.title}" already exists in NocoBase — adopting it (state was empty for key "${routeKey(routeEntry)}").`);
      log(`     If this DSL is meant to be SEPARATE from that live group, change the title in routes.yaml or use a different key.`);
      log(`  = group: ${routeEntry.title} (found existing)`);
    } else {
      const result = await nb.createGroup(routeEntry.title, routeEntry.icon || 'appstoreoutlined');
      state.group_id = result.routeId;
      log(`  + group: ${routeEntry.title}`);
    }
    nb.routes.clearCache();
  } else {
    log(`  = group: ${routeEntry.title}`);
  }

  const legacyStateFile = path.join(root, 'state.yaml');
  const legacyChildren = routeEntry.children || [];
  for (let ci = 0; ci < legacyChildren.length; ci++) {
    const child = legacyChildren[ci];
    if (child.type === 'flowPage') {
      const pageInfo = pages.find(p => p.title === child.title);
      if (pageInfo) {
        try {
          await deployOnePage(ctx, pageInfo, state, state.group_id!);
        } catch (e) {
          const err = e as any;
          const apiData = err.response?.data ? ` body=${JSON.stringify(err.response.data).slice(0, 300)}` : '';
          const apiUrl = err.response?.config?.url ? ` [${err.response.config.method} ${err.response.config.url}]` : (err.config?.url ? ` [${err.config.method} ${err.config.url}]` : '');
          log(`  ✗ page ${pageInfo.title}: ${err.message || e}${apiUrl}${apiData}`);
          if (process.env.NB_DEBUG) {
            log(`    [debug] keys: ${Object.keys(err || {}).join(',') || '(none)'}`);
            log(`    [debug] stack: ${(err.stack || '').split('\n').slice(0, 6).join(' || ')}`);
          }
        }
        // Set sort to match declaration order
        const pageKey = pageInfo.key;
        const routeId = (state.pages[pageKey] as Record<string, unknown>)?.route_id as number | undefined;
        if (routeId) {
          await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`, { sort: ci + 1 }, { params: { 'filter[id]': routeId } }).catch(() => {});
        }
        saveYaml(legacyStateFile, state);
      }
    } else if (child.type === 'group') {
      const subGroupKey = `_subgroup_${routeKey(child)}`;
      let subGroupId = (state as unknown as Record<string, unknown>)[subGroupKey] as number | undefined;
      if (!subGroupId) {
        const result = await nb.createGroup(child.title, child.icon || 'folderoutlined', state.group_id!);
        subGroupId = result.routeId;
        (state as unknown as Record<string, unknown>)[subGroupKey] = subGroupId;
        log(`  + sub-group: ${child.title}`);
      } else {
        log(`  = sub-group: ${child.title}`);
      }
      // Set sort on sub-group
      await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`, { sort: ci + 1 }, { params: { 'filter[id]': subGroupId } }).catch(() => {});
      const subChildren = child.children || [];
      for (let si = 0; si < subChildren.length; si++) {
        const sc = subChildren[si];
        const pageInfo = pages.find(p => p.title === sc.title);
        if (pageInfo) {
          try { await deployOnePage(ctx, pageInfo, state, subGroupId); }
          catch (e) {
          const err = e as any;
          const apiData = err.response?.data ? ` body=${JSON.stringify(err.response.data).slice(0, 300)}` : '';
          const apiUrl = err.response?.config?.url ? ` [${err.response.config.method} ${err.response.config.url}]` : (err.config?.url ? ` [${err.config.method} ${err.config.url}]` : '');
          log(`  ✗ page ${pageInfo.title}: ${err.message || e}${apiUrl}${apiData}`);
          if (process.env.NB_DEBUG) {
            log(`    [debug] err keys: ${Object.keys(err || {}).join(',') || '(none)'}`);
            log(`    [debug] err.status=${err.status} err.code=${err.code} err.name=${err.name} isAxios=${err.isAxiosError}`);
            if (err.response) log(`    [debug] resp status=${err.response.status} url=${err.response.config?.url}`);
            log(`    [debug] stack: ${(err.stack || '').split('\n').slice(0, 6).join(' || ')}`);
          }
        }
          // Set sort on sub-group child
          const pageKey = pageInfo.key;
          const routeId = (state.pages[pageKey] as Record<string, unknown>)?.route_id as number | undefined;
          if (routeId) {
            await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`, { sort: si + 1 }, { params: { 'filter[id]': routeId } }).catch(() => {});
          }
          saveYaml(legacyStateFile, state);
        }
      }
    }
  }
}

async function deployOnePage(
  ctx: DeployContext,
  pageInfo: PageInfo,
  state: ModuleState,
  parentRouteId: number | null,
): Promise<void> {
  const { nb, log } = ctx;
  const pageKey = pageInfo.key;
  let pageState = state.pages[pageKey];

  if (!pageState?.tab_uid) {
    // Check live routes before creating — prevents duplicates on repeated deploy
    if (parentRouteId) {
      try {
        const liveRoutes = await nb.http.get(`${nb.baseUrl}/api/desktopRoutes:list`, { params: { paginate: 'false', tree: 'true' } });
        const allGroups = (liveRoutes.data.data || []) as any[];
        const parentGroup = allGroups.find((r: any) => r.id === parentRouteId);
        if (parentGroup?.children) {
          const livePage = parentGroup.children.find((c: any) => c.title === pageInfo.title && c.type !== 'tabs');
          if (livePage?.schemaUid) {
            // Found existing — read tab UID and reuse
            let tabUid = '';
            let gridUid = '';
            try {
              const pageData = await nb.get({ pageSchemaUid: livePage.schemaUid });
              const tabs = pageData.tree.subModels?.tabs;
              const tabArr = Array.isArray(tabs) ? tabs : tabs ? [tabs] : [];
              if (tabArr.length) {
                const firstTab = tabArr[0] as Record<string, unknown>;
                tabUid = firstTab.uid as string || '';
                const tabGrid = (firstTab.subModels as Record<string, unknown> | undefined)?.grid as Record<string, unknown> | undefined;
                gridUid = (tabGrid?.uid as string) || '';
              }
            } catch (e) { catchSwallow(e, 'live page read for tab/grid uid: schema malformed or API drift — falls through to createPage'); }
            if (tabUid) {
              pageState = {
                route_id: livePage.id,
                page_uid: livePage.schemaUid,
                tab_uid: tabUid,
                grid_uid: gridUid,
                blocks: {},
              };
              log(`  = page: ${pageInfo.title} (found live)`);
            }
          }
        }
      } catch (e) { catchSwallow(e, 'live-route lookup before createPage: tolerate and fall through to create'); }
    }
    if (!pageState?.tab_uid) {
      const result = await nb.createPage(pageInfo.title, parentRouteId ?? undefined, pageInfo.icon);
      pageState = {
        route_id: result.routeId,
        page_uid: result.pageUid,
        tab_uid: result.tabSchemaUid,
        grid_uid: result.gridUid,
        blocks: {},
      };
      log(`  + page: ${pageInfo.title}`);
    }
  } else {
    log(`  = page: ${pageInfo.title}`);
  }

  // Build popup target fields so click-to-open skips content for fields handled by popup YAML
  const popupTargetFields = buildPopupTargetFields(pageInfo.popups);

  // Deploy surface — handle multi-tab pages
  const tabs = pageInfo.layout.tabs;
  if (tabs && tabs.length > 1) {
    // Multi-tab: deploy first tab to main tabSchemaUid
    const firstTabDir = path.join(pageInfo.dir, `tab_${slugify(tabs[0].title || 'tab0')}`);
    // Deep-clone layout to avoid stale references (blueprint converter may have mutated shared refs)
    const firstTabLayout = JSON.parse(JSON.stringify(tabs[0].layout || pageInfo.layout.layout || null));
    const firstTabSpec = { ...pageInfo.layout, blocks: tabs[0].blocks || [], layout: firstTabLayout };
    const firstBlocks = await deploySurface(
      ctx, pageState.tab_uid, firstTabSpec,
      { modDir: fs.existsSync(firstTabDir) ? firstTabDir : pageInfo.dir, existingState: pageState.blocks, popupTargetFields },
    );
    pageState.blocks = firstBlocks;

    // Create + deploy additional tabs — check existing first
    if (!pageState.tab_states) pageState.tab_states = {};

    await enablePageTabs(nb, pageState.route_id!, pageState.page_uid!, log);

    // Sync first tab: title, icon, hidden=true (default tab is hidden in enableTabs mode)
    const firstTabTitle = tabs[0].title || '';
    const firstTabIcon = (tabs[0] as unknown as Record<string, unknown>).icon as string || '';
    try {
      await nb.updateModel(pageState.tab_uid, {
        pageTabSettings: { title: { title: firstTabTitle } },
      });
      const allRoutes = await nb.http.get(`${nb.baseUrl}/api/desktopRoutes:list`, { params: { pageSize: 500 } });
      const tabRoute = (allRoutes.data.data || []).find(
        (r: any) => r.schemaUid === pageState.tab_uid && r.type === 'tabs',
      );
      if (tabRoute) {
        const routeUpdate: Record<string, unknown> = { title: firstTabTitle, hidden: true };
        if (firstTabIcon) routeUpdate.icon = firstTabIcon;
        await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`,
          routeUpdate,
          { params: { 'filter[id]': tabRoute.id } },
        );
      }
    } catch (e) {
      log(`    ! tab rename: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    }

    // Read existing tabs from live page
    let existingLiveTabs: { uid: string; title: string }[] = [];
    try {
      const pageData = await nb.get({ uid: pageState.page_uid! });
      const rawTabs = pageData.tree.subModels?.tabs;
      const tabArr = (Array.isArray(rawTabs) ? rawTabs : rawTabs ? [rawTabs] : []) as unknown as Record<string, unknown>[];
      existingLiveTabs = tabArr.map((t, i) => ({
        uid: t.uid as string || '',
        title: ((t.stepParams as Record<string, unknown>)?.pageTabSettings as Record<string, unknown>)
          ?.title as Record<string, unknown>
          ? (((t.stepParams as Record<string, unknown>)?.pageTabSettings as Record<string, unknown>)?.title as Record<string, unknown>)?.title as string || `Tab${i}`
          : (t.props as Record<string, unknown>)?.title as string || `Tab${i}`,
      }));
    } catch (e) {
      log(`    ! read live tabs: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    }

    for (let ti = 1; ti < tabs.length; ti++) {
      const tabTitle = tabs[ti].title || `Tab${ti}`;
      const tabSlug = slugify(tabTitle);
      const tabDir = path.join(pageInfo.dir, `tab_${tabSlug}`);

      let tabState = (pageState.tab_states as Record<string, { tab_uid: string; blocks: Record<string, BlockState> }>)[tabSlug];
      if (!tabState?.tab_uid) {
        // Check if a live tab with matching title/slug exists
        const existingTab = existingLiveTabs.find((t, i) => i > 0 && (slugify(t.title) === tabSlug || t.title === tabTitle));
        if (existingTab) {
          tabState = { tab_uid: existingTab.uid, blocks: {} };
          log(`    = tab: ${tabTitle} (found existing)`);
        } else {
          try {
            const result = await nb.surfaces.addTab(pageState.page_uid!, tabTitle);
            const r = result as Record<string, unknown>;
            const tabUid = (r.tabSchemaUid || r.tabUid || r.uid || '') as string;
            tabState = { tab_uid: tabUid, blocks: {} };
            // Also update route title
            const tabRouteId = r.tabRouteId as number;
            if (tabRouteId) {
              try {
                const tabIcon = (tabs[ti] as unknown as Record<string, unknown>).icon as string || '';
                const routeUpdate: Record<string, unknown> = { title: tabTitle };
                if (tabIcon) routeUpdate.icon = tabIcon;
                await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`,
                  routeUpdate,
                  { params: { 'filter[id]': tabRouteId } },
                );
              } catch (e) {
                log(`    ! tab route title: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
              }
            }
            log(`    + tab: ${tabTitle}`);
          } catch (e) {
            log(`    ! tab ${tabTitle}: ${e instanceof Error ? e.message : e}`);
            continue;
          }
        }
      } else {
        log(`    = tab: ${tabTitle}`);
      }

      const tabSpec = { blocks: tabs[ti].blocks, layout: tabs[ti].layout ? JSON.parse(JSON.stringify(tabs[ti].layout)) : undefined };
      const tabBlocks = await deploySurface(
        ctx, tabState.tab_uid, tabSpec as any,
        { modDir: fs.existsSync(tabDir) ? tabDir : pageInfo.dir, existingState: tabState.blocks, popupTargetFields },
      );
      tabState.blocks = tabBlocks;
      (pageState.tab_states as Record<string, unknown>)[tabSlug] = tabState;
    }
  } else {
    // Single tab
    const blocksState = await deploySurface(
      ctx, pageState.tab_uid, pageInfo.layout,
      { modDir: pageInfo.dir, existingState: pageState.blocks, popupTargetFields },
    );
    pageState.blocks = blocksState;
  }
  state.pages[pageKey] = pageState;

  // Deploy popups
  await deployPagePopups(ctx, pageInfo, state, pageKey);
}

/**
 * Deploy a page using flowSurfaces:applyBlueprint — single API call for entire page.
 *
 * Creates navigation + page + all tabs + blocks + fields + actions + layout + assets.
 * Falls back to legacy deployOnePage if blueprint fails (e.g. unsupported block types).
 */
async function deployPageBlueprint(
  ctx: DeployContext,
  pageInfo: PageInfo,
  state: ModuleState,
  groupId: number,
  groupTitle: string,
): Promise<void> {
  const { nb, log } = ctx;
  const pageKey = pageInfo.key;
  let pageState = state.pages[pageKey];

  // Always check live routes for existing page — prevents duplicates on repeated deploy
  // (covers both "not in state" and "stale state" cases)
  const findLivePage = async (): Promise<{ id: number; schemaUid: string; tabUid: string } | null> => {
    try {
      const liveRoutes = await nb.http.get(`${nb.baseUrl}/api/desktopRoutes:list`, { params: { paginate: 'false', tree: 'true' } });
      const allGroups = (liveRoutes.data.data || []) as any[];
      // Search in the target group (by id or title) and also recurse into sub-groups
      const liveGroup = allGroups.find((r: any) => r.id === groupId || (r.type === 'group' && r.title === groupTitle));
      if (!liveGroup?.children) return null;
      // Search direct children and sub-group children
      const candidates: any[] = [];
      for (const child of liveGroup.children) {
        if (child.title === pageInfo.title && child.type !== 'tabs') candidates.push(child);
        if (child.type === 'group' && child.children) {
          for (const sub of child.children) {
            if (sub.title === pageInfo.title && sub.type !== 'tabs') candidates.push(sub);
          }
        }
      }
      if (!candidates.length) return null;
      // Use the latest one (highest id) if duplicates exist
      candidates.sort((a: any, b: any) => (b.id || 0) - (a.id || 0));
      const livePage = candidates[0];
      if (!livePage?.schemaUid) return null;
      // Read tab UID
      let tabUid = '';
      try {
        const pageData = await nb.get({ pageSchemaUid: livePage.schemaUid });
        const tabs = pageData.tree.subModels?.tabs;
        const tabArr = Array.isArray(tabs) ? tabs : tabs ? [tabs] : [];
        if (tabArr.length) tabUid = (tabArr[0] as Record<string, unknown>).uid as string || '';
      } catch (e) { catchSwallow(e, 'blueprint page tab read: tabUid stays empty, caller falls back'); }
      return { id: livePage.id, schemaUid: livePage.schemaUid, tabUid };
    } catch (e) { catchSwallow(e, 'blueprint candidate search: no match is normal on first deploy'); return null; }
  };

  if (!pageState?.page_uid) {
    const existing = await findLivePage();
    if (existing) {
      state.pages[pageKey] = { route_id: existing.id, page_uid: existing.schemaUid, tab_uid: existing.tabUid, blocks: {} };
      pageState = state.pages[pageKey];
      log(`  = page: ${pageInfo.title} (found live)`);
    }
  }

  // If page already exists in state, use replace mode
  const isReplace = !!pageState?.page_uid;

  const blueprint = pageToBlueprint(pageInfo, {
    groupId: isReplace ? undefined : groupId,
    groupTitle: isReplace ? undefined : groupTitle,
    mode: isReplace ? 'replace' : 'create',
    pageSchemaUid: isReplace ? pageState.page_uid : undefined,
  });

  try {
    let bpPayload = blueprint as unknown as Record<string, unknown>;
    let result: Record<string, unknown>;
    try {
      result = await nb.surfaces.applyBlueprint(bpPayload) as Record<string, unknown>;
    } catch (bpErr) {
      const msg = (bpErr as { response?: { data?: { errors?: { message: string }[] } } }).response?.data?.errors?.[0]?.message || '';
      if (isReplace && msg.includes('target not found')) {
        // Stale page_uid — page was deleted externally. Re-check live routes before creating.
        log(`  . blueprint replace failed (stale UID), checking live routes...`);
        delete state.pages[pageKey];
        const liveExisting = await findLivePage();
        if (liveExisting) {
          // Found a live page — use replace mode with the live UID
          log(`  . found existing page in live routes, using replace mode`);
          state.pages[pageKey] = { route_id: liveExisting.id, page_uid: liveExisting.schemaUid, tab_uid: liveExisting.tabUid, blocks: {} };
          bpPayload = pageToBlueprint(pageInfo, { mode: 'replace', pageSchemaUid: liveExisting.schemaUid }) as unknown as Record<string, unknown>;
        } else {
          bpPayload = pageToBlueprint(pageInfo, { groupId, groupTitle, mode: 'create' }) as unknown as Record<string, unknown>;
        }
        result = await nb.surfaces.applyBlueprint(bpPayload) as Record<string, unknown>;
      } else {
        throw bpErr;
      }
    }
    const target = (result.target || {}) as Record<string, unknown>;
    const pageSchemaUid = (target.pageSchemaUid || '') as string;
    const pageUid = (target.pageUid || '') as string;

    log(`  ${isReplace ? '~' : '+'} page (blueprint): ${pageInfo.title}`);

    // Read back page structure + run deploySurface sync for each tab
    if (pageSchemaUid) {
      // Build popup target fields so click-to-open skips content for fields handled by popup YAML
      const popupTargetFields = buildPopupTargetFields(pageInfo.popups);

      const pageData = await nb.get({ pageSchemaUid });
      const tree = pageData.tree;
      const liveTabs = tree.subModels?.tabs;
      const liveTabArr = Array.isArray(liveTabs) ? liveTabs : liveTabs ? [liveTabs] : [];

      const specTabs = pageInfo.layout.tabs;
      const isMultiTab = specTabs && specTabs.length > 1;

      const firstTabUid = liveTabArr.length
        ? (liveTabArr[0] as unknown as Record<string, unknown>).uid as string || ''
        : '';

      state.pages[pageKey] = {
        route_id: (target.routeId || 0) as number,
        page_uid: pageUid || pageSchemaUid,
        tab_uid: firstTabUid,
        blocks: {},
      };

      // Process each tab
      const tabCount = isMultiTab ? specTabs.length : 1;
      for (let ti = 0; ti < tabCount && ti < liveTabArr.length; ti++) {
        const liveTab = liveTabArr[ti] as unknown as Record<string, unknown>;
        const tabUid = liveTab.uid as string || '';
        const tabSpec = isMultiTab
          ? { blocks: specTabs[ti].blocks, layout: specTabs[ti].layout } as any
          : pageInfo.layout;
        const tabDir = isMultiTab
          ? (() => {
              const tslug = slugify(specTabs[ti].title || '');
              const td = path.join(pageInfo.dir, `tab_${tslug}`);
              return fs.existsSync(td) ? td : pageInfo.dir;
            })()
          : pageInfo.dir;

        // Extract existing block UIDs from live tab
        const existingBlocks = extractBlockState(liveTab, tabSpec.blocks || []);

        const blocksState = await deploySurface(
          ctx, tabUid, tabSpec,
          { modDir: tabDir, existingState: existingBlocks, popupTargetFields },
        );

        if (ti === 0) {
          state.pages[pageKey].blocks = blocksState;
        } else {
          if (!state.pages[pageKey].tab_states) state.pages[pageKey].tab_states = {};
          (state.pages[pageKey].tab_states as Record<string, unknown>)[slugify(specTabs![ti].title || '')] = {
            tab_uid: tabUid,
            blocks: blocksState,
          };
        }
      }
    }

    // Deploy popups (same two-pass logic as deployOnePage)
    await deployPagePopups(ctx, pageInfo, state, pageKey);

    // Clean up duplicate pages (same title in same group) — keep latest
    await cleanupDuplicatePages(nb, groupId, groupTitle, pageInfo.title, log);

  } catch (e) {
    const err = e as { response?: { data?: { errors?: { message: string }[] } }; message?: string };
    const apiMsg = err.response?.data?.errors?.[0]?.message || err.message || String(e);
    log(`  ! blueprint failed for ${pageInfo.title}: ${apiMsg.slice(0, 120)}`);
    log(`    falling back to legacy deploy...`);
    try { await deployOnePage(ctx, pageInfo, state, groupId); }
    catch (e2) { log(`  ✗ page ${pageInfo.title}: ${e2 instanceof Error ? e2.message.slice(0, 200) : e2}`); }
  }
}

/**
 * Deploy popups for a page — two-pass for nested ref resolution.
 * Extracted to share between deployOnePage and deployPageBlueprint.
 */
async function deployPagePopups(
  ctx: DeployContext,
  pageInfo: PageInfo,
  state: ModuleState,
  pageKey: string,
): Promise<void> {
  const { nb, log } = ctx;
  if (!pageInfo.popups.length) return;
  const pageState = state.pages[pageKey];
  if (!pageState) return;
  if (!pageState.popups) pageState.popups = {};

  const expanded = expandPopups(pageInfo.popups, pageInfo.layout.blocks || []);

  // Derive page-level coll for popups that have no coll of their own.
  // page.yaml lacks a top-level coll; the primary collection lives on
  // layout.blocks[0].coll (the main table/form/details block).
  const pageColl = (pageInfo.layout?.coll as string | undefined)
    || (pageInfo.layout?.blocks as Array<{ coll?: string }> | undefined)?.find(b => b?.coll)?.coll
    || undefined;

  // Write back auto-derived popups to disk so AI can see and edit them next round
  const popupsDir = path.join(pageInfo.dir, 'popups');
  for (const ps of expanded) {
    // Skip if original popup has inline content (hand-crafted)
    const origPopup = pageInfo.popups.find(orig => orig.target === ps.target);
    if (origPopup && (origPopup.blocks?.length || origPopup.tabs?.length)) continue;

    const targetParts = ps.target.replace('$SELF.', '').split('.');
    const fileName = targetParts.filter(p => !['actions', 'recordActions', 'record_actions'].includes(p)).join('.') + '.yaml';
    const filePath = path.join(popupsDir, fileName);

    fs.mkdirSync(popupsDir, { recursive: true });
    saveYaml(filePath, { target: ps.target, coll: ps.coll, blocks: ps.blocks, ...(ps.mode ? { mode: ps.mode } : {}) });
    log(`    ${origPopup ? '~' : '+'} auto-derived popup: ${fileName}`);
  }

  const deferred: typeof expanded = [];

  // Pass 1: page-level refs
  for (const ps of expanded) {
    const targetRef = ps.target.replace('$SELF', `$${pageKey}`);
    const resolver = new RefResolver(state);
    let targetUid: string;
    try {
      targetUid = resolver.resolveUid(targetRef);
    } catch {
      deferred.push(ps);
      continue;
    }
    const pp = targetRef.split('.').pop() || '';
    const popupKey = targetRef.replace(`$${pageKey}.`, '');
    const existingPopupBlocks = pageState.popups?.[popupKey]?.blocks || {};
    const popupBlocks = await deployPopup(ctx, targetUid, targetRef, ps, { modDir: pageInfo.dir, popupPath: pp, existingPopupBlocks, pageColl });
    if (Object.keys(popupBlocks).length) {
      pageState.popups[popupKey] = { target_uid: targetUid, blocks: popupBlocks };
      state.pages[pageKey] = pageState;
    }
  }

  // Enrich popup block state with live actions/fields (for Pass 2 ref resolution)
  for (const [popupKey, popupState] of Object.entries(pageState.popups || {})) {
    const pBlocks = (popupState as unknown as Record<string, unknown>).blocks as Record<string, BlockState> | undefined;
    if (!pBlocks) continue;
    for (const [bk, bv] of Object.entries(pBlocks)) {
      if (bv.actions && Object.keys(bv.actions).length) continue;
      // Read live block to get actions
      try {
        const blockData = await nb.get({ uid: bv.uid });
        const subModels = blockData.tree.subModels || {};
        for (const actKey of ['actions', 'recordActions'] as const) {
          const acts = (subModels as Record<string, unknown>)[actKey];
          const actArr = (Array.isArray(acts) ? acts : []) as Record<string, unknown>[];
          if (actArr.length) {
            const stateKey = actKey === 'recordActions' ? 'record_actions' : 'actions';
            if (!(bv as any)[stateKey]) (bv as any)[stateKey] = {};
            for (const a of actArr) {
              const aUid = a.uid as string || '';
              const aUse = a.use as string || '';
              const aType = aUse.replace('ActionModel', '').replace('Action', '');
              const aKey = aType.charAt(0).toLowerCase() + aType.slice(1);
              if (aUid) (bv as any)[stateKey][aKey] = { uid: aUid };
            }
          }
        }
        // Also extract fields
        const cols = (subModels as Record<string, unknown>).columns;
        const colArr = (Array.isArray(cols) ? cols : []) as Record<string, unknown>[];
        if (colArr.length && !bv.fields) {
          bv.fields = {};
          for (const col of colArr) {
            const fp = ((col.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>)
              ?.init as Record<string, unknown>;
            const fieldPath = (fp?.fieldPath || '') as string;
            if (fieldPath) bv.fields[fieldPath] = { wrapper: col.uid as string || '', field: '' };
          }
        }
      } catch (e) { catchSwallow(e, 'live table columns reflection: bv.fields stays empty, subsequent filler will rediscover'); }
    }
  }
  state.pages[pageKey] = pageState;

  // Pass 2: nested refs (targets inside popup blocks)
  if (deferred.length) {
    const resolver2 = new RefResolver(state);
    for (const ps of deferred) {
      const targetRef = ps.target.replace('$SELF', `$${pageKey}`);
      let targetUid: string;
      try {
        targetUid = resolver2.resolveUid(targetRef);
      } catch (e) {
        log(`  ! popup ${targetRef}: ${e instanceof Error ? e.message : e}`);
        continue;
      }
      const pp = targetRef.split('.').pop() || '';
      const popupKey2 = targetRef.replace(`$${pageKey}.`, '');
      const existingPopupBlocks2 = pageState.popups?.[popupKey2]?.blocks || {};
      const popupBlocks = await deployPopup(ctx, targetUid, targetRef, ps, { modDir: pageInfo.dir, popupPath: pp, existingPopupBlocks: existingPopupBlocks2, pageColl });
      if (Object.keys(popupBlocks).length) {
        pageState.popups[popupKey2] = { target_uid: targetUid, blocks: popupBlocks };
      }
    }
  }
  state.pages[pageKey] = pageState;
}

// Post-deploy popup filterByTk binding: see ./popup-bindings.ts
