/**
 * Deploy blocks into a page tab surface.
 *
 * Core loop: compose shells → fill content → apply layout.
 * Used for both pages and popup content.
 */
import type { NocoBaseClient } from '../client';
import type { BlockSpec, PageSpec, LayoutRow, FieldSpec } from '../types/spec';
import type { BlockState } from '../types/state';
import type { ComposeBlockResult } from '../types/api';
import type { DeployContext } from './deploy-context';
import type { PopupContext } from './fillers/types';
import { toComposeBlock } from './block-composer';
import { fillBlock } from './block-filler';
import { reorderTableColumns } from './column-reorder';
import { slugify } from '../utils/slugify';
import { BLOCK_TYPE_TO_MODEL as BLOCK_TYPES, COMPOSE_ACTION_TYPES } from '../utils/block-types';

// Layout engine (imported separately)
import { parseLayoutSpec, applyLayout } from '../layout/layout-engine';

export interface SurfaceOpts {
  modDir: string;
  existingState?: Record<string, BlockState>;
  popupContext?: PopupContext;
  popupTargetFields?: Set<string>;
}

export async function deploySurface(
  ctx: DeployContext,
  tabUid: string,
  spec: PageSpec | BlockSpec & { blocks?: BlockSpec[]; coll?: string; layout?: LayoutRow[] },
  opts: SurfaceOpts,
): Promise<Record<string, BlockState>> {
  const { nb, log } = ctx;
  const { modDir, existingState: existingStateOpt, popupContext, popupTargetFields } = opts;
  const existingState = existingStateOpt || {};
  const coll = (spec as { coll?: string }).coll || '';
  const blocksSpec = (spec as { blocks?: BlockSpec[] }).blocks || [];
  if (!blocksSpec.length) return existingState;

  const existing = { ...existingState };
  const blocksState: Record<string, BlockState> = { ...existing };

  // Find grid UID
  let gridUid = '';
  for (const getter of [
    () => nb.get({ tabSchemaUid: tabUid }),
    () => nb.get({ uid: tabUid }),
  ]) {
    try {
      const data = await getter();
      const tree = data.tree;
      const g = tree.subModels?.grid;
      if (g && !Array.isArray(g) && (g as { uid?: string }).uid) {
        gridUid = (g as { uid?: string }).uid!;
        break;
      }
      const popup = tree.subModels?.page;
      if (popup && !Array.isArray(popup)) {
        const tabs = (popup as { subModels?: Record<string, unknown> }).subModels?.tabs;
        const tabArr = Array.isArray(tabs) ? tabs : tabs ? [tabs] : [];
        if (tabArr.length) {
          const pg = (tabArr[0] as Record<string, unknown>).subModels as Record<string, unknown>;
          const pgGrid = pg?.grid as Record<string, unknown>;
          if (pgGrid?.uid) {
            gridUid = pgGrid.uid as string;
            break;
          }
        }
      }
    } catch (e) { log(`    . grid lookup: ${e instanceof Error ? e.message.slice(0, 60) : e}`); continue; }
  }

  // Check if all blocks already exist in state
  const allExist = blocksSpec.every(
    bs => (bs.key || bs.type) in existing,
  );

  if (allExist) {
    // All blocks exist — sync content to match spec
    log(`    = ${Object.keys(existing).length} blocks exist (sync)`);
    for (const bs of blocksSpec) {
      const key = bs.key || bs.type;
      if (!blocksState[key]?.uid) continue;
      const blockUid = blocksState[key].uid;
      const blockGrid = blocksState[key].grid_uid || '';

      // Add missing fields
      if (['table', 'filterForm', 'createForm', 'editForm', 'details'].includes(bs.type)) {
        const specFields = (bs.fields || [])
          .map(f => typeof f === 'string' ? f : (f.field || f.fieldPath || ''))
          .filter(fp => fp && !fp.startsWith('['));

        const existingFields = new Set(Object.keys(blocksState[key].fields || {}));
        for (const fp of specFields) {
          if (!existingFields.has(fp)) {
            try {
              const result = await nb.surfaces.addField(blockUid, fp);
              if (!blocksState[key].fields) blocksState[key].fields = {};
              blocksState[key].fields![fp] = {
                wrapper: result.wrapperUid || result.uid || '',
                field: result.fieldUid || '',
              };
              log(`      + field: ${fp}`);
            } catch (e) {
              log(`      ! field ${fp}: ${e instanceof Error ? e.message : e}`);
            }
          }
        }

        // Apply non-default column settings (width, ellipsis)
        if (bs.type === 'table') {
          await applyColumnSettings(nb, blockUid, bs.fields || []);
        }
      }

      // Update content (JS, charts, title, actions, settings)
      await fillBlock(ctx, blockUid, blockGrid, bs, coll, { modDir, blockState: blocksState[key], allBlocksState: blocksState, pageGridUid: gridUid, popupContext, popupTargetFields });

      // Reorder columns AFTER fillBlock (JS columns created by deployJsColumns)
      if (bs.type === 'table') {
        const sf = (bs.fields || [])
          .map(f => typeof f === 'string' ? f : (f.field || f.fieldPath || ''))
          .filter(fp => fp && !fp.startsWith('['));
        if (sf.length) {
          const jsKeys = (bs.js_columns || []).map((j: any) => j.key as string);
          const colOrder = (bs as any).column_order as string[] | undefined;
          await reorderTableColumns(nb, blockUid, sf, jsKeys, colOrder);
        }
      }
    }

    // Always apply layout
    const layoutSpec = (spec as { layout?: LayoutRow[] }).layout;
    if (layoutSpec && gridUid) {
      const uidMap: Record<string, string> = {};
      for (const [k, v] of Object.entries(blocksState)) {
        if (v.uid) uidMap[k] = v.uid;
      }
      const layout = parseLayoutSpec(layoutSpec, Object.keys(uidMap));
      await applyLayout(nb, gridUid, layout, uidMap);
      log(`    layout: ${layoutSpec.map(r => Array.isArray(r) ? `[${r.map(c => typeof c === 'string' ? c : Object.entries(c).map(([k, v]) => `${k}:${v}`).join(',')).join(', ')}]` : String(r)).join(' | ')}`);
    }

    return blocksState;
  }

  // ── Pre-compose: validate fields against collection metadata ──
  const collFieldsCache = new Map<string, Set<string>>();
  async function getCollFields(collName: string): Promise<Set<string>> {
    if (!collName) return new Set<string>();
    if (collFieldsCache.has(collName)) return collFieldsCache.get(collName)!;
    try {
      const resp = await nb.http.get(`${nb.baseUrl}/api/collections/${collName}/fields:list`, { params: { paginate: false } });
      const names = new Set<string>((resp.data.data || []).map((f: any) => f.name as string));
      collFieldsCache.set(collName, names);
      return names;
    } catch { return new Set<string>(); }
  }

  for (const bs of blocksSpec) {
    const blockColl = bs.coll || coll;
    if (!blockColl || !bs.fields?.length) continue;
    const liveFields = await getCollFields(blockColl);
    if (!liveFields.size) continue;
    const specFields = (bs.fields || []).map(f => typeof f === 'string' ? f : (f.field || f.fieldPath || '')).filter(Boolean);
    const missing = specFields.filter(f => !liveFields.has(f));
    if (missing.length) {
      const key = bs.key || bs.type;
      if (ctx.copyMode) {
        // Copy mode: auto-remove invalid fields and continue
        log(`    ✗ Block "${key}" references fields not in ${blockColl}: ${missing.join(', ')} — removing invalid fields`);
        bs.fields = (bs.fields || []).filter(f => {
          const fp = typeof f === 'string' ? f : (f.field || f.fieldPath || '');
          return !fp || liveFields.has(fp);
        });
      } else {
        // DSL mode: strict — report error, do not silently remove
        throw new Error(`Block "${key}" references fields not in ${blockColl}: ${missing.join(', ')}`);
      }
    }
  }

  // ── Step 1: Compose missing block shells ──
  const composeBlocks: Record<string, unknown>[] = [];
  for (const bs of blocksSpec) {
    const key = bs.key || bs.type;
    if (key in existing) continue;  // already exists — skip compose (force handles via fillBlock)
    const cb = toComposeBlock(bs, coll);
    if (cb) composeBlocks.push(cb);
  }

  if (composeBlocks.length) {
    try {
      const mode = Object.keys(existing).length ? 'append' : 'replace';
      log(`    composing ${composeBlocks.length} blocks (mode: ${mode}): ${composeBlocks.map((b: any) => b.key).join(', ')}`);
      const result = await nb.surfaces.compose(tabUid, composeBlocks, mode as 'replace' | 'append');
      const composed = result.blocks || [];
      log(`    composed ${composed.length} block shells: ${composed.map((b: any) => b.key + '=' + b.uid?.slice(0, 6)).join(', ')}`);

      // Map compose results to spec keys (must match compose input: skip existing)
      let composeIdx = 0;
      for (const bs of blocksSpec) {
        const key = bs.key || bs.type;
        if (key in existing) continue;  // existing blocks were NOT sent to compose
        const cb = toComposeBlock(bs, coll);
        if (!cb) continue;
        if (composeIdx < composed.length) {
          const cr = composed[composeIdx];
          const entry: BlockState = {
            uid: cr.uid,
            type: cr.type,
            grid_uid: cr.gridUid || '',
          };
          // Track field UIDs
          if (cr.fields?.length) {
            entry.fields = {};
            for (const f of cr.fields) {
              entry.fields[f.fieldPath || f.key] = {
                wrapper: f.wrapperUid || f.uid,
                field: f.fieldUid || '',
              };
            }
          }
          // Track action UIDs
          for (const ak of ['actions', 'recordActions'] as const) {
            const crActs = cr[ak];
            if (crActs?.length) {
              const stateKey = ak === 'recordActions' ? 'record_actions' : 'actions';
              (entry as unknown as Record<string, unknown>)[stateKey] = {};
              for (const a of crActs) {
                ((entry as unknown as Record<string, unknown>)[stateKey] as Record<string, { uid: string }>)[a.key || a.type] = { uid: a.uid };
              }
            }
          }
          blocksState[key] = entry;
          composeIdx++;
        }
      }

      // ── Step 2: Fill each NEW composable block with content ──
      for (const bs of blocksSpec) {
        const key = bs.key || bs.type;
        if (key in existing) continue;
        if (!blocksState[key]) continue;
        await fillBlock(ctx, blocksState[key].uid, blocksState[key].grid_uid || '', bs, coll, { modDir, blockState: blocksState[key], allBlocksState: blocksState, pageGridUid: gridUid, popupTargetFields });
      }

      // ── Step 2b: Also fill EXISTING blocks when force (sync content) ──
      if (ctx.force) {
        for (const bs of blocksSpec) {
          const key = bs.key || bs.type;
          if (!(key in existing)) continue;
          if (!blocksState[key]?.uid) continue;
          await fillBlock(ctx, blocksState[key].uid, blocksState[key].grid_uid || '', bs, coll, { modDir, blockState: blocksState[key], allBlocksState: blocksState, pageGridUid: gridUid, popupTargetFields });
        }
      }
    } catch (e: any) {
      const detail = e?.response?.data?.errors?.[0]?.message || e?.response?.data || '';
      log(`    ! compose: ${e instanceof Error ? e.message : e}${detail ? ' — ' + detail : ''}`);
    }
  }

  // ── Step 1b: Create blocks that compose can't handle (legacy types + popup associations) ──
  // First, check what already exists in the grid to avoid duplicates
  const existingModelTypes = new Set<string>();
  try {
    const gridData = await nb.get({ uid: gridUid });
    const gridItems = gridData.tree.subModels?.items;
    if (Array.isArray(gridItems)) {
      for (const gi of gridItems) {
        existingModelTypes.add((gi as { use?: string }).use || '');
      }
    }
  } catch (e) { log(`    . grid scan: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }

  for (const bs of blocksSpec) {
    const key = bs.key || bs.type;
    if (key in blocksState) continue; // already composed or exists
    // toComposeBlock returned null → create via save_model
    const cb = toComposeBlock(bs, coll);
    if (cb) continue; // was composable but maybe already composed above
    const modelName = BLOCK_TYPES[bs.type];
    if (!modelName || !gridUid) continue;

    // Skip if this model type already exists in the grid (avoid duplicates)
    if (existingModelTypes.has(modelName)) {
      log(`    = save_model: ${key} (${modelName} already exists)`);
      continue;
    }

    try {
      const { generateUid } = await import('../utils/uid');
      const blockColl = bs.coll || coll;
      const resBinding = (bs.resource_binding || {}) as Record<string, unknown>;
      const newUid = generateUid();
      const stepParams: Record<string, unknown> = {};

      // Resource settings (with full associationName + sourceId for popup blocks)
      const resource: Record<string, unknown> = {};
      if (blockColl) {
        resource.collectionName = blockColl;
        resource.dataSourceKey = 'main';
      }
      if (resBinding.associationName) resource.associationName = resBinding.associationName;
      if (resBinding.sourceId) resource.sourceId = resBinding.sourceId;
      if (resBinding.filterByTk) resource.filterByTk = resBinding.filterByTk;
      if (Object.keys(resource).length) stepParams.resourceSettings = { init: resource };

      if (bs.dataScope) stepParams.tableSettings = { dataScope: { filter: bs.dataScope } };
      if (bs.title) stepParams.cardSettings = { titleDescription: { title: bs.title } };

      // Reference block: set useTemplate pointing to the template
      // Template reference — set stepParams + create usage record
      const ref = (bs as unknown as Record<string, unknown>)._reference as Record<string, unknown>
        || bs.templateRef as Record<string, unknown>;
      if (bs.type === 'reference' && ref?.templateUid) {
        stepParams.referenceSettings = {
          useTemplate: {
            templateUid: ref.templateUid,
            templateName: ref.templateName,
            targetUid: ref.targetUid,
            mode: ref.mode || 'reference',
          },
        };
      }

      await nb.models.save({
        uid: newUid,
        use: modelName,
        parentId: gridUid,
        subKey: 'items',
        subType: 'array',
        sortIndex: 0,
        stepParams,
        flowRegistry: {},
      });

      // Create template usage record for reference blocks
      if (bs.type === 'reference' && ref?.templateUid) {
        try {
          await nb.http.post(`${nb.baseUrl}/api/flowModelTemplateUsages:create`, {
            values: { templateUid: ref.templateUid, modelUid: newUid },
          });
        } catch { /* usage may already exist */ }
      }

      blocksState[key] = { uid: newUid, type: bs.type, grid_uid: '' };
      log(`    + save_model: ${key} (${modelName})`);

      // Read back grid_uid for blocks that have internal grids
      try {
        const blockData = await nb.get({ uid: newUid });
        const innerGrid = blockData.tree.subModels?.grid;
        if (innerGrid && !Array.isArray(innerGrid)) {
          blocksState[key].grid_uid = (innerGrid as { uid: string }).uid;
        }
      } catch (e) { log(`      . grid readback ${key}: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }

      // Add compose-type actions (filter/refresh/addNew etc.) via API
      for (const aspec of bs.actions || []) {
        const atype = typeof aspec === 'string' ? aspec : (aspec as Record<string, unknown>).type as string;
        if (COMPOSE_ACTION_TYPES.has(atype)) {
          try {
            await nb.surfaces.addAction(newUid, atype);
          } catch (e) { log(`      . addAction ${atype}: ${e instanceof Error ? e.message.slice(0, 60) : e}`); }
        }
      }

      // Auto-create default columns for mailMessages (standard columns, not in DSL)
      if (bs.type === 'mailMessages') {
        const DEFAULT_MAIL_COLUMNS: { fieldPath: string; model: string; width?: number }[] = [
          { fieldPath: 'from', model: 'CustomMailFromFieldModel' },
          { fieldPath: 'subject', model: 'CustomMailSubjectFieldModel', width: 300 },
          { fieldPath: 'to', model: 'CustomMailToFieldModel' },
          { fieldPath: 'date', model: 'DisplayDateTimeFieldModel' },
          { fieldPath: 'labels', model: 'CustomMailLabelsFieldModel' },
        ];
        for (const col of DEFAULT_MAIL_COLUMNS) {
          const colUid = (await import('../utils/uid')).generateUid();
          const colStepParams: Record<string, unknown> = {
            fieldSettings: { init: { fieldPath: col.fieldPath } },
            mailMessagesColumnSettings: { model: { use: col.model } },
          };
          if (col.width) {
            colStepParams.mailMessagesColumnSettings = {
              ...(colStepParams.mailMessagesColumnSettings as Record<string, unknown>),
              width: { width: col.width },
            };
          }
          await nb.models.save({
            uid: colUid, use: 'CustomMailMessagesColumnModel',
            parentId: newUid, subKey: 'columns', subType: 'array',
            sortIndex: 0, stepParams: colStepParams, flowRegistry: {},
          });
        }
        log(`      + mail columns: ${DEFAULT_MAIL_COLUMNS.length} default columns`);
      }

      // Fill content (non-compose actions, JS, field_layout, etc.)
      await fillBlock(ctx, newUid, blocksState[key].grid_uid || '', bs, coll, { modDir, blockState: blocksState[key], allBlocksState: blocksState, pageGridUid: gridUid, popupTargetFields });
    } catch (e) {
      log(`    ! save_model ${key}: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    }
  }

  // Apply column settings (width, ellipsis) for ALL table blocks
  for (const bs of blocksSpec) {
    if (bs.type !== 'table' || !blocksState[bs.key || bs.type]?.uid) continue;
    if ((bs.key || bs.type) in existing) continue; // already applied in sync path
    await applyColumnSettings(nb, blocksState[bs.key || bs.type].uid, bs.fields || []);
  }

  // Apply layout
  const layoutSpec = (spec as { layout?: LayoutRow[] }).layout;
  if (layoutSpec && gridUid) {
    const uidMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(blocksState)) {
      if (v.uid) uidMap[k] = v.uid;
    }
    const layout = parseLayoutSpec(layoutSpec, Object.keys(uidMap));
    await applyLayout(nb, gridUid, layout, uidMap);
    log(`    layout: ${layoutSpec.map(r => Array.isArray(r) ? `[${r.map(c => typeof c === 'string' ? c : Object.entries(c).map(([k, v]) => `${k}:${v}`).join(',')).join(', ')}]` : String(r)).join(' | ')}`);
  }

  return blocksState;
}

/**
 * Apply non-default column settings (width, ellipsis) to table columns.
 * Only sets values that differ from defaults (width=150, ellipsis=true).
 */
async function applyColumnSettings(
  nb: NocoBaseClient,
  blockUid: string,
  fields: FieldSpec[],
): Promise<void> {
  // Collect fields with custom settings
  const customFields = new Map<string, { width?: number; ellipsis?: boolean }>();
  for (const f of fields) {
    if (typeof f === 'string') continue;
    if (!f.field) continue;
    if (f.width || f.ellipsis === false) {
      customFields.set(f.field, { width: f.width, ellipsis: f.ellipsis });
    }
  }
  if (!customFields.size) return;

  // Read live columns to find UIDs
  try {
    const data = await nb.get({ uid: blockUid });
    const cols = data.tree.subModels?.columns;
    const colArr = (Array.isArray(cols) ? cols : []) as { uid: string; stepParams?: Record<string, unknown> }[];

    for (const col of colArr) {
      const fp = ((col.stepParams?.fieldSettings as Record<string, unknown>)?.init as Record<string, unknown>)?.fieldPath as string || '';
      const custom = customFields.get(fp);
      if (!custom) continue;

      const patch: Record<string, unknown> = {};
      if (custom.width) patch.width = { width: custom.width };
      if (custom.ellipsis === false) patch.ellipsis = { ellipsis: false };

      if (Object.keys(patch).length) {
        await nb.updateModel(col.uid, { tableColumnSettings: patch });
      }
    }
  } catch (e) { /* best effort — column settings are non-critical */ }
}
