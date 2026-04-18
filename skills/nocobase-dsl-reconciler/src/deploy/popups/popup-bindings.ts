/**
 * Post-deploy: ensure popup action/field hosts have filterByTk in openView.
 *
 * Checks all deployed popups in state:
 * - recordActions.* and fields.* → must have filterByTk='{{ctx.view.inputArgs.filterByTk}}'
 * - actions.* (addNew) → no filterByTk needed
 *
 * Also fixes block template targets (edit/detail templates need filterByTk;
 * they were created on a temp page without popup context, so the target
 * block has no filterByTk binding by default).
 */
import type { NocoBaseClient } from '../../client';
import type { ModuleState } from '../../types/state';
import { catchSwallow } from '../../utils/swallow';

export async function ensurePopupBindings(
  nb: NocoBaseClient,
  state: ModuleState,
  log: (msg: string) => void,
): Promise<void> {
  let fixed = 0;
  try {
    for (const [, pageState] of Object.entries(state.pages || {})) {
      const ps = pageState as unknown as Record<string, unknown>;
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
        } catch (e) { catchSwallow(e, 'popup host filterByTk fix: target may have drifted, continue with next host'); }
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
      } catch (e) { catchSwallow(e, 'block template filterByTk fix: per-template failure is non-fatal, continue'); }
    }
    if (blockFixed) log(`  block template filterByTk: ${blockFixed} targets fixed`);
  } catch (e) {
    log(`  ! popup bindings: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }
}
