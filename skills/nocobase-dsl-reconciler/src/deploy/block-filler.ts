/**
 * Fill a compose-created block with content: JS, charts, actions, dividers, event flows.
 *
 * Compose creates empty shells (blocks + default actions). This fills them with actual content.
 * Each concern is delegated to a focused filler module in ./fillers/.
 *
 * Action design (aligned with Python deployer):
 *   compose creates → state tracks → deployActions only adds what's missing → never deletes.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NocoBaseClient } from '../client';
import type { DeployContext } from './deploy-context';
import type { BlockSpec } from '../types/spec';
import type { BlockState } from '../types/state';
import { fixDisplayModels } from './display-model-fixer';
import { ensureJsHeader, replaceJsUids } from '../utils/js-utils';
import { generateUid } from '../utils/uid';
import {
  deployClickToOpen,
  configureFilter,
  deployChart,
  deployActions,
  deployJsItems,
  deployJsColumns,
  deployDividers,
  deployEventFlows,
  applyFieldLayout,
  syncGridItemsOrder,
} from './fillers';

const RECORD_ACTION_BLOCKS = new Set(['details', 'list', 'gridCard']);
const GRID_BLOCK_TYPES = new Set(['createForm', 'editForm', 'filterForm', 'details']);
const FORM_BLOCK_TYPES = new Set(['createForm', 'editForm']);
const LINKAGE_BLOCK_TYPES = new Set(['createForm', 'editForm', 'details']);


export interface FillOpts {
  modDir: string;
  blockState: BlockState;
  allBlocksState?: Record<string, BlockState>;
  pageGridUid?: string;
  popupContext?: { seenColls: Set<string> };
  popupTargetFields?: Set<string>;
}

export async function fillBlock(
  ctx: DeployContext,
  blockUid: string,
  gridUid: string,
  bs: BlockSpec,
  defaultColl: string,
  opts: FillOpts,
): Promise<void> {
  const { nb, log } = ctx;
  const { modDir, blockState, allBlocksState = {}, pageGridUid = '', popupContext = { seenColls: new Set() }, popupTargetFields } = opts;
  const btype = bs.type;
  const coll = bs.coll || defaultColl;
  const mod = path.resolve(modDir);

  // ── Ensure gridUid for form/details blocks ──
  if ((!gridUid || btype === 'filterForm') && GRID_BLOCK_TYPES.has(btype)) {
    try {
      const blockData = await nb.get({ uid: blockUid });
      const innerGrid = blockData.tree.subModels?.grid;
      if (innerGrid && !Array.isArray(innerGrid)) {
        gridUid = (innerGrid as { uid: string }).uid || '';
        if (gridUid) {
          blockState.grid_uid = gridUid;
          log(`      . resolved grid_uid for ${btype}: ${gridUid.slice(0, 8)}`);
        }
      }
    } catch (e) {
      log(`      . grid_uid lookup: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    }
  }

  // ── Block title ──
  if (bs.title) {
    try {
      await nb.updateModel(blockUid, { cardSettings: { titleDescription: { title: bs.title } } });
    } catch (e) { log(`      ! title: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }
  }

  // ── Template reference ──
  const templateRef = bs.templateRef;
  if (templateRef?.targetUid && FORM_BLOCK_TYPES.has(btype)) {
    try {
      const formData = await nb.get({ uid: blockUid });
      const blockUse = (formData.tree as { use?: string }).use || '';
      if (blockUse === 'ReferenceBlockModel') {
        log(`      = templateRef: ${templateRef.templateName || templateRef.templateUid} (reference block)`);
      } else {
        const formGrid = formData.tree.subModels?.grid;
        if (formGrid && !Array.isArray(formGrid)) {
          const gridUid2 = (formGrid as { uid: string }).uid;
          const gridUse = (formGrid as { use?: string }).use || '';
          if (gridUse !== 'ReferenceFormGridModel') {
            const gridItems = (formGrid as { subModels?: Record<string, unknown> }).subModels?.items;
            const itemArr = (Array.isArray(gridItems) ? gridItems : []) as { uid: string }[];
            for (const item of itemArr) {
              try { await nb.surfaces.removeNode(item.uid); } catch { /* skip */ }
            }
            if (itemArr.length) log(`      ~ templateRef: cleared ${itemArr.length} local items`);
          }
          const rawGrid = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, { params: { filterByTk: gridUid2 } });
          const gd = rawGrid.data.data;
          if (gd) {
            await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
              uid: gridUid2, use: 'ReferenceFormGridModel',
              parentId: blockUid, subKey: 'grid', subType: 'object',
              sortIndex: gd.sortIndex || 0, flowRegistry: gd.flowRegistry || {},
              stepParams: {
                referenceSettings: {
                  useTemplate: {
                    templateUid: templateRef.templateUid,
                    templateName: templateRef.templateName,
                    targetUid: templateRef.targetUid,
                    mode: templateRef.mode || 'reference',
                  },
                },
              },
            });
            log(`      ~ templateRef: ${templateRef.templateName || templateRef.templateUid} (grid → ReferenceFormGridModel)`);
          }
        }
      }
    } catch (e) { log(`      ! templateRef: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }
  }

  // ── Table settings: dataScope + pageSize + sort ──
  const tableUpdates: Record<string, unknown> = {};
  if (bs.dataScope) tableUpdates.dataScope = { filter: bs.dataScope };
  if (bs.pageSize) tableUpdates.pageSize = { pageSize: bs.pageSize };
  if (bs.sort) tableUpdates.sort = bs.sort;
  if (Object.keys(tableUpdates).length) {
    try {
      await nb.updateModel(blockUid, { tableSettings: tableUpdates });
    } catch (e) { log(`      ! tableSettings: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }
  }

  // ── Table: read actColUid + handle explicit empty recordActions ──
  let actColUid = '';
  if (btype === 'table') {
    try {
      const tableData = await nb.get({ uid: blockUid });
      const cols = tableData.tree.subModels?.columns;
      const actCol = (Array.isArray(cols) ? cols : [])
        .find((c: any) => c.use?.includes('TableActionsColumn'));
      if (actCol) actColUid = (actCol as { uid: string }).uid;

      // recordActions: [] (explicitly empty) → remove actCol
      if (Array.isArray(bs.recordActions) && bs.recordActions.length === 0 && actColUid) {
        await nb.surfaces.removeNode(actColUid);
        actColUid = '';
        log(`      - action column removed (spec declares empty recordActions)`);
      }
    } catch { /* skip */ }
  }

  // ── Fix display models ──
  const fieldStates = blockState.fields || {};
  if (Object.keys(fieldStates).length && coll && (btype === 'table' || btype === 'details')) {
    await fixDisplayModels(nb, blockUid, coll, btype as 'table' | 'details');
  }
  blockState.fields = fieldStates;

  // ── clickToOpen on table fields ──
  await deployClickToOpen(ctx, bs, coll, fieldStates, mod, allBlocksState, popupContext, popupTargetFields);

  // ── Auto-bind m2o clickToOpen (all block types) ──
  // TODO: bind popup templates once the popup template creation mechanism is fixed.
  // For now, just enable clickToOpen on m2o fields → default details popup.
  if (coll) {
    await enableM2oClickToOpen(nb, blockUid, coll, modDir, log);
  }

  // ── FilterForm custom fields ──
  if (btype === 'filterForm' && gridUid) {
    const liveCustomNames = new Set<string>();
    try {
      const gridData = await nb.get({ uid: gridUid });
      const gridItems = (gridData.tree.subModels?.items || []) as { use?: string; stepParams?: Record<string, unknown> }[];
      for (const gi of (Array.isArray(gridItems) ? gridItems : [])) {
        if (gi.use === 'FilterFormCustomFieldModel') {
          const cfName = ((gi.stepParams?.formItemSettings as Record<string, unknown>)?.fieldSettings as Record<string, unknown>)?.name as string || '';
          if (cfName) liveCustomNames.add(cfName);
        }
      }
    } catch (e) { log(`      . filterForm grid read: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }

    for (const f of bs.fields || []) {
      if (typeof f !== 'object' || (f as unknown as Record<string, unknown>).type !== 'custom') continue;
      const custom = f as unknown as Record<string, unknown>;
      const customName = (custom.name as string) || '';
      if (!customName || liveCustomNames.has(customName)) continue;
      try {
        const newUid = generateUid();
        await nb.models.save({
          uid: newUid, use: 'FilterFormCustomFieldModel',
          parentId: gridUid, subKey: 'items', subType: 'array', sortIndex: 0,
          stepParams: { formItemSettings: { fieldSettings: {
            name: customName, title: custom.title || customName,
            fieldModel: custom.fieldModel || 'InputFilterFieldModel',
            fieldModelProps: custom.fieldModelProps || {}, source: custom.source || [],
          } } },
          flowRegistry: {},
        });
        if (!blockState.fields) blockState.fields = {};
        blockState.fields[customName] = { wrapper: newUid, field: '' };
        log(`      + custom filter: ${custom.title || customName}`);
      } catch (e) { log(`      ! custom filter ${customName}: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }
    }
  }

  // ── FilterForm configuration ──
  if (btype === 'filterForm' && pageGridUid) {
    await configureFilter(ctx, bs, blockUid, blockState, coll, allBlocksState, pageGridUid);
  }

  // ── JS Block code ──
  if (btype === 'jsBlock' && bs.file) {
    const jsPath = path.join(mod, bs.file);
    if (fs.existsSync(jsPath)) {
      let code = fs.readFileSync(jsPath, 'utf8');
      // Validate JS code
      const unfilled = code.match(/\{\{(\w+)(?:\|\|[^}]*)?\}\}/g);
      if (unfilled?.length) {
        log(`      ✗ JS ${bs.file}: unfilled template params: ${unfilled.join(', ')}`);
      } else if (/ctx\.render\s*\(\s*null\s*\)/.test(code)) {
        log(`      ✗ JS ${bs.file}: ctx.render(null) 是空占位符，需要实现实际内容`);
      } else if (/ctx\.sql\s*\(/.test(code) && !/ctx\.sql\.(save|runById)/.test(code)) {
        log(`      ✗ JS ${bs.file}: ctx.sql() 直接调用不可用，请用 ctx.sql.save() + ctx.sql.runById() 流程`);
      } else {
        code = ensureJsHeader(code, { desc: bs.desc, jsType: 'JSBlockModel', coll });
        code = replaceJsUids(code, allBlocksState);
        await nb.updateModel(blockUid, { jsSettings: { runJs: { code, version: 'v1' } } });
        log(`      ~ JS: ${(bs.desc || bs.file).slice(0, 40)}`);
      }
    }
  }

  // ── Chart config ──
  await deployChart(ctx, blockUid, bs, mod);

  // ── Actions — skip for chart/jsBlock/markdown (no data source → filter crashes) ──
  if (!['chart', 'jsBlock', 'markdown'].includes(btype)) {
    await deployActions(ctx, blockUid, bs, blockState, mod, actColUid, RECORD_ACTION_BLOCKS.has(btype));
  }

  // ── Auto-fill view/edit popup content (skip actions that have popup YAML files) ──
  if (btype === 'table' && coll) {
    await autoFillRecordActionPopups(nb, coll, blockState, log, popupTargetFields);
  }

  // ── JS Items ──
  let itemGridUid = gridUid;
  if (['list', 'gridCard'].includes(btype) && !gridUid) {
    try {
      const blockData = await nb.get({ uid: blockUid });
      const listItem = blockData.tree.subModels?.item;
      if (listItem && !Array.isArray(listItem)) {
        const listGrid = (listItem as { subModels?: Record<string, unknown> }).subModels?.grid;
        if (listGrid && !Array.isArray(listGrid)) {
          itemGridUid = (listGrid as { uid: string }).uid;
        }
      }
    } catch (e) { log(`      . list/gridCard grid read: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }
  }
  await deployJsItems(ctx, itemGridUid, bs, coll, mod, blockState, allBlocksState);

  // ── JS Columns (table) ──
  await deployJsColumns(ctx, blockUid, bs, coll, mod, blockState, allBlocksState);

  // ── Dividers ──
  await deployDividers(ctx, gridUid, bs, blockState);

  // ── Event flows ──
  await deployEventFlows(ctx, blockUid, bs, mod);

  // ── Field layout ──
  if ((bs.field_layout || []).length) {
    await applyFieldLayout(ctx, gridUid, bs.field_layout!, bs);
  } else if (gridUid && GRID_BLOCK_TYPES.has(btype)) {
    await syncGridItemsOrder(ctx, gridUid, bs);
  }

  // ── Linkage / reaction rules ──
  if (bs.blockLinkageRules?.length) {
    try {
      await nb.surfaces.setBlockLinkageRules(blockUid, bs.blockLinkageRules);
      log(`      ~ blockLinkageRules: ${bs.blockLinkageRules.length} rules`);
    } catch (e) { log(`      ! blockLinkageRules: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }
  }
  if (FORM_BLOCK_TYPES.has(btype) && bs.fieldValueRules?.length) {
    try {
      await nb.surfaces.setFieldValueRules(blockUid, bs.fieldValueRules);
      log(`      ~ fieldValueRules: ${bs.fieldValueRules.length} rules`);
    } catch (e) { log(`      ! fieldValueRules: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }
  }
  if (LINKAGE_BLOCK_TYPES.has(btype) && bs.fieldLinkageRules?.length) {
    try {
      await nb.surfaces.setFieldLinkageRules(blockUid, bs.fieldLinkageRules);
      log(`      ~ fieldLinkageRules: ${bs.fieldLinkageRules.length} rules`);
    } catch (e) { log(`      ! fieldLinkageRules: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }
  }
}

/**
 * Auto-fill view/edit record action popups with reasonable defaults.
 * Compose creates action stubs; this fills empty popups with details/editForm + 2-column layout.
 */
async function autoFillRecordActionPopups(
  nb: NocoBaseClient,
  coll: string,
  blockState: BlockState,
  log: (msg: string) => void,
  popupTargetFields?: Set<string>,
): Promise<void> {
  const recActs = blockState.record_actions;
  if (!recActs) return;

  let defaultFields: { fieldPath: string }[] = [];
  try {
    const meta = await nb.collections.fieldMeta(coll);
    defaultFields = Object.keys(meta)
      .filter(k => !['id', 'createdById', 'updatedById', 'createdAt', 'updatedAt'].includes(k))
      .map(k => ({ fieldPath: k }));
  } catch { return; }
  if (!defaultFields.length) return;

  for (const [atype, astate] of Object.entries(recActs)) {
    if (!['view', 'edit'].includes(atype)) continue;
    // Skip if a popup YAML file handles this action
    if (popupTargetFields?.has(`recordAction:${atype}`)) continue;
    const actionUid = astate.uid;
    if (!actionUid) continue;

    try {
      let popupGridUid = '';
      let needsCompose = true;

      try {
        const actionData = await nb.get({ uid: actionUid });
        const page = (actionData.tree as any).subModels?.page;
        if (page) {
          const tabs = page.subModels?.tabs;
          const t0 = (Array.isArray(tabs) ? tabs : tabs ? [tabs] : [])[0];
          const grid = t0?.subModels?.grid;
          popupGridUid = grid?.uid || '';
          const items = grid?.subModels?.items;
          const itemCount = Array.isArray(items) ? items.length : 0;
          if (!!grid?.stepParams?.gridSettings?.grid && itemCount > 0) continue;
          if (itemCount > 0) needsCompose = false;
        }
      } catch { /* try composing anyway */ }

      if (needsCompose) {
        const blockType = atype === 'view' ? 'details' : 'editForm';
        await nb.surfaces.compose(actionUid, [{
          key: blockType, type: blockType,
          resource: { collectionName: coll, dataSourceKey: 'main', binding: 'currentRecord' },
          fields: defaultFields,
          ...(atype === 'edit' ? { actions: ['submit'] } : {}),
        }], 'replace');
        log(`      + auto-compose ${atype} popup: ${blockType} with ${defaultFields.length} fields`);

        try {
          const refreshed = await nb.get({ uid: actionUid });
          const page2 = (refreshed.tree as any).subModels?.page;
          if (page2) {
            const tabs2 = page2.subModels?.tabs;
            const t02 = (Array.isArray(tabs2) ? tabs2 : tabs2 ? [tabs2] : [])[0];
            popupGridUid = t02?.subModels?.grid?.uid || '';
          }
        } catch { /* skip layout */ }
      }

      if (!popupGridUid) continue;
      const gridData = await nb.get({ uid: popupGridUid });
      const items = ((gridData.tree as any).subModels?.items || []) as { uid: string; use?: string }[];
      const fieldItems = (Array.isArray(items) ? items : []).filter((i: any) =>
        ((i.use as string) || '').includes('FormItem') || ((i.use as string) || '').includes('DetailsItem'));

      if (fieldItems.length > 2) {
        const rows: Record<string, string[][]> = {};
        const sizes: Record<string, number[]> = {};
        let ri = 0;
        for (let i = 0; i < fieldItems.length; i += 2) {
          const rk = `r${ri}`;
          if (i + 1 < fieldItems.length) {
            rows[rk] = [[fieldItems[i].uid], [fieldItems[i + 1].uid]];
            sizes[rk] = [12, 12];
          } else {
            rows[rk] = [[fieldItems[i].uid]];
            sizes[rk] = [24];
          }
          ri++;
        }
        await nb.surfaces.setLayout(popupGridUid, rows, sizes);
        log(`      ~ auto-layout ${atype} popup: ${fieldItems.length} fields → ${ri} rows`);
      }
    } catch (e) {
      log(`      . auto-fill ${atype}: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    }
  }
}

/**
 * Auto-bind m2o fields to default popup templates — ALL block types.
 *
 * Recursively scans the block tree for any field model whose fieldPath is m2o.
 * Checks defaults.yaml for a matching popup template and binds it.
 * Works for table columns, detail items, form items, list items, etc.
 */
export async function enableM2oClickToOpen(
  nb: NocoBaseClient,
  blockUid: string,
  coll: string,
  modDir: string,
  log: (msg: string) => void,
): Promise<void> {
  // Load defaults.yaml (walk up to project root)
  let popupDefaults: Record<string, string> = {};
  try {
    const { loadYaml } = await import('../utils/yaml');
    for (let dir = modDir; dir !== path.dirname(dir); dir = path.dirname(dir)) {
      const f = path.join(dir, 'defaults.yaml');
      if (fs.existsSync(f)) {
        popupDefaults = (loadYaml<{ popups?: Record<string, string> }>(f))?.popups || {};
        break;
      }
    }
  } catch { /* skip */ }
  if (!Object.keys(popupDefaults).length) return;

  // Get collection field metadata — m2o fields and their targets
  const m2oTargets = new Map<string, string>(); // fieldPath → targetCollection
  try {
    const resp = await nb.http.get(`${nb.baseUrl}/api/collections/${coll}/fields:list`, { params: { paginate: false } });
    for (const f of (resp.data.data || []) as Record<string, unknown>[]) {
      if (f.interface === 'm2o' && f.target) m2oTargets.set(f.name as string, f.target as string);
    }
  } catch { return; }
  if (!m2oTargets.size) return;

  // Resolve popup template names → live UIDs
  const { loadYaml } = await import('../utils/yaml');
  const templateNameToUid = new Map<string, { templateUid: string; targetUid: string }>();
  let liveTemplates: Record<string, unknown>[] = [];
  try {
    const resp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:list`, { params: { paginate: false } });
    liveTemplates = resp.data.data || [];
  } catch { return; }

  // Resolve popup templates by collectionName (more reliable than name matching)
  const neededColls = new Set(m2oTargets.values());
  neededColls.add(coll);
  for (const targetColl of neededColls) {
    if (!popupDefaults[targetColl]) continue;
    // Find live popup template by collectionName + type=popup, prefer Detail
    const isDetail = (t: Record<string, unknown>) => {
      const name = (t.name || '').toString().toLowerCase();
      return name.includes('detail') || name.includes('view');
    };
    const isNotForm = (t: Record<string, unknown>) => {
      const name = (t.name || '').toString().toLowerCase();
      return !name.includes('add new') && !name.includes('edit');
    };
    const collTemplates = liveTemplates.filter(t =>
      (t as Record<string, unknown>).collectionName === targetColl &&
      (t as Record<string, unknown>).type === 'popup',
    ) as Record<string, unknown>[];
    const live = collTemplates.find(isDetail) || collTemplates.find(isNotForm) || null;
    if (live) {
      templateNameToUid.set(targetColl, { templateUid: (live as Record<string, unknown>).uid as string, targetUid: ((live as Record<string, unknown>).targetUid as string) || '' });
    }
  }
  if (!templateNameToUid.size) return;

  // Scan block tree — collect field models with m2o fieldPath (deduplicated by UID)
  let blockData: any;
  try { blockData = await nb.get({ uid: blockUid }); } catch { return; }

  const fieldModels = new Map<string, { uid: string; fieldPath: string; stepParams: any }>();
  const visited = new Set<string>();
  function scanTree(node: any) {
    if (!node || typeof node !== 'object') return;
    if (node.uid && visited.has(node.uid)) return;
    if (node.uid) visited.add(node.uid);
    // Collect only actual field models (not column wrappers) that have a fieldPath
    const fp = node.stepParams?.fieldSettings?.init?.fieldPath;
    const use = (node.use as string) || '';
    const isFieldModel = use.includes('FieldModel') || use.includes('FormItem') || use.includes('DetailsItem');
    if (fp && node.uid && isFieldModel && !fieldModels.has(node.uid)) {
      fieldModels.set(node.uid, { uid: node.uid, fieldPath: fp, stepParams: node.stepParams });
    }
    // Recurse into all subModels
    const subs = node.subModels;
    if (subs && typeof subs === 'object') {
      for (const v of Object.values(subs)) {
        if (Array.isArray(v)) { for (const item of v) scanTree(item); }
        else if (v && typeof v === 'object') scanTree(v);
      }
    }
  }
  scanTree(blockData.tree);

  // Bind popup templates to fields that have clickToOpen but no popupTemplateUid:
  // - m2o fields → target collection's popup template
  // - other fields with clickToOpen → own collection's popup template
  for (const fm of fieldModels.values()) {
    // Validate existing bindings — report mismatches
    const existingTplUid = fm.stepParams?.popupSettings?.openView?.popupTemplateUid;
    if (existingTplUid) {
      const expectedColl = m2oTargets.get(fm.fieldPath) || coll;
      try {
        const tplResp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:get`, { params: { filterByTk: existingTplUid } });
        const tplColl = tplResp.data.data?.collectionName;
        if (tplColl && tplColl !== expectedColl) {
          log(`      ✗ ERROR: ${fm.fieldPath} popup template "${existingTplUid.slice(0, 8)}" is for "${tplColl}" but field expects "${expectedColl}"`);
        }
      } catch { /* skip */ }
      continue;
    }

    // Also report: m2o field has NO popup template and defaults has one available
    const targetColl0 = m2oTargets.get(fm.fieldPath);
    if (targetColl0 && !existingTplUid && templateNameToUid.has(targetColl0)) {
      // Will be bound below — not an error, just needs binding
    }

    // Determine which collection's popup template to use
    const targetColl = m2oTargets.get(fm.fieldPath);  // m2o → target collection
    const popupColl = targetColl || coll;              // non-m2o → own collection
    const tplInfo = templateNameToUid.get(popupColl);
    if (!tplInfo) continue;

    // For non-m2o: only bind if field already has clickToOpen enabled
    if (!targetColl) {
      const hasClickToOpen = fm.stepParams?.displayFieldSettings?.clickToOpen?.clickToOpen;
      if (!hasClickToOpen) continue;
    }

    // ── Validation: verify template's collectionName matches expected ──
    try {
      const tplResp = await nb.http.get(`${nb.baseUrl}/api/flowModelTemplates:get`, { params: { filterByTk: tplInfo.templateUid } });
      const tplColl = tplResp.data.data?.collectionName;
      if (tplColl && tplColl !== popupColl) {
        log(`      ✗ popup template mismatch: ${fm.fieldPath} expects "${popupColl}" but template "${tplInfo.templateUid.slice(0, 8)}" is for "${tplColl}" — skipped`);
        continue;
      }
    } catch { /* skip validation if API fails */ }

    try {
      const fdResp = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, { params: { filterByTk: fm.uid } });
      const fd = fdResp.data.data;
      if (!fd) continue;
      const sp = fd.stepParams || {};
      sp.displayFieldSettings = { clickToOpen: { clickToOpen: true } };
      sp.popupSettings = {
        openView: {
          collectionName: popupColl, dataSourceKey: 'main',
          mode: 'drawer', size: 'large',
          popupTemplateUid: tplInfo.templateUid,
          ...(tplInfo.targetUid ? { uid: tplInfo.targetUid } : {}),
          popupTemplateHasFilterByTk: true,
          popupTemplateHasSourceId: false,
        },
      };
      await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
        uid: fm.uid, use: fd.use, parentId: fd.parentId,
        subKey: fd.subKey, subType: fd.subType,
        stepParams: sp, sortIndex: fd.sortIndex || 0, flowRegistry: fd.flowRegistry || {},
      });
      const label = targetColl ? `m2o: ${fm.fieldPath} → ${popupColl}` : `field: ${fm.fieldPath}`;
      log(`      ~ popup bind ${label} (template: ${tplInfo.templateUid.slice(0, 8)})`);
    } catch (e) {
      log(`      . popup bind ${fm.fieldPath}: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    }
  }
}
