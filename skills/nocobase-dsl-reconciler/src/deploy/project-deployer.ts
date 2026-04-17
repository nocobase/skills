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
import { deployPopup, type PopupOpts } from './popup-deployer';
import { expandPopups } from './popup-expander';
import { deployTemplates, resetTemplateCreationTracking, cleanStaleTemplateUsages, type TemplateUidMap, type PendingPopupTemplate } from './template-deployer';
import { resetM2oCache } from './block-filler';
import { reorderTableColumns } from './column-reorder';
import { postVerify } from './post-verify';
import { verifySqlFromPages } from './sql-verifier';
import { discoverPages, routeKey, type RouteEntry, type PageInfo } from './page-discovery';
import { RefResolver } from '../refs';
import { pageToBlueprint } from './blueprint-converter';
import { BLOCK_TYPE_TO_MODEL } from '../utils/block-types';

export async function deployProject(
  projectDir: string,
  opts: { force?: boolean; planOnly?: boolean; group?: string; page?: string; blueprint?: boolean } = {},
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
      log('\n  ── Spec Validation ERRORS (blocking deployment) ──');
      for (const e of specErrors) log(`  ✗ [${e.page}${e.block ? '/' + e.block : ''}] ${e.message}`);
      log(`\n  ${specErrors.length} errors, ${specWarnings.length} warnings. Fix errors before deploying.`);
      process.exit(1);
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
  // Reset per-deploy caches (template list, failed fallback collections, created UIDs)
  resetM2oCache();
  resetTemplateCreationTracking();
  log(`\n  Connected to ${nb.baseUrl}`);

  // State
  const stateFile = path.join(root, 'state.yaml');
  const state: ModuleState = fs.existsSync(stateFile)
    ? loadYaml<ModuleState>(stateFile)
    : { pages: {} };

  // (removed) copy-mode state reset. Use `cli duplicate-project` to produce
  // a DSL with fresh UIDs + no state.yaml; deploy then creates everything
  // from scratch without any runtime state-rewriting.

  // Collections (skip if deploying single page — safety)
  if (!opts.page) {
    await ensureAllCollections(nb, collDefs, log);
  }

  // Deploy templates (before pages, so popupTemplateUid can be mapped)
  let templateUidMap: TemplateUidMap = new Map();
  let pendingPopups: PendingPopupTemplate[] = [];
  if (!opts.page) {
    const tplResult = await deployTemplates(nb, root, log, state.template_uids);
    templateUidMap = tplResult.uidMap;
    pendingPopups = tplResult.pendingPopupTemplates;
    // Persist template UIDs to state for next deploy
    state.template_uids = { ...(state.template_uids || {}), ...tplResult.deployedTemplates } as typeof state.template_uids;
    saveYaml(stateFile, state);
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
  } catch { /* skip */ }

  // Rewrite template UIDs in page specs (old exported UIDs → new deployed UIDs)
  rewriteTemplateUids(pages, templateUidMap, templateNameMap, templateNameToTarget);

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
      await deployGroup(ctx, routeEntry, pages, state, root, opts.blueprint || false);
      if (state.group_id) state.group_ids[rkey] = state.group_id;
    } else if (routeEntry.type === 'flowPage') {
      const pageInfo = pages.find(p => p.key === rkey);
      if (pageInfo) await deployOnePage(ctx, pageInfo, state, null);
    }
  }

  // Final column reorder
  for (const p of pages) {
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
  const { enableM2oClickToOpen } = await import('./block-filler');
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

  // Set menu sortIndex to match routes.yaml declaration order
  await syncMenuOrder(nb, state, routes, log);

  // Persist UIDs created during this deploy so a future rollback can remove them.
  // We do NOT auto-delete here — a user's manually created template may be 0-usage
  // but legitimate. Cleanup happens only via explicit `rollback` CLI command.
  const { listCreatedThisRun } = await import('./template-deployer');
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

  // Workflows are part of "everything pushable" per PHILOSOPHY (push is the
  // full DSL→NB sync). Without this, users had to remember to run a separate
  // `cli deploy-workflows` after every push, and forgetting silently dropped
  // the workflow side of a duplicated module.
  if (fs.existsSync(path.join(root, 'workflows'))) {
    try {
      const { deployWorkflows } = await import('../workflow/workflow-deployer');
      log('\n  ── Workflows ──');
      await deployWorkflows(nb, root, { log });
    } catch (e) {
      log(`  ! workflows: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
    }
  }

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

// ── Block state extraction from live tree ──

function extractBlockState(
  liveTab: Record<string, unknown>,
  specBlocks: BlockSpec[],
): Record<string, BlockState> {
  const existing: Record<string, BlockState> = {};
  const tabSub = liveTab.subModels as Record<string, unknown> | undefined;
  const tabGrid = tabSub?.grid as Record<string, unknown> | undefined;
  const gridSub = tabGrid?.subModels as Record<string, unknown> | undefined;
  const items = gridSub?.items;
  const itemArr = (Array.isArray(items) ? items : []) as Record<string, unknown>[];
  const candidates = [...specBlocks];

  for (const item of itemArr) {
    const uid = item.uid as string || '';
    const use = item.use as string || '';
    if (!uid) continue;

    const matched = candidates.find(b =>
      use === BLOCK_TYPE_TO_MODEL[b.type] || use.toLowerCase().includes(b.type.toLowerCase()),
    );
    if (!matched) continue;

    const key = matched.key || matched.type;
    if (existing[key]) continue;

    const itemSub = item.subModels as Record<string, unknown> | undefined;
    // Block's own grid (for form/details/filterForm internal items), not the page grid
    const blockOwnGrid = itemSub?.grid as Record<string, unknown> | undefined;
    const blockGridUid = (blockOwnGrid?.uid as string) || '';
    const entry: BlockState = { uid, type: matched.type, grid_uid: blockGridUid };

    // Extract fields (table columns or form grid items)
    const columns = itemSub?.columns;
    const colArr = (Array.isArray(columns) ? columns : []) as Record<string, unknown>[];
    if (colArr.length) {
      entry.fields = {};
      for (const col of colArr) {
        const fp = ((col.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>)
          ?.init as Record<string, unknown>;
        const fieldPath = (fp?.fieldPath || '') as string;
        if (fieldPath) entry.fields[fieldPath] = { wrapper: col.uid as string || '', field: '' };
      }
    }
    const blockGrid = itemSub?.grid as Record<string, unknown> | undefined;
    const bgItems = (blockGrid?.subModels as Record<string, unknown> | undefined)?.items;
    const bgArr = (Array.isArray(bgItems) ? bgItems : []) as Record<string, unknown>[];
    if (bgArr.length && !entry.fields) {
      entry.fields = {};
      for (const gi of bgArr) {
        const fp = ((gi.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>)
          ?.init as Record<string, unknown>;
        const fieldPath = (fp?.fieldPath || '') as string;
        if (fieldPath) entry.fields[fieldPath] = { wrapper: gi.uid as string || '', field: '' };
      }
    }

    // Extract actions
    for (const actKey of ['actions', 'recordActions'] as const) {
      const acts = itemSub?.[actKey];
      const actArr = (Array.isArray(acts) ? acts : []) as Record<string, unknown>[];
      if (actArr.length) {
        const stateKey = actKey === 'recordActions' ? 'record_actions' : 'actions';
        if (!(entry as any)[stateKey]) (entry as any)[stateKey] = {};
        for (const a of actArr) {
          const aUid = a.uid as string || '';
          const aUse = a.use as string || '';
          const aType = aUse.replace('ActionModel', '').replace('Action', '');
          const aKey = aType.charAt(0).toLowerCase() + aType.slice(1);
          if (aUid) (entry as any)[stateKey][aKey] = { uid: aUid };
        }
      }
    }

    existing[key] = entry;
    const idx = candidates.indexOf(matched);
    if (idx >= 0) candidates.splice(idx, 1);
  }

  return existing;
}

// ── Template UID rewriting ──

/**
 * Rewrite old exported template UIDs in page specs to match deployed UIDs.
 * Handles two cases:
 *   1. templateRef.templateUid — block reference specs
 *   2. popupSettings.popupTemplateUid — field popup specs
 */
function rewriteTemplateUids(
  pages: PageInfo[],
  uidMap: TemplateUidMap,
  nameMap: Map<string, string> = new Map(),
  nameToTarget: Map<string, string> = new Map(),
): void {
  for (const page of pages) {
    rewriteInBlocks(page.layout.blocks || [], uidMap, nameMap, nameToTarget);
    if (page.layout.tabs) {
      for (const tab of page.layout.tabs) {
        rewriteInBlocks((tab as any).blocks || [], uidMap, nameMap, nameToTarget);
      }
    }
    for (const popup of page.popups) {
      rewriteInBlocks((popup as any).blocks || [], uidMap, nameMap, nameToTarget);
      if ((popup as any).tabs) {
        for (const tab of (popup as any).tabs) {
          rewriteInBlocks((tab as any).blocks || [], uidMap, nameMap, nameToTarget);
        }
      }
    }
  }
}

function rewriteInBlocks(
  blocks: any[],
  uidMap: TemplateUidMap,
  nameMap: Map<string, string> = new Map(),
  nameToTarget: Map<string, string> = new Map(),
): void {
  for (const block of blocks) {
    // Case 1: templateRef (reference blocks)
    if (block.templateRef) {
      // Rewrite by UID map
      if (block.templateRef.templateUid) {
        const newUid = uidMap.get(block.templateRef.templateUid);
        if (newUid) block.templateRef.templateUid = newUid;
      }
      // If templateUid still empty, look up by name from live templates
      if (!block.templateRef.templateUid && block.templateRef.templateName) {
        const byName = nameMap.get(block.templateRef.templateName);
        if (byName) block.templateRef.templateUid = byName;
      }
      // Also try _refName (legacy)
      if (!block.templateRef.templateUid && block._refName) {
        const byName = nameMap.get(block._refName);
        if (byName) block.templateRef.templateUid = byName;
      }
      // Rewrite targetUid (DSL-declared)
      if (block.templateRef.targetUid) {
        const newTarget = uidMap.get(block.templateRef.targetUid);
        if (newTarget) block.templateRef.targetUid = newTarget;
      }
      // If targetUid still missing but we know the templateName, fill it from
      // the live template. Required for fresh ref blocks (no uid in DSL): the
      // reference block needs a targetUid to mirror, otherwise NocoBase shows
      // an empty card.
      if (!block.templateRef.targetUid && block.templateRef.templateName) {
        const byName = nameToTarget.get(block.templateRef.templateName);
        if (byName) block.templateRef.targetUid = byName;
      }
      delete block._refName;
      delete block._refColl;
    }

    // Case 2: fields with popupSettings.popupTemplateUid
    if (Array.isArray(block.fields)) {
      for (const f of block.fields) {
        if (typeof f !== 'object' || !f) continue;
        const ps = f.popupSettings;
        if (ps?.popupTemplateUid) {
          const newUid = uidMap.get(ps.popupTemplateUid);
          if (newUid) ps.popupTemplateUid = newUid;
        }
      }
    }

    // Case 3: popupTemplate on blocks (e.g. popup-deployer path)
    if ((block as any).popupTemplate?.uid) {
      const newUid = uidMap.get((block as any).popupTemplate.uid);
      if (newUid) (block as any).popupTemplate.uid = newUid;
    }

    // Recurse into nested blocks (tabs, popups)
    if (Array.isArray(block.blocks)) {
      rewriteInBlocks(block.blocks, uidMap, nameMap, nameToTarget);
    }
    if (Array.isArray(block.tabs)) {
      for (const tab of block.tabs) {
        rewriteInBlocks((tab as any).blocks || [], uidMap);
      }
    }
  }
}

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
          // Set sortIndex to match declaration order
          const pageKey = pageInfo.key;
          const routeId = (state.pages[pageKey] as Record<string, unknown>)?.route_id as number | undefined;
          if (routeId) {
            await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`, { sortIndex: ci + 1 }, { params: { 'filter[id]': routeId } }).catch(() => {});
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
        // Set sortIndex on sub-group to match declaration order
        await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`, { sortIndex: ci + 1 }, { params: { 'filter[id]': subGroupId } }).catch(() => {});
        const subChildren = child.children || [];
        for (let si = 0; si < subChildren.length; si++) {
          const sc = subChildren[si];
          const pageInfo = pages.find(p => p.key === routeKey(sc));
          if (pageInfo) {
            await deployPageBlueprint(ctx, pageInfo, state, subGroupId, child.title);
            // Set sortIndex on sub-group child
            const pageKey = pageInfo.key;
            const routeId = (state.pages[pageKey] as Record<string, unknown>)?.route_id as number | undefined;
            if (routeId) {
              await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`, { sortIndex: si + 1 }, { params: { 'filter[id]': routeId } }).catch(() => {});
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
        await deployOnePage(ctx, pageInfo, state, state.group_id!);
        // Set sortIndex to match declaration order
        const pageKey = pageInfo.key;
        const routeId = (state.pages[pageKey] as Record<string, unknown>)?.route_id as number | undefined;
        if (routeId) {
          await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`, { sortIndex: ci + 1 }, { params: { 'filter[id]': routeId } }).catch(() => {});
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
      // Set sortIndex on sub-group
      await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`, { sortIndex: ci + 1 }, { params: { 'filter[id]': subGroupId } }).catch(() => {});
      const subChildren = child.children || [];
      for (let si = 0; si < subChildren.length; si++) {
        const sc = subChildren[si];
        const pageInfo = pages.find(p => p.title === sc.title);
        if (pageInfo) {
          await deployOnePage(ctx, pageInfo, state, subGroupId);
          // Set sortIndex on sub-group child
          const pageKey = pageInfo.key;
          const routeId = (state.pages[pageKey] as Record<string, unknown>)?.route_id as number | undefined;
          if (routeId) {
            await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`, { sortIndex: si + 1 }, { params: { 'filter[id]': routeId } }).catch(() => {});
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
            } catch { /* skip */ }
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
      } catch { /* skip — will create new */ }
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
      } catch { /* skip */ }
      return { id: livePage.id, schemaUid: livePage.schemaUid, tabUid };
    } catch { return null; }
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
    await deployOnePage(ctx, pageInfo, state, groupId);
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
    const popupBlocks = await deployPopup(ctx, targetUid, targetRef, ps, { modDir: pageInfo.dir, popupPath: pp, existingPopupBlocks });
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
      } catch { /* skip */ }
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
      const popupBlocks = await deployPopup(ctx, targetUid, targetRef, ps, { modDir: pageInfo.dir, popupPath: pp, existingPopupBlocks: existingPopupBlocks2 });
      if (Object.keys(popupBlocks).length) {
        pageState.popups[popupKey2] = { target_uid: targetUid, blocks: popupBlocks };
      }
    }
  }
  state.pages[pageKey] = pageState;
}

/**
 * Extract popup targets from popup specs — both fields and recordActions.
 * Used to prevent auto-fill from creating default content when a popup YAML handles it.
 *
 * Returns: Set containing field paths ("name") and recordAction markers ("recordAction:edit").
 */
function buildPopupTargetFields(popups: PopupSpec[]): Set<string> {
  const result = new Set<string>();
  for (const ps of popups) {
    const target = ps.target || '';
    const mf = target.match(/\.fields\.([^.]+)$/);
    if (mf) result.add(mf[1]);
    const mr = target.match(/\.recordActions\.([^.]+)$/);
    if (mr) result.add(`recordAction:${mr[1]}`);
  }
  return result;
}

/**
 * Remove duplicate pages (same title) within a group — keep the latest (highest id).
 */
async function cleanupDuplicatePages(
  nb: NocoBaseClient,
  groupId: number,
  groupTitle: string,
  pageTitle: string,
  log: (msg: string) => void,
): Promise<void> {
  try {
    const liveRoutes = await nb.http.get(`${nb.baseUrl}/api/desktopRoutes:list`, { params: { paginate: 'false', tree: 'true' } });
    const allGroups = (liveRoutes.data.data || []) as any[];
    const liveGroup = allGroups.find((r: any) => r.id === groupId || (r.type === 'group' && r.title === groupTitle));
    if (!liveGroup?.children) return;
    // Find all children (including sub-groups) with matching title
    const duplicates = liveGroup.children.filter(
      (c: any) => c.title === pageTitle && c.type !== 'tabs' && c.type !== 'group',
    );
    if (duplicates.length <= 1) return;
    // Sort by id descending — keep the latest
    duplicates.sort((a: any, b: any) => (b.id || 0) - (a.id || 0));
    for (let i = 1; i < duplicates.length; i++) {
      const dup = duplicates[i];
      try {
        await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:destroy`, null, {
          params: { 'filter[id]': dup.id },
        });
        log(`  - removed duplicate page: ${pageTitle} (id=${dup.id})`);
      } catch (e) {
        log(`  ! cleanup duplicate ${pageTitle}: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
      }
    }
  } catch (e) {
    log(`  ! duplicate cleanup: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }
}

/**
 * Set sortIndex on deployed routes to match routes.yaml declaration order.
 */
async function syncMenuOrder(
  nb: NocoBaseClient,
  state: ModuleState,
  routes: RouteEntry[],
  log: (msg: string) => void,
): Promise<void> {
  try {
    const groupEntries = routes.filter(r => r.type === 'group');
    if (!groupEntries.length) return;

    const allRoutes = await nb.http.get(`${nb.baseUrl}/api/desktopRoutes:list`, { params: { paginate: 'false', tree: 'true' } });
    const liveGroups = (allRoutes.data.data || []).filter((r: any) => r.type === 'group');
    let changed = 0;

    const syncRoute = async (spec: RouteEntry, live: any, sortIdx: number) => {
      const patch: Record<string, unknown> = {};
      if (live.sortIndex !== sortIdx) patch.sortIndex = sortIdx;
      if (spec.icon && live.icon !== spec.icon) patch.icon = spec.icon;
      if (spec.hidden !== undefined && live.hidden !== spec.hidden) patch.hidden = spec.hidden;
      if (Object.keys(patch).length) {
        await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`, patch, { params: { 'filter[id]': live.id } });
        changed++;
      }
    };

    for (const groupEntry of groupEntries) {
      if (!groupEntry.children?.length) continue;

      // Prefer matching by state.group_ids[key] (stable across title changes), fall back to title.
      const gKey = routeKey(groupEntry);
      const stateGroupId = state.group_ids?.[gKey];
      let liveGroup = stateGroupId ? liveGroups.find((g: any) => g.id === stateGroupId) : undefined;
      if (!liveGroup) liveGroup = liveGroups.find((g: any) => g.title === groupEntry.title);
      if (!liveGroup?.children?.length) continue;

      const liveChildren = liveGroup.children as { id: number; title: string; type: string; sortIndex?: number; children?: any[] }[];

      for (let i = 0; i < groupEntry.children.length; i++) {
        const specChild = groupEntry.children[i];
        const liveChild = liveChildren.find(c => c.title === specChild.title);
        if (!liveChild) continue;
        await syncRoute(specChild, liveChild, i + 1);
        // Sub-group children
        if (specChild.type === 'group' && specChild.children?.length && liveChild.children?.length) {
          for (let j = 0; j < specChild.children.length; j++) {
            const specSub = specChild.children[j];
            const liveSub = liveChild.children.find((c: any) => c.title === specSub.title);
            if (liveSub) await syncRoute(specSub, liveSub, j + 1);
          }
        }
      }
    }
    if (changed) log(`  menu: ${changed} routes reordered`);
  } catch (e) {
    log(`  ! menu order: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }
}

/**
 * Re-sync the deployed group's children/icons back into routes.yaml so the
 * file stays in step with what's actually live. Identity is matched by `key`
 * (= route.key || slugify(title)), so titles can change freely without
 * losing the entry.
 */
async function syncRoutesYaml(
  nb: NocoBaseClient,
  root: string,
  routeEntry: RouteEntry,
  log: (msg: string) => void,
): Promise<void> {
  try {
    nb.routes.clearCache();
    const liveRoutes = await nb.routes.list();

    // Match live group by stored title (DSL is source of truth for naming).
    const liveGroup = liveRoutes.find(r => r.type === 'group' && r.title === routeEntry.title);
    if (!liveGroup) { log(`\n  routes.yaml sync: group "${routeEntry.title}" not found in live`); return; }

    // Build updated entry from live state. Preserve declared key so identity
    // is stable regardless of how the title changes later.
    const buildEntry = (r: any, declaredKey: string | undefined, declaredTitle?: string): Record<string, unknown> => {
      const entry: Record<string, unknown> = {};
      if (declaredKey) entry.key = declaredKey;
      entry.title = declaredTitle ?? r.title;
      if (r.type === 'group') entry.type = 'group';
      if (r.icon) entry.icon = r.icon;
      const seenChildren = new Set<string>();
      const children = (r.children || [])
        .filter((c: any) => c.type !== 'tabs')
        .filter((c: any) => {
          if (seenChildren.has(c.title || '')) return false;
          seenChildren.add(c.title || '');
          return true;
        })
        .map((c: any) => {
          const ce: Record<string, unknown> = { title: c.title };
          if (c.type === 'group') ce.type = 'group';
          if (c.icon) ce.icon = c.icon;
          const seenSub = new Set<string>();
          const sub = (c.children || [])
            .filter((s: any) => s.type !== 'tabs')
            .filter((s: any) => {
              if (seenSub.has(s.title || '')) return false;
              seenSub.add(s.title || '');
              return true;
            })
            .map((s: any) => {
              const se: Record<string, unknown> = { title: s.title };
              if (s.type === 'group') se.type = 'group';
              if (s.icon) se.icon = s.icon;
              return se;
            });
          if (sub.length) ce.children = sub;
          return ce;
        });
      if (children.length) entry.children = children;
      return entry;
    };

    // Read existing routes.yaml, update only the matching group entry by key.
    const routesFile = path.join(root, 'routes.yaml');
    let existing: Record<string, unknown>[] = [];
    try { existing = loadYaml<Record<string, unknown>[]>(routesFile) || []; } catch { /* fresh */ }

    const ourKey = routeKey(routeEntry);
    const updatedEntry = buildEntry(liveGroup, routeEntry.key, routeEntry.title);
    const idx = existing.findIndex(e => {
      const er = e as { key?: string; title?: string; type?: string };
      return routeKey({ key: er.key, title: er.title || '' }) === ourKey && er.type === 'group';
    });
    if (idx >= 0) {
      existing[idx] = updatedEntry;
    } else {
      existing.push(updatedEntry);
    }

    fs.writeFileSync(routesFile, dumpYaml(existing));
    log('\n  routes.yaml synced');
  } catch (e) {
    log(`\n  ! routes sync: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }
}

/**
 * Enable multi-tab mode on a page: update both the route and the RootPageModel.
 */
async function enablePageTabs(
  nb: NocoBaseClient,
  routeId: number,
  pageUid: string,
  log: (msg: string) => void,
): Promise<void> {
  try {
    // 1. Route
    await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:update`,
      { enableTabs: true },
      { params: { 'filter[id]': routeId } },
    );
    // 2. RootPageModel — both props AND stepParams.pageSettings.general
    if (pageUid) {
      const fmResp = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, {
        params: { filterByTk: pageUid },
      });
      const fm = fmResp.data?.data || {};
      // props.enableTabs
      await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
        uid: pageUid,
        props: { ...(fm.props || {}), enableTabs: true },
      });
      // stepParams.pageSettings.general.enableTabs
      const ps = fm.stepParams?.pageSettings?.general || {};
      if (!ps.enableTabs) {
        await nb.updateModel(pageUid, {
          pageSettings: { general: { ...ps, enableTabs: true } },
        });
      }
    }
  } catch (e) {
    log(`    ! enableTabs: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }
}

/**
 * Post-deploy: ensure popup action/field hosts have filterByTk in openView.
 *
 * Checks all deployed popups in state:
 * - recordActions.* and fields.* → must have filterByTk='{{ctx.view.inputArgs.filterByTk}}'
 * - actions.* (addNew) → no filterByTk needed
 */
async function ensurePopupBindings(
  nb: NocoBaseClient,
  state: ModuleState,
  log: (msg: string) => void,
): Promise<void> {
  let fixed = 0;
  try {
    for (const [, pageState] of Object.entries(state.pages || {})) {
      const ps = pageState as Record<string, unknown>;
      const popups = (ps.popups || {}) as Record<string, Record<string, unknown>>;
      for (const [popupKey, popupState] of Object.entries(popups)) {
        // Only recordActions and fields need filterByTk
        const needsRecord = popupKey.includes('recordActions.') || popupKey.includes('fields.');
        if (!needsRecord) continue;

        const targetUid = popupState.target_uid as string;
        if (!targetUid) continue;

        try {
          const fm = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, { params: { filterByTk: targetUid } });
          const data = fm.data?.data;
          if (!data) continue;
          const ov = data.stepParams?.popupSettings?.openView;
          if (!ov) continue;

          // Fix missing filterByTk on host
          if (!ov.filterByTk) {
            ov.filterByTk = '{{ctx.view.inputArgs.filterByTk}}';
            await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
              uid: targetUid, use: data.use, parentId: data.parentId,
              subKey: data.subKey, subType: data.subType,
              sortIndex: data.sortIndex || 0, flowRegistry: data.flowRegistry || {},
              stepParams: data.stepParams,
            });
            fixed++;
          }
        } catch { /* skip */ }
      }
    }
    if (fixed) log(`  popup filterByTk: ${fixed} hosts fixed`);

    // Fix block template targets: edit/detail templates need filterByTk
    // (created on temp page without popup context, so target block has no filterByTk)
    let blockFixed = 0;
    const tplResp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:list`, { params: { paginate: false } });
    const NO_FILTER_MODELS = new Set(['CreateFormModel']);
    for (const t of (tplResp.data?.data || []) as Record<string, unknown>[]) {
      if (t.type !== 'block' || !t.targetUid) continue;
      if (NO_FILTER_MODELS.has(t.useModel as string)) continue; // addNew doesn't need filterByTk
      try {
        const fm = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, { params: { filterByTk: t.targetUid } });
        const d = fm.data?.data;
        if (!d) continue;
        const res = d.stepParams?.resourceSettings?.init || {};
        if (res.filterByTk === '{{ctx.view.inputArgs.filterByTk}}' && res.binding === 'currentRecord') continue;
        const sp = d.stepParams || {};
        if (!sp.resourceSettings) sp.resourceSettings = {};
        if (!sp.resourceSettings.init) sp.resourceSettings.init = {};
        sp.resourceSettings.init.filterByTk = '{{ctx.view.inputArgs.filterByTk}}';
        sp.resourceSettings.init.binding = 'currentRecord';
        if (!sp.resourceSettings.init.dataSourceKey) sp.resourceSettings.init.dataSourceKey = 'main';
        if (!sp.resourceSettings.init.collectionName) sp.resourceSettings.init.collectionName = t.collectionName;
        await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
          uid: t.targetUid as string, use: d.use, parentId: d.parentId,
          subKey: d.subKey, subType: d.subType,
          sortIndex: d.sortIndex || 0, flowRegistry: d.flowRegistry || {},
          stepParams: sp,
        });
        blockFixed++;
      } catch { /* skip */ }
    }
    if (blockFixed) log(`  block template filterByTk: ${blockFixed} targets fixed`);
  } catch (e) {
    log(`  ! popup bindings: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }
}
