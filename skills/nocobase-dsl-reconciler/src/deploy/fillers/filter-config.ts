/**
 * Configure filterForm — connect filter fields to target table/reference blocks.
 *
 * Sets filterFormItemSettings on each field + filterManager on page-level grid.
 *
 * ⚠️ PITFALL: filterManager must be set on PAGE-LEVEL BlockGridModel,
 *    not the filterForm's own grid. See src/PITFALLS.md.
 */
import type { BlockSpec } from '../../types/spec';
import type { BlockState } from '../../types/state';
import type { DeployContext } from './types';

export async function configureFilter(
  ctx: DeployContext,
  bs: BlockSpec,
  blockUid: string,
  blockState: BlockState,
  coll: string,
  allBlocksState: Record<string, BlockState>,
  pageGridUid: string,
): Promise<void> {
  const { nb, log } = ctx;
  // Find target table/reference UIDs
  const targetUids: string[] = [];
  for (const [, binfo] of Object.entries(allBlocksState)) {
    if (binfo.type === 'table' || binfo.type === 'reference') {
      if (binfo.uid) targetUids.push(binfo.uid);
    }
  }
  const defaultTarget = targetUids[0] || '';

  // 1. Set defaultTargetUid on ALL FilterFormItems (not just search fields)
  const fieldStates = blockState.fields || {};
  for (const f of bs.fields || []) {
    const fp = typeof f === 'string' ? f : (f.field || f.fieldPath || '');
    const label = typeof f === 'object' ? (f.label || '') : '';
    if (!fp) continue;

    const wrapperUid = fieldStates[fp]?.wrapper;
    if (!wrapperUid) continue;

    const settings: Record<string, unknown> = {};
    // Connect to ALL target tables (not just the first one)
    if (targetUids.length) {
      settings.init = {
        filterField: { name: fp, title: label || fp },
        defaultTargetUid: targetUids[0],
      };
    }
    if (label) {
      settings.label = { label };
      settings.showLabel = { showLabel: true };
    }

    if (Object.keys(settings).length) {
      try {
        await nb.updateModel(wrapperUid, { filterFormItemSettings: settings });
        log(`      filter ${fp}: ${label || fp}`);
      } catch (e) {
        log(`      ! filter ${fp}: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
      }
    }
  }

  // 2. Set filterManager on page-level BlockGridModel
  if (!pageGridUid) return;

  try {
    const data = await nb.get({ uid: blockUid });
    const grid = data.tree.subModels?.grid;
    const gridItems = (grid && !Array.isArray(grid))
      ? ((grid as unknown as Record<string, unknown>).subModels as Record<string, unknown>)?.items
      : [];
    const items = (Array.isArray(gridItems) ? gridItems : []) as Record<string, unknown>[];

    // Build m2o field set from collection metadata (for FK name derivation)
    const m2oFkMap = new Map<string, string>(); // fieldName → fkName (e.g. assignee → assigneeId)
    if (coll) {
      try {
        const collResp = await nb.http.get(`${nb.baseUrl}/api/collections/${coll}/fields:list`, { params: { paginate: false } });
        for (const cf of (collResp.data?.data || []) as Record<string, unknown>[]) {
          if (cf.interface === 'm2o' && cf.foreignKey) {
            m2oFkMap.set(cf.name as string, cf.foreignKey as string);
          }
        }
      } catch { /* skip */ }
    }

    const fmEntries: Record<string, unknown>[] = [];
    for (const rawF of bs.fields || []) {
      const fieldName = typeof rawF === 'string' ? rawF : (rawF as Record<string, unknown>).field as string;
      // m2o fields: filterPaths should use FK column (assigneeId), not relation name (assignee)
      const fkName = m2oFkMap.get(fieldName || '');
      const defaultPaths = fkName ? [fkName] : fieldName ? [fieldName] : [];

      const f = typeof rawF === 'string'
        ? { field: rawF, filterPaths: defaultPaths }
        : rawF;
      if (!f.filterPaths?.length) {
        if (f.field) f.filterPaths = defaultPaths.length ? defaultPaths : [f.field];
        else continue;
      }
      const fp = f.field || '';
      if (!fp) continue;

      // Find FilterFormItem UID in live grid
      for (const item of items) {
        const itemFp = ((item.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>)
          ?.init as Record<string, unknown>;
        if ((itemFp?.fieldPath as string) === fp) {
          for (const tid of targetUids) {
            fmEntries.push({
              filterId: item.uid,
              targetId: tid,
              filterPaths: f.filterPaths,
            });
          }
          log(`      filter ${fp} → ${JSON.stringify(f.filterPaths)} (${targetUids.length} targets)`);
          break;
        }
      }
    }

    if (fmEntries.length) {
      // Save filterManager on page-level grid
      const pgResp = await nb.http.get(`${nb.baseUrl}/api/flowModels:get`, {
        params: { filterByTk: pageGridUid },
      });
      const pgData = pgResp.data?.data || {};
      await nb.http.post(`${nb.baseUrl}/api/flowModels:save`, {
        uid: pageGridUid,
        use: pgData.use || 'BlockGridModel',
        parentId: pgData.parentId || '',
        subKey: 'grid',
        subType: 'object',
        sortIndex: 0,
        stepParams: pgData.stepParams || {},
        flowRegistry: pgData.flowRegistry || {},
        filterManager: fmEntries,
      });
    }
  } catch (e) {
    log(`      ! filterManager: ${e instanceof Error ? e.message : e}`);
  }
}
