/**
 * Deploy V2 templates from templates/ directory.
 *
 * For each template in _index.yaml:
 *   - If template already exists in NocoBase (by name + collection match) → reuse UID
 *   - If template is new → create via flowSurfaces:saveTemplate flow:
 *     a. Create a temporary hidden page
 *     b. Compose the template content block on that page
 *     c. Call saveTemplate with saveMode: 'duplicate'
 *     d. Delete the temporary page
 *     e. Record the new templateUid
 *
 * Returns uid mapping (old → new) for downstream page deployers.
 *
 * ⚠️ PITFALLS:
 * - Match templates by name + collectionName (not UID — UIDs differ between instances)
 * - Popup templates: host is a field-like node with ChildPage, not a page grid
 * - Block templates: compose on a temp page grid, then saveTemplate on the block UID
 * - Template deployer is idempotent (safe to run multiple times)
 * - Block templates: syncTemplateContent() reconciles fields + layout on reuse
 * - Popup templates: deferred — deploy inline first, then convertPopupToTemplate()
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NocoBaseClient } from '../client';
import type { DeployContext } from './deploy-context';
import { loadYaml } from '../utils/yaml';
import { generateUid } from '../utils/uid';
import { BLOCK_TYPE_TO_MODEL } from '../utils/block-types';
import { toComposeBlock } from './block-composer';

interface TemplateIndex {
  uid: string;
  name: string;
  type: 'popup' | 'block';
  collection?: string;
  targetUid: string;
  file: string;
}

// Track template UIDs created during the current deploy run.
// Stored in state.yaml._last_deploy_created_templates so the `rollback` CLI
// command can remove them later. We do NOT auto-delete — a freshly created
// template may be 0-usage legitimately (user hand-built a library).
const _createdThisRun = new Set<string>();
export function resetTemplateCreationTracking(): void { _createdThisRun.clear(); }
export function trackCreatedTemplate(uid: string): void { if (uid) _createdThisRun.add(uid); }
export function listCreatedThisRun(): string[] { return Array.from(_createdThisRun); }

/** Delete the given template UIDs from NocoBase. Used by `rollback` CLI. */
export async function deleteTemplatesByUid(
  nb: NocoBaseClient,
  uids: string[],
  log: (msg: string) => void,
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0, failed = 0;
  for (const uid of uids) {
    try {
      await nb.http.post(`${nb.baseUrl}/api/flowModelTemplates:destroy`, {}, { params: { filterByTk: uid } });
      deleted++;
    } catch { failed++; }
  }
  log(`  rollback: deleted ${deleted} templates, ${failed} failed`);
  return { deleted, failed };
}

/**
 * Drop flowModelTemplateUsages rows whose modelUid no longer exists.
 *
 * NocoBase bug: when a flowModel is destroyed, its usage records in
 * flowModelTemplateUsages are NOT cascade-deleted. Those rows keep the
 * template's usageCount artificially elevated, blocking later destroy
 * attempts with "Template is in use". This routine walks the usages
 * table and removes records pointing at dead flowModels.
 *
 * Runs on every deploy (cheap — typically <100 stale rows per cycle).
 */
export async function cleanStaleTemplateUsages(
  nb: NocoBaseClient,
  log: (msg: string) => void,
): Promise<{ cleaned: number; usageRecords: number }> {
  try {
    // Page through all usages
    const usages: any[] = [];
    for (let p = 1; p <= 10; p++) {
      const r = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplateUsages:list`, { params: { pageSize: 1000, page: p } });
      const d = r.data.data || [];
      usages.push(...d);
      if (d.length < 1000) break;
    }
    if (!usages.length) return { cleaned: 0, usageRecords: 0 };

    // Collect live flowModel UIDs in one pass (only what's referenced)
    const referencedUids = new Set(usages.map((u: any) => u.modelUid as string));
    const liveUids = new Set<string>();
    // Ask NocoBase for each chunk — but since we don't have batch-by-uid,
    // we just fetch all model uids which is manageable (~few thousand after cleanup)
    for (let p = 1; p <= 10; p++) {
      const r = await nb.http.get(`${nb.baseUrl}/api/flowModels:list`, { params: { pageSize: 5000, page: p, fields: 'uid' } });
      const d = r.data.data || [];
      for (const n of d) if (referencedUids.has(n.uid)) liveUids.add(n.uid);
      if (d.length < 5000) break;
    }

    const stale = usages.filter((u: any) => !liveUids.has(u.modelUid));
    let cleaned = 0;
    for (const u of stale) {
      try {
        await nb.http.post(`${nb.baseUrl}/api/flowModelTemplateUsages:destroy`, {}, { params: { filterByTk: u.uid } });
        cleaned++;
      } catch { /* skip */ }
    }
    if (cleaned) log(`  cleanup: removed ${cleaned} stale template usage records (NocoBase cascade bug)`);
    return { cleaned, usageRecords: usages.length };
  } catch (e) {
    log(`  ! cleanup usages: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    return { cleaned: 0, usageRecords: 0 };
  }
}

interface ExistingTemplate {
  uid: string;
  name: string;
  collectionName?: string;
  targetUid: string;
}

export type TemplateUidMap = Map<string, string>; // oldUid → newUid
export interface PendingPopupTemplate { name: string; collName: string; file: string; uid: string; targetUid: string; }
export interface DeployTemplatesResult {
  uidMap: TemplateUidMap;
  pendingPopupTemplates: PendingPopupTemplate[];
  deployedTemplates: Record<string, { uid: string; targetUid: string; type: string; collection?: string }>;
}

/**
 * Auto-discover template YAML files when _index.yaml doesn't exist.
 * Scans templates/popup/ and templates/block/ directories.
 */
function discoverTemplates(tplDir: string): TemplateIndex[] {
  const result: TemplateIndex[] = [];
  for (const subDir of ['popup', 'block']) {
    const dir = path.join(tplDir, subDir);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.yaml')).sort()) {
      try {
        const content = loadYaml<Record<string, unknown>>(path.join(dir, f));
        if (!content?.name) continue;
        result.push({
          uid: (content.uid as string) || generateUid(),
          name: content.name as string,
          type: (content.type as 'popup' | 'block') || (subDir === 'popup' ? 'popup' : 'block'),
          collection: (content.collectionName as string) || undefined,
          targetUid: (content.targetUid as string) || generateUid(),
          file: `${subDir}/${f}`,
        });
      } catch { /* skip malformed */ }
    }
  }
  return result;
}

/**
 * Incrementally sync a block template's live content with spec.
 *
 * Template target structure (determines sync strategy):
 *   - block template (form/edit/details): target = CreateFormModel/EditFormModel/DetailsBlockModel → has grid.items
 *   - popup template: target = DisplayTextFieldModel → no grid, content in deeper ChildPage (skipped here)
 *   - table template: target = TableBlockModel → has columns, not grid.items (skipped here)
 *
 * Only block templates with grid.items are synced here. Popup/table templates have
 * different structures that are handled by their own deploy paths.
 *
 * Sync logic:
 *   Fields changed → compose on temp page → deep-copy grid tree into target
 *   Fields unchanged → only apply field_layout + dividers
 */
async function syncTemplateContent(
  nb: NocoBaseClient,
  targetUid: string,
  collName: string,
  content: Record<string, unknown>,
  log: (msg: string) => void,
  indent: string,
): Promise<void> {
  const specFields = ((content.fields as unknown[]) || [])
    .map((f: any) => typeof f === 'string' ? f : (f.field || f.fieldPath || ''))
    .filter(Boolean);

  // Get live tree
  const targetData = await nb.get({ uid: targetUid });
  const targetUse = (targetData.tree.use || '') as string;

  // Table blocks have columns, not grid.items — skip field sync for tables
  if (targetUse.includes('Table')) return;

  const grid = targetData.tree.subModels?.grid as any;
  const gridUid = grid?.uid as string | undefined;

  // Collect live field paths
  const liveItems = (Array.isArray(grid?.subModels?.items) ? grid.subModels.items : []) as any[];
  const liveFields = liveItems
    .map((item: any) => item.stepParams?.fieldSettings?.init?.fieldPath as string)
    .filter(Boolean);

  // Check if fields changed
  const fieldsMatch = specFields.length > 0 && specFields.length === liveFields.length &&
    specFields.every((f, i) => f === liveFields[i]);

  if (!fieldsMatch && specFields.length > 0) {
    // Fields changed — rebuild via compose on temp page, then deep-copy
    const { resource_binding, ...contentForCompose } = content;
    const composeBlock = toComposeBlock(contentForCompose as any, collName);
    if (!composeBlock) {
      log(`${indent}! cannot compose template block type`);
      return;
    }

    const tempPage = await createTempPage(nb);
    if (!tempPage) return;

    try {
      // Compose fresh block on temp page — this creates a full FlowModel tree
      const result = await nb.surfaces.compose(tempPage.tabUid, [composeBlock], 'replace');
      const newBlockUid = result.blocks?.[0]?.uid;
      if (!newBlockUid) { log(`${indent}! compose returned no block`); return; }

      // Read the composed block's full tree
      const newBlockData = await nb.get({ uid: newBlockUid });
      const newGrid = newBlockData.tree.subModels?.grid as any;
      if (!newGrid?.uid) { log(`${indent}! composed block has no grid`); return; }

      // Destroy old grid under target (cascade deletes children)
      if (gridUid) {
        await nb.http.post(`${nb.baseUrl}/api/flowModels:destroy`, {}, { params: { filterByTk: gridUid } }).catch(() => {});
      }

      // Deep-copy: recreate entire grid tree under target (node by node)
      // Track old→new UID mapping for grid layout remapping
      const copyUidMap = new Map<string, string>();
      const gridNodesToFix: { newUid: string; rows: Record<string, string[][]>; sizes?: Record<string, number[]> }[] = [];

      async function deepCopy(srcNode: any, newParentId: string, subKey: string, subType: string): Promise<void> {
        const newUid = generateUid();
        if (srcNode.uid) copyUidMap.set(srcNode.uid, newUid);

        // Collect grid nodes that have rows (need UID remapping after full copy)
        const gs = srcNode.stepParams?.gridSettings?.grid;
        if (gs?.rows && typeof gs.rows === 'object') {
          gridNodesToFix.push({ newUid, rows: gs.rows, sizes: gs.sizes });
        }

        await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
          uid: newUid,
          use: srcNode.use,
          parentId: newParentId,
          subKey,
          subType,
          sortIndex: srcNode.sortIndex || 0,
          flowRegistry: srcNode.flowRegistry || {},
          stepParams: srcNode.stepParams || {},
          props: srcNode.props,
        });
        // Recurse into subModels
        const subs = srcNode.subModels;
        if (subs && typeof subs === 'object') {
          for (const [sk, sv] of Object.entries(subs)) {
            if (Array.isArray(sv)) {
              for (const item of sv) {
                if (item && typeof item === 'object' && item.uid) {
                  await deepCopy(item, newUid, sk, 'array');
                }
              }
            } else if (sv && typeof sv === 'object' && (sv as any).uid) {
              await deepCopy(sv, newUid, sk, 'object');
            }
          }
        }
      }

      await deepCopy(newGrid, targetUid, 'grid', 'object');

      // Remap grid layout UIDs: rows/sizes reference old UIDs → replace with new
      for (const { newUid: gridUid2, rows, sizes } of gridNodesToFix) {
        const newRows: Record<string, string[][]> = {};
        for (const [rowKey, cols] of Object.entries(rows)) {
          const newRowKey = copyUidMap.get(rowKey) || rowKey;
          newRows[newRowKey] = cols.map(col => col.map(uid => copyUidMap.get(uid) || uid));
        }
        const newSizes: Record<string, number[]> = {};
        if (sizes) {
          for (const [key, val] of Object.entries(sizes)) {
            newSizes[copyUidMap.get(key) || key] = val;
          }
        }
        try {
          await nb.updateModel(gridUid2, { gridSettings: { grid: { rows: newRows, sizes: sizes ? newSizes : undefined } } });
        } catch (e) {
          log(`${indent}! grid layout remap: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
        }
      }

      // Log
      const added = specFields.filter(f => !liveFields.includes(f));
      const removed = liveFields.filter(f => !specFields.includes(f));
      if (removed.length) log(`${indent}- fields: ${removed.join(', ')}`);
      if (added.length) log(`${indent}+ fields: ${added.join(', ')}`);
      log(`${indent}~ template content rebuilt (${specFields.length} fields)`);

      // Re-read target to get the new grid UID, then apply layout
      const refreshed = await nb.get({ uid: targetUid });
      const newTargetGrid = refreshed.tree.subModels?.grid as any;
      const newGridUid = newTargetGrid?.uid as string;
      if (newGridUid) {
        const fieldLayout = content.field_layout as unknown[];
        if (fieldLayout?.length) {
          const { deployDividers } = await import('./fillers/divider-filler');
          const { applyFieldLayout } = await import('./fillers/field-layout');
          const fCtx: DeployContext = { nb, log, force: false };
          await deployDividers(fCtx, newGridUid, content as any, {});
          await applyFieldLayout(fCtx, newGridUid, fieldLayout, content as any);
        }
      }
    } finally {
      await deleteTempPage(nb, tempPage);
    }
  } else {
    // Fields unchanged — only sync layout
    if (gridUid) {
      const fieldLayout = content.field_layout as unknown[];
      if (fieldLayout?.length) {
        const { deployDividers } = await import('./fillers/divider-filler');
        const { applyFieldLayout } = await import('./fillers/field-layout');
        const fCtx: DeployContext = { nb, log, force: false };
        await deployDividers(fCtx, gridUid, content as any, {});
        await applyFieldLayout(fCtx, gridUid, fieldLayout, content as any);
      }
    }
  }

  // Apply block-level extras that neither compose nor deep-copy carry:
  // fieldLinkageRules, fieldValueRules, event_flows — they must be set
  // explicitly so copied form templates show/hide/compute fields correctly.
  await applyTemplateExtras(nb, targetUid, content, log, indent);
}

async function applyTemplateExtras(
  nb: NocoBaseClient,
  targetUid: string,
  content: Record<string, unknown>,
  log: (msg: string) => void,
  indent: string,
): Promise<void> {
  const linkageRules = content.fieldLinkageRules as Record<string, unknown>[] | undefined;
  if (Array.isArray(linkageRules) && linkageRules.length) {
    try {
      await nb.surfaces.setFieldLinkageRules(targetUid, linkageRules);
      log(`${indent}~ fieldLinkageRules: ${linkageRules.length} rules`);
    } catch (e) { log(`${indent}! fieldLinkageRules: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }
  }
  const valueRules = content.fieldValueRules as Record<string, unknown>[] | undefined;
  if (Array.isArray(valueRules) && valueRules.length) {
    try {
      await nb.surfaces.setFieldValueRules(targetUid, valueRules);
      log(`${indent}~ fieldValueRules: ${valueRules.length} rules`);
    } catch (e) { log(`${indent}! fieldValueRules: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }
  }
  const eventFlows = content.event_flows as Record<string, unknown>[] | undefined;
  if (Array.isArray(eventFlows) && eventFlows.length) {
    try {
      const { deployEventFlows } = await import('./fillers/event-flow-filler');
      const fCtx: DeployContext = { nb, log, force: false };
      await deployEventFlows(fCtx, targetUid, { event_flows: eventFlows } as any, '');
      log(`${indent}~ event_flows: ${eventFlows.length} flows`);
    } catch (e) { log(`${indent}! event_flows: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }
  }
}

/**
 * Deploy all templates. Returns uid mapping (old → new).
 *
 * Called before page deployment so that popupTemplateUid references
 * can be resolved in page specs.
 */
export async function deployTemplates(
  nb: NocoBaseClient,
  projectDir: string,
  log: (msg: string) => void = console.log,
  savedTemplateUids?: Record<string, { uid: string; targetUid: string; type: string; collection?: string }>,
): Promise<DeployTemplatesResult> {
  const tplDir = path.join(projectDir, 'templates');
  if (!fs.existsSync(tplDir)) return { uidMap: new Map(), pendingPopupTemplates: [], deployedTemplates: {} };

  // Build index by scanning the individual template YAML files.
  //
  // We intentionally ignore templates/_index.yaml even when it exists: that file
  // is a historical export-side convenience that often contains stale UID
  // duplicates (multiple entries pointing at the same file with different uids).
  // Each individual YAML is the authoritative source of its own uid — using the
  // index would mask that, leading to "template does not exist" when popup DSL
  // references the file's uid while deploy creates the template with the
  // index's (different) uid.
  let index: TemplateIndex[] = discoverTemplates(tplDir);
  if (!index.length) return { uidMap: new Map(), pendingPopupTemplates: [], deployedTemplates: {} };

  // Filter out templates whose collection isn't part of THIS project. The
  // export step pulls every flowModelTemplate from the live system, so
  // templates from unrelated modules (HD, ITAM, etc.) end up in templates/
  // and would 400 here ("field 'nb_hd_xxx.foo' not found"). The project's
  // own collections live in <projectDir>/collections/<coll>.yaml, plus a few
  // built-in NocoBase collections (mailMessages, users) we always allow.
  const colsDir = path.join(projectDir, 'collections');
  const projectColls = new Set<string>(['mailMessages', 'users']);
  if (fs.existsSync(colsDir)) {
    for (const f of fs.readdirSync(colsDir)) {
      if (f.endsWith('.yaml')) projectColls.add(f.replace(/\.yaml$/, ''));
    }
  }
  if (projectColls.size > 2) {
    const before = index.length;
    index = index.filter(t => {
      const tplFile = path.join(tplDir, t.file);
      if (!fs.existsSync(tplFile)) return true;
      const spec = loadYaml<Record<string, unknown>>(tplFile);
      const c = (t.collection || spec.collectionName) as string || '';
      return !c || projectColls.has(c);
    });
    if (before !== index.length) log(`  skipped ${before - index.length} templates outside project collections`);
  }

  log('\n  -- Templates --');

  // Fetch existing templates to avoid duplicates
  const existingResp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:list`, {
    params: { paginate: false },
  });
  const existing = (existingResp.data?.data || []) as ExistingTemplate[];

  // Build lookup: "name|collection" → existing entry
  const existingByKey = new Map<string, ExistingTemplate>();
  for (const t of existing) {
    const key = makeMatchKey(t.name, t.collectionName || '');
    existingByKey.set(key, t);
  }
  // Also keep name-only fallback for templates without collection
  const existingByName = new Map<string, ExistingTemplate>();
  for (const t of existing) {
    if (!existingByName.has(t.name)) {
      existingByName.set(t.name, t);
    }
  }

  const uidMap: TemplateUidMap = new Map();
  const pendingPopupTemplates: { name: string; collName: string; file: string; uid: string; targetUid: string }[] = [];
  // Track deployed template UIDs for state persistence
  const deployedTemplates: Record<string, { uid: string; targetUid: string; type: string; collection?: string }> = {};
  let created = 0;
  let reused = 0;
  let skipped = 0;

  for (const tpl of index) {
    // Read template spec for content + collection info
    const tplFile = path.join(tplDir, tpl.file);
    if (!fs.existsSync(tplFile)) {
      log(`  ! template ${tpl.name}: file not found (${tpl.file})`);
      skipped++;
      continue;
    }
    const tplSpec = loadYaml<Record<string, unknown>>(tplFile);
    const collName = (tpl.collection || tplSpec.collectionName) as string || '';

    // Priority 1: Match by persisted UID from state.yaml (most reliable, works in any mode)
    // state.yaml is scoped to this project — in copy mode, its UIDs refer to the Copy's
    // own templates, so reusing them is correct (prevents duplicate accumulation).
    const stateKey = `${tpl.type}:${tpl.name}`;
    const savedEntry = savedTemplateUids?.[stateKey];
    if (savedEntry?.uid) {
      // Verify the saved UID still exists in NocoBase AND matches the expected
      // collection. Without the collection check a stale state.yaml entry could
      // point at a cross-collection template (e.g. Leads state referencing an
      // Activity template) and we'd happily reuse the wrong one.
      try {
        const check = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:get`, { params: { filterByTk: savedEntry.uid } });
        const foundColl = (check.data?.data?.collectionName || '') as string;
        if (check.data?.data && (!collName || !foundColl || foundColl === collName)) {
          uidMap.set(tpl.uid, savedEntry.uid);
          if (tpl.targetUid && savedEntry.targetUid) uidMap.set(tpl.targetUid, savedEntry.targetUid);
          // Sync content
          const tplContent = tplSpec.content as Record<string, unknown>;
          if (tpl.type === 'block' && savedEntry.targetUid && tplContent) {
            try { await syncTemplateContent(nb, savedEntry.targetUid, collName, tplContent, log, `      `); } catch { /* skip */ }
          }
          deployedTemplates[stateKey] = { uid: savedEntry.uid, targetUid: savedEntry.targetUid, type: tpl.type, collection: collName };
          reused++;
          continue;
        }
      } catch { /* saved UID no longer valid, fall through to name matching */ }
    }

    // Priority 1.5: Match by the DSL-declared uid directly. duplicate-project
    // mints fresh uids; the first push creates a template with that uid. On a
    // re-push (state.yaml wiped or absent), state-based Priority 1 misses but
    // the live template with that uid is still there. Without this check we
    // would mint a NEW template each push and the count explodes.
    if (tpl.uid && tpl.uid.length >= 8) {
      try {
        const check = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:get`, { params: { filterByTk: tpl.uid } });
        const existingByDslUid = check.data?.data;
        const foundColl = (existingByDslUid?.collectionName || '') as string;
        if (existingByDslUid && (!collName || !foundColl || foundColl === collName)) {
          // Live template with the DSL's uid — reuse it (no remap needed)
          uidMap.set(tpl.uid, existingByDslUid.uid);
          if (tpl.targetUid && existingByDslUid.targetUid) uidMap.set(tpl.targetUid, existingByDslUid.targetUid);
          const tplContent = tplSpec.content as Record<string, unknown>;
          if (tpl.type === 'block' && existingByDslUid.targetUid && tplContent) {
            try { await syncTemplateContent(nb, existingByDslUid.targetUid, collName, tplContent, log, `      `); } catch { /* skip */ }
          }
          deployedTemplates[stateKey] = { uid: existingByDslUid.uid, targetUid: existingByDslUid.targetUid, type: tpl.type, collection: collName };
          reused++;
          continue;
        }
      } catch { /* not found — fall through to create */ }
    }

    // Priority 2: Match by name + collection (fallback)
    // In copy mode: skip reuse — always create independent templates
    const matchKey = makeMatchKey(tpl.name, collName);
    // Use the strict (name+collection) match first; only fall back to name-only
    // when the name-only hit ALSO belongs to the right collection (prevents
    // cross-collection pollution when multiple templates share the same name).
    const nameFallback = existingByName.get(tpl.name);
    const nameFallbackSafe = nameFallback && (!collName || !nameFallback.collectionName || nameFallback.collectionName === collName)
      ? nameFallback : undefined;
    // Reuse an existing live template if its (name, collection) matches the
    // DSL — but only when the DSL didn't declare a uid. With a DSL-declared
    // uid (the duplicate-project workflow), we always use that uid so each
    // project owns isolated templates.
    const dslHasUid = !!(tpl.uid && tpl.uid.length >= 8);
    const existingEntry = dslHasUid ? undefined : (existingByKey.get(matchKey) || nameFallbackSafe);
    if (existingEntry) {
      uidMap.set(tpl.uid, existingEntry.uid);
      if (tpl.targetUid && existingEntry.targetUid) {
        uidMap.set(tpl.targetUid, existingEntry.targetUid);
      }
      // Validate template fields against live collection (catch stale/wrong field names)
      const tplContent = tplSpec.content as Record<string, unknown>;
      if (tplContent?.fields && collName) {
        try {
          const fResp = await nb.http.get(`${nb.baseUrl}/api/collections/${collName}/fields:list`, { params: { paginate: false } });
          const liveFieldNames = new Set((fResp.data.data || []).map((f: any) => f.name as string));
          if (liveFieldNames.size) {
            const specFields = ((tplContent.fields as unknown[]) || []).map((f: any) => typeof f === 'string' ? f : (f.field || f.fieldPath || '')).filter(Boolean);
            const missing = specFields.filter(f => !liveFieldNames.has(f));
            if (missing.length) {
              log(`  ✗ template "${tpl.name}": fields not in ${collName}: ${missing.join(', ')} — fix the template YAML`);
              skipped++;
              continue;
            }
          }
        } catch { /* skip validation if API fails */ }
      }
      // Sync block template content (fields + layout). Popup templates have different structure.
      if (tpl.type === 'block' && existingEntry.targetUid && tplContent) {
        try {
          await syncTemplateContent(nb, existingEntry.targetUid, collName, tplContent, log, `      `);
        } catch (e) {
          log(`  ! template sync ${tpl.name}: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
        }
      }
      deployedTemplates[stateKey] = { uid: existingEntry.uid, targetUid: existingEntry.targetUid, type: tpl.type, collection: collName };
      reused++;
      continue;
    }

    // Template is new — create it
    const content = tplSpec.content as Record<string, unknown>;
    if (!content) {
      log(`  ! template ${tpl.name}: no content in spec`);
      skipped++;
      continue;
    }

    // Validate fields against collection metadata
    if (collName && content.fields) {
      try {
        const fResp = await nb.http.get(`${nb.baseUrl}/api/collections/${collName}/fields:list`, { params: { paginate: false } });
        const liveFields = new Set((fResp.data.data || []).map((f: any) => f.name as string));
        if (liveFields.size) {
          const specFields = ((content.fields as unknown[]) || []).map((f: any) => typeof f === 'string' ? f : (f.field || f.fieldPath || '')).filter(Boolean);
          const missing = specFields.filter(f => !liveFields.has(f));
          if (missing.length) {
            log(`  ✗ template ${tpl.name}: fields not in ${collName}: ${missing.join(', ')}`);
            skipped++;
            continue;
          }
        }
      } catch { /* skip validation if API fails */ }
    }

    try {
      let result: { templateUid: string; targetUid: string } | undefined;

      if (tpl.type === 'block') {
        // Pass the DSL-declared uid so saveTemplate creates the template with
        // that exact UID — DSL references stay valid without post-deploy rewrite.
        result = await createBlockTemplate(nb, tpl.name, content, collName, tplSpec, tplDir, log, tpl.uid);
      } else if (tpl.type === 'popup') {
        // Popup templates are created AFTER page deployment:
        // 1. Sugar expansion inlines the popup content into the first referencing field
        // 2. Page deploys the inline popup normally
        // 3. After deploy, convertPopupToTemplate() saves it as a template
        // 4. Subsequent fields use popupTemplateUid
        log(`    ~ popup template: ${tpl.name} (deferred — will deploy inline then convert)`);
        // Store pending info for post-deploy conversion
        pendingPopupTemplates.push({ name: tpl.name, collName, file: tpl.file, uid: tpl.uid, targetUid: tpl.targetUid });
        skipped++;
        continue;
      }

      if (!result) {
        log(`  ! template ${tpl.name}: failed to create`);
        skipped++;
        continue;
      }

      uidMap.set(tpl.uid, result.templateUid);
      if (tpl.targetUid) {
        uidMap.set(tpl.targetUid, result.targetUid);
      }
      deployedTemplates[stateKey] = { uid: result.templateUid, targetUid: result.targetUid, type: tpl.type, collection: collName };
      // Apply block-level extras (fieldLinkageRules / fieldValueRules / event_flows)
      // that compose doesn't carry. Mirrors the syncTemplateContent path so rules
      // show up on the first deploy, not just on redeploys.
      if (tpl.type === 'block' && tplSpec.content && result.targetUid) {
        try {
          await applyTemplateExtras(nb, result.targetUid, tplSpec.content as Record<string, unknown>, log, '      ');
        } catch (e) { log(`      ! template extras: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }
      }
      // Seed per-run block template cache so later popup conversions reuse
      // this template instead of creating yet another copy for the same
      // (useModel, collection) pair.
      log(`  + template "${tpl.name}" (${tpl.type}) → ${result.templateUid}`);
      created++;
    } catch (e: any) {
      // Extract the actual NocoBase error message for visibility — generic
      // "Request failed with status code 400" doesn't help debug anything.
      const nbMsg = e?.response?.data?.errors?.[0]?.message
        || e?.response?.data?.message
        || (e instanceof Error ? e.message : String(e));
      log(`  ! template ${tpl.name}: ${String(nbMsg).slice(0, 200)}`);
      skipped++;
    }
  }

  log(`  templates: ${created} created, ${reused} reused${skipped ? `, ${skipped} deferred/skipped` : ''}`);

  // Post-template: bind m2o popup templates on all block template targets
  // (template blocks don't go through fillBlock, so enableM2oClickToOpen doesn't run on them)
  for (const tpl of index) {
    if (tpl.type !== 'block') continue;
    const tplFile = path.join(tplDir, tpl.file);
    if (!fs.existsSync(tplFile)) continue;
    const tplSpec = loadYaml<Record<string, unknown>>(tplFile);
    const collName = (tpl.collection || tplSpec.collectionName) as string || '';
    if (!collName) continue;
    const stateKey = `${tpl.type}:${tpl.name}`;
    const deployed = deployedTemplates[stateKey];
    if (!deployed?.targetUid) continue;
    try {
      const { enableM2oClickToOpen } = await import('./block-filler');
      await enableM2oClickToOpen(nb, deployed.targetUid, collName, path.dirname(tplFile), log);
    } catch { /* skip */ }
  }

  return { uidMap, pendingPopupTemplates, deployedTemplates };
}

// ── Block template creation ──

/**
 * Create a block template via saveTemplate flow:
 *   1. Create temporary hidden page
 *   2. Compose the block content on that page
 *   3. Call flowSurfaces:saveTemplate to snapshot the block as a template
 *   4. Delete the temporary page
 */
async function createBlockTemplate(
  nb: NocoBaseClient,
  name: string,
  content: Record<string, unknown>,
  collName: string,
  tplSpec: Record<string, unknown>,
  tplDir: string,
  log: (msg: string) => void,
  declaredUid?: string,  // DSL-declared template UID — honored by NocoBase's saveTemplate
): Promise<{ templateUid: string; targetUid: string } | undefined> {
  // Strip resource_binding for template compose — temp page has no record context.
  // The binding will be set when the template is actually used in a popup.
  const { resource_binding, ...contentForCompose } = content;
  const composeBlock = toComposeBlock(contentForCompose as any, collName);
  if (!composeBlock) {
    // Fallback: block type not supported by compose — use direct model creation
    return createBlockTemplateViaModel(nb, name, content, collName, tplSpec);
  }

  // 1. Create temporary page
  const tempPage = await createTempPage(nb);
  if (!tempPage) return undefined;

  try {
    // 2. Compose the block
    const result = await nb.surfaces.compose(tempPage.tabUid, [composeBlock], 'replace');
    const blockUid = result.blocks?.[0]?.uid;
    if (!blockUid) {
      log(`    . compose returned no block UID for "${name}"`);
      return undefined;
    }

    // 2b. Apply field_layout + dividers to the composed block (before saving as template)
    const fieldLayout = content.field_layout as unknown[] | undefined;
    if (fieldLayout?.length) {
      try {
        // Get grid UID
        const blockData = await nb.get({ uid: blockUid });
        const gridNode = blockData.tree.subModels?.grid;
        const formGridUid = (gridNode as Record<string, unknown>)?.uid as string || '';
        if (formGridUid) {
          // Deploy dividers first
          const { deployDividers } = await import('./fillers/divider-filler');
          const { applyFieldLayout } = await import('./fillers/field-layout');
          const fCtx: DeployContext = { nb, log, force: false };
          await deployDividers(fCtx, formGridUid, content as any, {});
          // Apply layout
          await applyFieldLayout(fCtx, formGridUid, fieldLayout, content as any);
          log(`    ~ template field_layout applied (${fieldLayout.length} rows)`);
        }
      } catch (e) {
        log(`    . template field_layout: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
      }
    }

    // 3. If the DSL declares a stable uid AND an existing template at that uid
    // matches our (collection), reuse it instead of creating another. NB's
    // saveTemplate API rejects a root-level `uid` field (see service-utils.ts
    // hasLegacyLocatorFields with allowRootUid:true), so we can't force the
    // server to pick our uid — we can only opt into reuse when the row happens
    // to exist at that uid already. All other cases get a server-generated
    // uid and rely on rewriteTemplateUids to remap DSL references.
    if (declaredUid) {
      try {
        const existing = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:get`, { params: { filterByTk: declaredUid } });
        const row = existing.data?.data;
        if (row?.collectionName === collName) {
          log(`    = template: ${name} (reused by declared uid: ${declaredUid.slice(0, 8)})`);
          return { templateUid: declaredUid, targetUid: row.targetUid as string };
        }
      } catch { /* not found — will create with server-generated uid */ }
    }

    const saveResult = await nb.surfaces.saveTemplate({
      target: { uid: blockUid },
      name,
      description: name,
      type: 'block',
      collectionName: collName,
      dataSourceKey: (tplSpec.dataSourceKey as string) || 'main',
      saveMode: 'duplicate',
    }) as Record<string, unknown>;

    const templateUid = (saveResult.uid || saveResult.templateUid) as string;
    const targetUid = (saveResult.targetUid) as string || blockUid;
    trackCreatedTemplate(templateUid);

    if (!templateUid) {
      // Fallback: saveTemplate didn't return expected format — register manually
      return registerTemplateManually(nb, name, 'block', collName, tplSpec, blockUid);
    }

    return { templateUid, targetUid };
  } finally {
    // 4. Clean up temporary page
    await deleteTempPage(nb, tempPage);
  }
}


/**
 * Fix grid layout UIDs after tree duplication (saveTemplate/deepCopy).
 *
 * When NocoBase duplicates a tree (saveTemplate convert/duplicate), all nodes get new UIDs
 * but gridSettings.rows still references the OLD UIDs. This function walks the tree
 * (multi-level fetch via flowSurfaces:get per node) and remaps orphan row UIDs to actual
 * item UIDs by position.
 *
 * Why multi-level fetch: flowSurfaces:get?uid=X returns only 1 shallow level of subModels.
 * A popup template's grid lives 3-4 levels deep (field → ChildPage → tab → grid → items),
 * so a single fetch misses all the grids. We must fetch each intermediate node.
 */
export async function fixGridLayoutUids(
  nb: NocoBaseClient,
  rootUid: string,
  log: (msg: string) => void,
): Promise<void> {
  const allUids = new Set<string>();
  const gridNodes: { uid: string; rows: Record<string, string[][]>; sizes?: Record<string, number[]>; items: string[] }[] = [];
  const visited = new Set<string>();

  // flowSurfaces:get supports different query params per model type:
  //   uid=<x>              — single node (subModels usually shallow or null)
  //   pageSchemaUid=<x>    — ChildPage under a field + direct subModels.tabs
  //   tabSchemaUid=<x>     — Tab + its BlockGridModel (grid) + grid.subModels.items
  // We combine these to reach grids that are 3-4 levels below the template's target UID.

  function collectFromNode(node: any): void {
    if (!node) return;
    allUids.add(node.uid);
    const gs = node.stepParams?.gridSettings?.grid;
    if (gs?.rows && typeof gs.rows === 'object') {
      const items = node.subModels?.items;
      const itemUids = (Array.isArray(items) ? items : []).map((i: any) => i.uid).filter(Boolean) as string[];
      for (const u of itemUids) allUids.add(u);
      gridNodes.push({ uid: node.uid, rows: gs.rows, sizes: gs.sizes, items: itemUids });
    }
    // Also record direct children's UIDs so the orphan check sees them
    const subs = node.subModels;
    if (subs && typeof subs === 'object') {
      for (const v of Object.values(subs)) {
        if (Array.isArray(v)) { for (const c of v) if (c?.uid) allUids.add(c.uid); }
        else if (v && typeof v === 'object' && (v as any).uid) allUids.add((v as any).uid);
      }
    }
  }

  async function fetchBy(params: Record<string, string>): Promise<any> {
    try {
      const data = await nb.get(params);
      return data?.tree;
    } catch { return null; }
  }

  async function walk(uid: string, asPage = false): Promise<void> {
    if (!uid || visited.has(uid)) return;
    visited.add(uid);
    // Fetch the node directly first (to read its stepParams / openView)
    const self = await fetchBy({ uid });
    if (self) collectFromNode(self);
    // For template targets (field models), fetch the popup page + its tabs
    const page = await fetchBy(asPage ? { pageSchemaUid: uid } : { pageSchemaUid: uid });
    if (page) {
      collectFromNode(page);
      const tabs = Array.isArray(page.subModels?.tabs) ? page.subModels.tabs : [];
      for (const tab of tabs) {
        if (!tab?.uid || visited.has(tab.uid)) continue;
        visited.add(tab.uid);
        // tabSchemaUid gives tab + BlockGridModel in subModels.grid + grid.subModels.items
        const fullTab = await fetchBy({ tabSchemaUid: tab.uid });
        const tabNode = fullTab || tab;
        collectFromNode(tabNode);
        const grid = tabNode.subModels?.grid;
        if (grid) {
          // Fetch grid directly so subModels.items is populated reliably
          const fullGrid = await fetchBy({ uid: grid.uid });
          collectFromNode(fullGrid || grid);
        }
      }
    }
    // Follow openView.uid when it points somewhere else (rare — usually self-ref)
    const openUid = self?.stepParams?.popupSettings?.openView?.uid;
    if (openUid && openUid !== uid) await walk(openUid);
  }
  await walk(rootUid);

  // For each grid: check if row UIDs are orphaned, remap by position
  for (const gn of gridNodes) {
    // Flatten all UIDs from rows
    const rowUids: string[] = [];
    for (const cols of Object.values(gn.rows)) {
      for (const col of cols) {
        for (const uid of col) rowUids.push(uid);
      }
    }

    // Check if any are orphaned (not in tree)
    const orphaned = rowUids.filter(u => !allUids.has(u));
    if (!orphaned.length) continue;

    // Items already referenced by non-orphan rowUids (keep their slots)
    const keptItems = new Set(rowUids.filter(u => allUids.has(u)));
    // Items NOT yet referenced — candidates to fill orphan slots, in API return order
    const unusedItems = gn.items.filter(u => !keptItems.has(u));

    // Walk orphan positions in row order, assign next unused item each time
    const posMap = new Map<string, string>();
    let u = 0;
    for (const rowUid of rowUids) {
      if (!allUids.has(rowUid) && u < unusedItems.length) {
        if (!posMap.has(rowUid)) {
          posMap.set(rowUid, unusedItems[u]);
          u++;
        }
      }
    }

    // Remap rows
    const newRows: Record<string, string[][]> = {};
    for (const [rowKey, cols] of Object.entries(gn.rows)) {
      const newRowKey = posMap.get(rowKey) || rowKey;
      newRows[newRowKey] = cols.map(col => col.map(uid => posMap.get(uid) || uid));
    }
    const newSizes: Record<string, number[]> = {};
    if (gn.sizes) {
      for (const [key, val] of Object.entries(gn.sizes)) {
        newSizes[posMap.get(key) || key] = val;
      }
    }

    try {
      await nb.updateModel(gn.uid, { gridSettings: { grid: { rows: newRows, sizes: gn.sizes ? newSizes : undefined } } });
      log(`      ~ grid layout fixed: ${orphaned.length} UIDs remapped`);
    } catch (e) {
      log(`      ! grid layout fix: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    }
  }
}

// ── Fallback: direct model creation for unsupported block types ──
//
// For legacy blocks that compose API doesn't support (mailMessages, comments,
// recordHistory, reference), create a standalone block via flowModels:save and
// register as template directly. No saveTemplate(duplicate) — the standalone
// block IS the template target.
async function createBlockTemplateViaModel(
  nb: NocoBaseClient,
  name: string,
  content: Record<string, unknown>,
  collName: string,
  tplSpec: Record<string, unknown>,
): Promise<{ templateUid: string; targetUid: string } | undefined> {
  const btype = (content.type as string) || '';
  const useModel = BLOCK_TYPE_TO_MODEL[btype];
  if (!useModel) return undefined;

  const blockUid = generateUid();
  const resourceSettings: Record<string, unknown> = {
    init: { dataSourceKey: (tplSpec.dataSourceKey as string) || 'main', collectionName: collName },
  };
  try {
    await nb.models.save({
      uid: blockUid,
      name: blockUid,
      use: useModel,
      stepParams: { resourceSettings },
      flowRegistry: {},
    });
  } catch {
    return undefined;
  }

  return registerTemplateManually(nb, name, 'block', collName, tplSpec, blockUid);
}

// ── Manual template registration ──

async function registerTemplateManually(
  nb: NocoBaseClient,
  name: string,
  type: 'popup' | 'block',
  collName: string,
  tplSpec: Record<string, unknown>,
  targetUid: string,
): Promise<{ templateUid: string; targetUid: string } | undefined> {
  // flowModelTemplates:create expects FLAT body — wrapping in `values` returns
  // 200 OK with errors:["name cannot be null", "targetUid cannot be null"].
  const newUid = generateUid();
  const resp = await nb.http.post(`${nb.baseUrl}/api/flowModelTemplates:create`, {
    uid: newUid,
    name,
    type,
    collectionName: collName,
    dataSourceKey: (tplSpec.dataSourceKey as string) || 'main',
    targetUid,
  });

  const createdUid = resp.data?.data?.uid as string;
  if (createdUid) {
    return { templateUid: createdUid, targetUid };
  }
  return undefined;
}

// ── Temp page lifecycle ──

interface TempPage {
  routeId: number;
  pageUid: string;
  tabUid: string;
  gridUid: string;
}

/**
 * Create a temporary hidden page for composing template content.
 * Returns page info needed for compose and cleanup.
 */
async function createTempPage(
  nb: NocoBaseClient,
): Promise<TempPage | undefined> {
  try {
    // Create a hidden menu item
    const menu = await nb.surfaces.createMenu({
      title: `_tpl_temp_${generateUid(6)}`,
      type: 'item',
      icon: 'fileoutlined',
    });

    // Create the page surface
    const page = await nb.surfaces.createPage(menu.routeId);

    return {
      routeId: menu.routeId,
      pageUid: page.pageUid,
      tabUid: page.tabSchemaUid,
      gridUid: page.gridUid,
    };
  } catch {
    return undefined;
  }
}

/**
 * Delete a temporary page and its route.
 */
async function deleteTempPage(
  nb: NocoBaseClient,
  tempPage: TempPage,
): Promise<void> {
  try {
    // Delete the route (cascades to page content)
    await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:destroy`, {
      filterByTk: tempPage.routeId,
    });
  } catch {
    // Best-effort cleanup — don't fail the template deploy
    try {
      await nb.surfaces.destroyPage(tempPage.pageUid);
    } catch { /* ignore */ }
  }
}

// ── Matching helpers ──

/**
 * Build a match key from name + collection.
 * Templates are unique by name + collectionName.
 */
function makeMatchKey(name: string, collection: string): string {
  return `${name}|${collection || ''}`.toLowerCase();
}

// ── Template usage registration ──

