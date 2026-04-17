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
import { toComposeBlock } from './block-composer';

interface TemplateIndex {
  uid: string;
  name: string;
  type: 'popup' | 'block';
  collection?: string;
  targetUid: string;
  file: string;
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
          const fCtx: DeployContext = { nb, log, force: false, copyMode: false };
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
        const fCtx: DeployContext = { nb, log, force: false, copyMode: false };
        await deployDividers(fCtx, gridUid, content as any, {});
        await applyFieldLayout(fCtx, gridUid, fieldLayout, content as any);
      }
    }
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
  copyMode = false,
  savedTemplateUids?: Record<string, { uid: string; targetUid: string; type: string; collection?: string }>,
): Promise<DeployTemplatesResult> {
  const tplDir = path.join(projectDir, 'templates');
  if (!fs.existsSync(tplDir)) return { uidMap: new Map(), pendingPopupTemplates: [], deployedTemplates: {} };

  // Build index: prefer _index.yaml, then auto-discover YAML files
  let index: TemplateIndex[];
  const indexFile = path.join(tplDir, '_index.yaml');
  if (fs.existsSync(indexFile)) {
    index = loadYaml<TemplateIndex[]>(indexFile) || [];
  } else {
    index = discoverTemplates(tplDir);
  }
  if (!index.length) return { uidMap: new Map(), pendingPopupTemplates: [], deployedTemplates: {} };

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
      // Verify the saved UID still exists in NocoBase
      try {
        const check = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:get`, { params: { filterByTk: savedEntry.uid } });
        if (check.data?.data) {
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

    // Priority 2: Match by name + collection (fallback)
    // In copy mode: skip reuse — always create independent templates
    const matchKey = makeMatchKey(tpl.name, collName);
    const existingEntry = copyMode ? undefined : (existingByKey.get(matchKey) || existingByName.get(tpl.name));
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
        result = await createBlockTemplate(nb, tpl.name, content, collName, tplSpec, tplDir, log);
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
      log(`  + template "${tpl.name}" (${tpl.type}) → ${result.templateUid}`);
      created++;
    } catch (e) {
      log(`  ! template ${tpl.name}: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
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
          const fCtx: DeployContext = { nb, log, force: false, copyMode: false };
          await deployDividers(fCtx, formGridUid, content as any, {});
          // Apply layout
          await applyFieldLayout(fCtx, formGridUid, fieldLayout, content as any);
          log(`    ~ template field_layout applied (${fieldLayout.length} rows)`);
        }
      } catch (e) {
        log(`    . template field_layout: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
      }
    }

    // 3. Save as template via flowSurfaces:saveTemplate
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

// ── Popup template: deferred creation ──
// Deploy popup as inline content first, then convert the block to a template.
//
// Two-step flow (matches NocoBase UI behavior):
//   1. flowModelTemplates:create — register the existing block as template (detachParent: true)
//   2. flowModels:save — create ReferenceBlockModel in the same grid position

/**
 * Convert an already-deployed inline popup into a reusable popup template.
 *
 * Uses flowSurfaces:saveTemplate with saveMode:'convert':
 *   - Duplicates popup content tree
 *   - Registers as popup template (type:'popup')
 *   - Updates host openView with popupTemplateUid + popupTemplateHasFilterByTk
 *   - Cleans up inline popup content
 *
 * @param targetUid - The popup host field/action UID (from state.popups.target_uid)
 * @param name - Template name
 * @param collName - Collection name
 */
export async function convertPopupToTemplate(
  nb: NocoBaseClient,
  targetUid: string,
  name: string,
  collName: string,
  log: (msg: string) => void = console.log,
  copyMode = false,
  savedPopupUid?: string,  // from state.yaml — reuse if valid
  allowedBlockTemplateUids?: Set<string>,  // in copy mode, restricts nested block template reuse
): Promise<{ templateUid: string; targetUid: string } | undefined> {
  try {
    // Find the actual host field/action model (might be wrapped in a column)
    let hostUid = targetUid;
    try {
      const data = await nb.get({ uid: targetUid });
      const field = data.tree.subModels?.field;
      if (field && !Array.isArray(field)) {
        hostUid = (field as Record<string, unknown>).uid as string || targetUid;
      }
    } catch { /* use targetUid as-is */ }

    // Check if host already has a popup template
    const hostResp = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, { params: { filterByTk: hostUid } });
    const existingTplUid = hostResp.data?.data?.stepParams?.popupSettings?.openView?.popupTemplateUid as string | undefined;
    if (existingTplUid && typeof existingTplUid === 'string' && existingTplUid.length > 5) {
      // Verify the template still exists
      try {
        const existingTpl = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:get`, { params: { filterByTk: existingTplUid } });
        const existingTargetUid = existingTpl.data?.data?.targetUid || '';
        log(`    = popup template: ${name} (already converted: ${existingTplUid.slice(0, 8)})`);

        // Fix openView: uid → template targetUid, collectionName → not empty
        const ov = hostResp.data?.data?.stepParams?.popupSettings?.openView;
        const needsFix = (existingTargetUid && ov?.uid !== existingTargetUid) || !ov?.collectionName;
        if (needsFix) {
          const sp = hostResp.data.data.stepParams;
          if (existingTargetUid) sp.popupSettings.openView.uid = existingTargetUid;
          if (!sp.popupSettings.openView.collectionName) sp.popupSettings.openView.collectionName = collName;
          await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
            uid: hostUid, use: hostResp.data.data.use, parentId: hostResp.data.data.parentId,
            subKey: hostResp.data.data.subKey, subType: hostResp.data.data.subType,
            sortIndex: hostResp.data.data.sortIndex || 0, flowRegistry: hostResp.data.data.flowRegistry || {},
            stepParams: sp,
          });
          log(`      ~ openView.uid fixed → ${existingTargetUid.slice(0, 8)}`);
        }

        // Clean up stale inline popup content if template exists
        try {
          const tree = await nb.get({ uid: hostUid });
          const page = tree.tree.subModels?.page;
          if (page?.uid) {
            await nb.http.post(`${nb.baseUrl}/api/flowModels:destroy`, {}, { params: { filterByTk: page.uid } }).catch(() => {});
            log(`      ~ cleared stale inline popup`);
          }
        } catch { /* skip */ }

        // Re-run grid UID fix (older deploys may have left orphan UIDs in rows).
        // Also check if blocks inside need converting to block templates.
        if (existingTargetUid) {
          await fixGridLayoutUids(nb, existingTargetUid, log);
          await convertPopupBlocksToTemplates(nb, existingTargetUid, collName, log, allowedBlockTemplateUids);
        }
        return { templateUid: existingTplUid, targetUid: existingTargetUid };
      } catch {
        // Template deleted — clear stale ref so convert can proceed
        const ov = hostResp.data.data.stepParams.popupSettings.openView;
        delete ov.popupTemplateUid;
        delete ov.popupTemplateMode;
        delete ov.popupTemplateHasFilterByTk;
        delete ov.popupTemplateHasSourceId;
        const d = hostResp.data.data;
        await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
          uid: hostUid, use: d.use, parentId: d.parentId,
          subKey: d.subKey, subType: d.subType,
          sortIndex: d.sortIndex || 0, flowRegistry: d.flowRegistry || {},
          stepParams: d.stepParams,
        });
        log(`    ~ cleared stale popupTemplateUid on ${name}`);
      }
    }

    // Priority: if state.yaml saved a UID for this popup, try to reuse it first
    if (savedPopupUid) {
      try {
        const check = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:get`, { params: { filterByTk: savedPopupUid } });
        if (check.data?.data) {
          const reuseUid = savedPopupUid;
          const reuseTargetUid = check.data.data.targetUid || '';
          log(`    = popup template: ${name} (reused from state: ${reuseUid.slice(0, 8)})`);
          const sp = hostResp.data.data.stepParams;
          sp.popupSettings = sp.popupSettings || {};
          sp.popupSettings.openView = sp.popupSettings.openView || {};
          sp.popupSettings.openView.popupTemplateUid = reuseUid;
          sp.popupSettings.openView.collectionName = collName;
          if (reuseTargetUid) sp.popupSettings.openView.uid = reuseTargetUid;
          const d = hostResp.data.data;
          await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
            uid: hostUid, use: d.use, parentId: d.parentId,
            subKey: d.subKey, subType: d.subType,
            sortIndex: d.sortIndex || 0, flowRegistry: d.flowRegistry || {},
            stepParams: sp,
          });
          // Clear stale inline popup since we have a template
          try {
            const tree = await nb.get({ uid: hostUid });
            const page = tree.tree.subModels?.page;
            if (page?.uid) await nb.http.post(`${nb.baseUrl}/api/flowModels:destroy`, {}, { params: { filterByTk: page.uid } }).catch(() => {});
          } catch { /* skip */ }
          return { templateUid: reuseUid, targetUid: reuseTargetUid };
        }
      } catch { /* saved UID invalid, fall through */ }
    }

    // Name-based reuse — only in non-copy mode (copy mode needs independent templates per group)
    if (copyMode) {
      // Skip name lookup entirely — fall through to create new template
    } else try {
      const existingList = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:list`, {
        params: { paginate: 'false', 'filter[name]': name, 'filter[collectionName]': collName },
      });
      const existing = (existingList.data?.data || []) as Record<string, unknown>[];
      if (existing.length) {
        const reuse = existing[0];
        const reuseUid = reuse.uid as string;
        log(`    = popup template: ${name} (reusing existing: ${reuseUid.slice(0, 8)})`);
        // Set popupTemplateUid on host
        const sp = hostResp.data.data.stepParams;
        sp.popupSettings = sp.popupSettings || {};
        sp.popupSettings.openView = sp.popupSettings.openView || {};
        sp.popupSettings.openView.popupTemplateUid = reuseUid;
        sp.popupSettings.openView.collectionName = collName;
        const d = hostResp.data.data;
        await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
          uid: hostUid, use: d.use, parentId: d.parentId,
          subKey: d.subKey, subType: d.subType,
          sortIndex: d.sortIndex || 0, flowRegistry: d.flowRegistry || {},
          stepParams: sp,
        });
        return { templateUid: reuseUid, targetUid: (reuse.targetUid || '') as string };
      }
    } catch { /* proceed to create */ }

    const result = await nb.surfaces.saveTemplate({
      target: { uid: hostUid },
      name,
      description: name,
      collectionName: collName,
      dataSourceKey: 'main',
      saveMode: 'convert',
    }) as Record<string, unknown>;

    const newTemplateUid = (result.uid || result.templateUid) as string;
    const newTargetUid = (result.targetUid) as string;

    if (newTemplateUid) {
      log(`    + popup template: ${name} (${newTemplateUid}, coll: ${collName})`);

      // Step 2: Fix grid layout UIDs — saveTemplate(convert) duplicates the tree
      // but doesn't remap gridSettings.rows UIDs to the new item UIDs.
      if (newTargetUid) {
        await fixGridLayoutUids(nb, newTargetUid, log);
      }

      // Step 3: Convert blocks inside popup template to block template references.
      if (newTargetUid) {
        await convertPopupBlocksToTemplates(nb, newTargetUid, collName, log, allowedBlockTemplateUids);
      }

      return { templateUid: newTemplateUid, targetUid: newTargetUid };
    }
  } catch (e) {
    log(`    . popup template convert: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }
  return undefined;
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
async function fixGridLayoutUids(
  nb: NocoBaseClient,
  rootUid: string,
  log: (msg: string) => void,
): Promise<void> {
  const allUids = new Set<string>();
  const gridNodes: { uid: string; rows: Record<string, string[][]>; sizes?: Record<string, number[]>; items: string[] }[] = [];
  const visited = new Set<string>();

  // Fetch direct children via flowModels:list?filter[parentId] — reliable across model types
  // where flowSurfaces:get returns only partial subModels.
  async function listChildren(parentUid: string): Promise<any[]> {
    try {
      const resp = await nb.http.get(`${nb.baseUrl}/api/flowModels:list`, {
        params: { 'filter[parentId]': parentUid, paginate: 'false', pageSize: 200 },
      });
      return (resp.data?.data || []) as any[];
    } catch { return []; }
  }

  // Walk the tree starting at uid, fetching each node + its children explicitly.
  async function walk(uid: string): Promise<void> {
    if (!uid || visited.has(uid)) return;
    visited.add(uid);
    let node: any;
    try {
      const resp = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, { params: { filterByTk: uid } });
      node = resp.data?.data;
    } catch { return; }
    if (!node) return;
    allUids.add(node.uid);

    // Fetch direct children via list (flowSurfaces:get doesn't always recurse deep enough)
    const children = await listChildren(node.uid);
    for (const c of children) if (c?.uid) allUids.add(c.uid);

    const gs = node.stepParams?.gridSettings?.grid;
    if (gs?.rows && typeof gs.rows === 'object') {
      // Grid's items (blocks) are among the direct children, identified by subKey='items'
      const itemUids = children.filter(c => c.subKey === 'items').map(c => c.uid as string);
      gridNodes.push({ uid: node.uid, rows: gs.rows, sizes: gs.sizes, items: itemUids });
    }

    // Recurse into all children
    for (const c of children) await walk(c.uid as string);

    // Also follow popup openView uid (field → popup content root) when it points elsewhere
    const openUid = node.stepParams?.popupSettings?.openView?.uid;
    if (openUid && openUid !== node.uid) await walk(openUid);
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

/**
 * Convert real blocks inside a popup template to block template references.
 *
 * Walks the popup template's content tree, finds DetailsBlockModel/EditFormModel/CreateFormModel,
 * and converts each to: flowModelTemplates:create(detachParent) + ReferenceBlockModel.
 */
async function convertPopupBlocksToTemplates(
  nb: NocoBaseClient,
  popupTargetUid: string,
  collName: string,
  log: (msg: string) => void,
  allowedBlockTemplateUids?: Set<string>,  // in copy mode, only these templates may be reused
): Promise<void> {
  const BLOCK_USES = new Set(['DetailsBlockModel', 'EditFormModel', 'CreateFormModel']);
  const BLOCK_NAMES: Record<string, string> = {
    DetailsBlockModel: 'Detail',
    EditFormModel: 'Form (Edit)',
    CreateFormModel: 'Form (Add new)',
  };

  try {
    // Get popup template target tree — try flowSurfaces:get first, fallback to flowModels:get
    let tree: any;
    try {
      const data = await nb.get({ uid: popupTargetUid });
      tree = data.tree;
    } catch {
      // flowSurfaces:get may not work for detached template targets
      const fm = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, { params: { filterByTk: popupTargetUid } });
      tree = fm.data?.data;
    }
    if (!tree) return;

    // Walk tree to find blocks + their parent grid
    const blocks: { uid: string; use: string; parentId: string; sortIndex: number }[] = [];
    function walkTree(node: any, gridUid: string | null) {
      if (!node || typeof node !== 'object') return;
      const curGrid = node.use === 'BlockGridModel' ? node.uid : gridUid;
      if (BLOCK_USES.has(node.use) && curGrid) {
        blocks.push({ uid: node.uid, use: node.use, parentId: curGrid, sortIndex: node.sortIndex || 0 });
      }
      const subs = node.subModels;
      if (subs) for (const v of Object.values(subs)) {
        if (Array.isArray(v)) (v as any[]).forEach(i => walkTree(i, curGrid));
        else if (v && typeof v === 'object') walkTree(v, curGrid);
      }
    }
    walkTree(tree, null);
    if (!blocks.length) return;

    // Find existing block templates (by useModel + collectionName) to reuse.
    // In copy mode: restrict to allowedBlockTemplateUids (this group's own templates only).
    const allTpls = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:list`, { params: { paginate: false } });
    const existingByUseModel = new Map<string, { uid: string; targetUid: string; name: string }>();
    for (const t of (allTpls.data?.data || []) as Record<string, unknown>[]) {
      if (t.type !== 'block' || t.collectionName !== collName) continue;
      if (allowedBlockTemplateUids && !allowedBlockTemplateUids.has(t.uid as string)) continue;
      const key = `${t.useModel}|${t.collectionName}`;
      // Prefer templates from _index.yaml (longer names with collection prefix)
      if (!existingByUseModel.has(key) || (t.name as string).length > (existingByUseModel.get(key)!.name.length)) {
        existingByUseModel.set(key, { uid: t.uid as string, targetUid: t.targetUid as string, name: t.name as string });
      }
    }

    for (const block of blocks) {
      const key = `${block.use}|${collName}`;
      const existing = existingByUseModel.get(key);

      try {
        if (existing) {
          // Reuse existing block template → ReferenceBlockModel pointing to it
          const refUid = generateUid();
          await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
            uid: refUid,
            use: 'ReferenceBlockModel',
            parentId: block.parentId,
            subKey: 'items',
            subType: 'array',
            stepParams: {
              referenceSettings: {
                target: { targetUid: existing.targetUid, mode: 'reference' },
                useTemplate: {
                  templateUid: existing.uid,
                  templateName: existing.name,
                  templateDescription: '',
                  targetUid: existing.targetUid,
                  mode: 'reference',
                },
              },
            },
            sortIndex: block.sortIndex,
            flowRegistry: {},
          });
          // Delete the original inline block
          await nb.http.post(`${nb.baseUrl}/api/flowModels:destroy`, {}, { params: { filterByTk: block.uid } }).catch(() => {});
          log(`      = block ref: ${existing.name} (${existing.uid.slice(0, 8)})`);
        } else {
          // No existing template — detach this block as new template
          const collTitle = collName.replace(/^nb_\w+_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const tplName = `${BLOCK_NAMES[block.use] || block.use}: ${collTitle}`;
          const tplResp = await nb.http.post(`${nb.baseUrl}/api/flowModelTemplates:create`, {
            name: tplName, description: '',
            targetUid: block.uid, useModel: block.use, type: 'block',
            dataSourceKey: 'main', collectionName: collName,
            filterByTk: block.use !== 'CreateFormModel' ? '{{ctx.view.inputArgs.filterByTk}}' : null,
            detachParent: true,
          });
          const blockTplUid = tplResp.data?.data?.uid;
          if (!blockTplUid) continue;
          const refUid = generateUid();
          await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
            uid: refUid, use: 'ReferenceBlockModel',
            parentId: block.parentId, subKey: 'items', subType: 'array',
            stepParams: { referenceSettings: {
              target: { targetUid: block.uid, mode: 'reference' },
              useTemplate: { templateUid: blockTplUid, templateName: tplName, targetUid: block.uid, mode: 'reference' },
            }},
            sortIndex: block.sortIndex, flowRegistry: {},
          });
          existingByUseModel.set(key, { uid: blockTplUid, targetUid: block.uid, name: tplName });
          log(`      + block template: ${tplName} (${blockTplUid.slice(0, 8)})`);
        }
      } catch (e: any) {
        log(`      . block template ${block.use}: ${e?.response?.data?.errors?.[0]?.message?.slice(0, 60) || e?.message?.slice(0, 60) || ''}`);
      }
    }
  } catch { /* skip */ }
}

/**
 * Legacy createPopupTemplate — fallback to manual registration.
 */
async function createPopupTemplate(
  nb: NocoBaseClient,
  name: string,
  content: Record<string, unknown>,
  collName: string,
  tplSpec: Record<string, unknown>,
  tplDir: string,
  log: (msg: string) => void,
): Promise<{ templateUid: string; targetUid: string } | undefined> {
  // Strategy: create temp page → add table with clickToOpen field →
  // deploy popup content → saveTemplate on the field → cleanup
  let tempGroupId: number | null = null;
  let tempRouteId: number | null = null;

  try {
    // 1. Create temp hidden menu group + page via blueprint
    const groupResp = await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:create`, {
      type: 'group', title: '__tpl_temp__', hidden: true,
    });
    tempGroupId = groupResp.data?.data?.id;

    const bpResult = await nb.surfaces.applyBlueprint({
      version: '1', mode: 'create',
      navigation: { group: { routeId: tempGroupId }, item: { title: '__popup_tpl__' } },
      page: { title: '__popup_tpl__' },
      tabs: [{ key: 'main', title: 'Main', blocks: [
        { key: 'details', type: 'details', collection: collName },
      ] }],
    } as unknown as Record<string, unknown>) as Record<string, unknown>;

    const pageSchemaUid = (bpResult.target as Record<string, unknown>)?.pageSchemaUid as string || '';
    tempRouteId = (bpResult.target as Record<string, unknown>)?.routeId as number || null;
    if (!pageSchemaUid) throw new Error('failed to create temp page');

    // 2. Read page → find details block → add field with clickToOpen
    const pageData = await nb.get({ pageSchemaUid });
    const tabArr = Array.isArray(pageData.tree.subModels?.tabs) ? pageData.tree.subModels.tabs : [pageData.tree.subModels?.tabs];
    const gridItems = tabArr[0]?.subModels?.grid?.subModels?.items;
    const blockUid = (Array.isArray(gridItems) && gridItems.length) ? gridItems[0].uid : '';
    if (!blockUid) throw new Error('no block in temp page');

    // 3. Add a field with clickToOpen to host the popup
    const fieldResult = await nb.surfaces.addField(blockUid, 'id') as Record<string, unknown>;
    const fieldWrapperUid = fieldResult.wrapperUid || fieldResult.uid;
    if (!fieldWrapperUid) throw new Error('addField failed');

    // Get field model UID
    const blockData = await nb.get({ uid: fieldWrapperUid as string });
    const fieldModel = blockData.tree.subModels?.field;
    const fieldUid = (fieldModel && !Array.isArray(fieldModel)) ? (fieldModel as Record<string, unknown>).uid as string : '';
    if (!fieldUid) throw new Error('no field UID');

    // 4. Set popupSettings + compose popup content
    await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
      uid: fieldUid,
      stepParams: {
        popupSettings: { openView: { collectionName: collName, dataSourceKey: 'main', mode: 'drawer', size: 'large', pageModelClass: 'ChildPageModel', uid: fieldUid } },
        displayFieldSettings: { clickToOpen: { clickToOpen: true } },
      },
    });

    // Read back to get ChildPage tab UID
    const fieldData = await nb.get({ uid: fieldUid });
    let popupTabUid = '';
    const fieldPage = (fieldData.tree.subModels as Record<string, unknown>)?.page as Record<string, unknown>;
    if (fieldPage) {
      const popupTabs = fieldPage.subModels as Record<string, unknown>;
      const tabList = popupTabs?.tabs;
      const tabArr = Array.isArray(tabList) ? tabList : tabList ? [tabList] : [];
      if (tabArr.length) popupTabUid = (tabArr[0] as Record<string, unknown>).uid as string || '';
    }

    // Compose popup content
    const tabs = content.tabs as Record<string, unknown>[] | undefined;
    const blocks = content.blocks as Record<string, unknown>[] | undefined;
    const firstBlocks = tabs?.length ? (tabs[0].blocks || []) as Record<string, unknown>[] : blocks || [];

    if (popupTabUid && firstBlocks.length) {
      const composeBlocks = firstBlocks.map(b => toComposeBlock(b as any, collName)).filter(Boolean) as Record<string, unknown>[];
      if (composeBlocks.length) {
        await nb.surfaces.compose(popupTabUid, composeBlocks, 'replace');
      }
    }

    // 5. saveTemplate on the field
    const saveResult = await nb.surfaces.saveTemplate({
      target: { uid: fieldUid },
      name,
      description: '',
      saveMode: 'duplicate',
    }) as Record<string, unknown>;

    const templateUid = (saveResult.uid || saveResult.templateUid) as string;
    const targetUid = (saveResult.targetUid) as string || fieldUid;

    if (templateUid) {
      log(`    + popup template: ${name} (${templateUid})`);
      return { templateUid, targetUid };
    }
  } catch (e) {
    log(`    . popup template ${name}: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
  } finally {
    // Cleanup temp page + group (children first)
    try {
      if (tempGroupId) {
        const routes = await nb.http.get(`${nb.baseUrl}/api/desktopRoutes:list`, { params: { paginate: 'false', tree: 'true' } });
        const grp = (routes.data.data || []).find((r: any) => r.id === tempGroupId);
        if (grp?.children) for (const c of grp.children) {
          if (c.children) for (const sc of c.children) await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:destroy`, {}, { params: { filterByTk: sc.id } }).catch(() => {});
          await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:destroy`, {}, { params: { filterByTk: c.id } }).catch(() => {});
        }
        await nb.http.post(`${nb.baseUrl}/api/desktopRoutes:destroy`, {}, { params: { filterByTk: tempGroupId } }).catch(() => {});
      }
    } catch { /* best effort cleanup */ }
  }

  // Fallback: register manually
  return registerTemplateManually(nb, name, 'popup', collName, tplSpec, generateUid());
}

// ── Fallback: direct model creation for unsupported block types ──

async function createBlockTemplateViaModel(
  nb: NocoBaseClient,
  name: string,
  content: Record<string, unknown>,
  collName: string,
  tplSpec: Record<string, unknown>,
): Promise<{ templateUid: string; targetUid: string } | undefined> {
  const hostUid = generateUid();

  const composeBlock = toComposeBlock(content as any, collName);
  if (!composeBlock) return undefined;

  // Create a temporary grid to compose into
  await nb.models.save({
    uid: hostUid,
    use: 'BlockGridModel',
    stepParams: {},
    flowRegistry: {},
  });

  const result = await nb.surfaces.compose(hostUid, [composeBlock], 'replace');
  const blockUid = result.blocks?.[0]?.uid || hostUid;

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
  const newUid = generateUid();
  const resp = await nb.http.post(`${nb.baseUrl}/api/flowModelTemplates:create`, {
    values: {
      uid: newUid,
      name,
      type,
      collectionName: collName,
      dataSourceKey: (tplSpec.dataSourceKey as string) || 'main',
      targetUid,
    },
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

/**
 * Register a template usage (field/block references a template).
 */
export async function registerTemplateUsage(
  nb: NocoBaseClient,
  templateUid: string,
  modelUid: string,
): Promise<void> {
  try {
    await nb.http.post(`${nb.baseUrl}/api/flowModelTemplateUsages:create`, {
      values: {
        uid: generateUid(),
        templateUid,
        modelUid,
      },
    });
  } catch { /* skip if already exists */ }
}
