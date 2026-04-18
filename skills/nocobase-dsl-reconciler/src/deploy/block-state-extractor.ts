/**
 * Read live flowModel tree and reconstruct per-block state entries.
 *
 * Used by project-deployer + page-level logic when state.yaml is stale /
 * absent and we need to match spec blocks to live UIDs. The extractor
 * walks the tab's grid items, identifies each by `use` (NocoBase model
 * class), and populates:
 *   - uid         block flowModel UID
 *   - type        DSL block type (matched from BlockSpec)
 *   - grid_uid    the block's inner grid (forms/details/filterForm)
 *   - fields      fieldPath → { wrapper, field } for each column/grid-item
 *   - actions / record_actions  action UIDs keyed by type
 *
 * Also exports `buildPopupTargetFields` — a simpler helper that extracts
 * field/recordAction paths from popup specs, used by fillers to skip
 * auto-generated defaults when the DSL already describes the popup.
 */
import type { BlockSpec, PopupSpec } from '../types/spec';
import type { BlockState } from '../types/state';
import { BLOCK_TYPE_TO_MODEL } from '../utils/block-types';

export function extractBlockState(
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
        const bucket = ((entry as unknown as Record<string, Record<string, { uid: string }>>)[stateKey] ||= {});
        for (const a of actArr) {
          const aUid = a.uid as string || '';
          const aUse = a.use as string || '';
          const aType = aUse.replace('ActionModel', '').replace('Action', '');
          const aKey = aType.charAt(0).toLowerCase() + aType.slice(1);
          if (aUid) bucket[aKey] = { uid: aUid };
        }
      }
    }

    existing[key] = entry;
    const idx = candidates.indexOf(matched);
    if (idx >= 0) candidates.splice(idx, 1);
  }

  return existing;
}

/**
 * Extract popup targets from popup specs — both fields and recordActions.
 * Used to prevent auto-fill from creating default content when a popup YAML handles it.
 *
 * Returns: Set containing field paths ("name") and recordAction markers ("recordAction:edit").
 */
export function buildPopupTargetFields(popups: PopupSpec[]): Set<string> {
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
