/**
 * Sync grid items order to match the spec's declaration order.
 *
 * In YAML, the order of js_items, fields, dividers determines display order.
 * This reads live grid items, builds desired order from spec, then moveNode.
 *
 * DSL 声明什么顺序，页面就呈现什么顺序。部署器不改变顺序。
 * JS 位置由设计阶段（scaffold / AI 写 DSL）决定。
 */
import type { BlockSpec } from '../../types/spec';
import { bestEffort } from '../../utils/error-utils';
import type { DeployContext } from './types';

export async function syncGridItemsOrder(
  ctx: DeployContext,
  gridUid: string,
  bs: BlockSpec,
): Promise<void> {
  const { nb, log } = ctx;
  if (!gridUid) return;
  if (!['filterForm', 'createForm', 'editForm', 'details'].includes(bs.type)) return;

  await bestEffort('syncGridItemsOrder', async () => {
    const live = await nb.get({ uid: gridUid });
    const rawItems = live.tree.subModels?.items;
    const items = (Array.isArray(rawItems) ? rawItems : []) as { uid: string; use?: string; stepParams?: Record<string, unknown> }[];
    if (items.length < 2) return;

    // Build UID lookup: fieldPath → uid, jsItem → uid, divider label → uid
    const uidByFieldPath = new Map<string, string>();
    const uidByUse = new Map<string, string[]>();
    for (const item of items) {
      const fp = (item.stepParams?.fieldSettings as Record<string, unknown>)
        ?.init as Record<string, unknown>;
      const fieldPath = fp?.fieldPath as string;
      if (fieldPath) uidByFieldPath.set(fieldPath, item.uid);

      const use = item.use || '';
      const group = uidByUse.get(use) || [];
      group.push(item.uid);
      uidByUse.set(use, group);
    }

    // Build desired order from field_layout (if present), otherwise fields then js_items
    const desiredUids: string[] = [];
    const fieldLayout = bs.field_layout || [];

    if (fieldLayout.length) {
      // Follow field_layout declaration order exactly
      for (const row of fieldLayout) {
        if (typeof row === 'string') {
          const u = uidByFieldPath.get(row) || [...uidByFieldPath.entries()].find(([, v]) => v === row)?.[1];
          if (u && !desiredUids.includes(u)) desiredUids.push(u);
        } else if (Array.isArray(row)) {
          for (const item of row) {
            let names: string[] = [];
            if (typeof item === 'string') {
              names = [item];
            } else if (item && typeof item === 'object') {
              const col = (item as Record<string, unknown>).col;
              if (Array.isArray(col)) {
                names = col as string[];
              } else {
                names = Object.keys(item).filter(k => k !== 'col' && k !== 'size');
              }
            }
            for (const name of names) {
              if (name.startsWith('[JS:') || name === '[JS]') {
                const jsUids = uidByUse.get('JSItemModel') || [];
                for (const uid of jsUids) {
                  if (!desiredUids.includes(uid)) { desiredUids.push(uid); break; }
                }
              } else {
                const uid = uidByFieldPath.get(name);
                if (uid && !desiredUids.includes(uid)) desiredUids.push(uid);
              }
            }
          }
        }
      }
    } else {
      // No field_layout — use fields list order, then js_items
      const specFields = (bs.fields || []).map(f =>
        typeof f === 'string' ? f : (f.field || f.fieldPath || ''),
      ).filter(Boolean);
      for (const fp of specFields) {
        const uid = uidByFieldPath.get(fp);
        if (uid && !desiredUids.includes(uid)) desiredUids.push(uid);
      }
      const jsItemUids = uidByUse.get('JSItemModel') || [];
      desiredUids.push(...jsItemUids);
    }

    // Append any remaining items not yet covered
    for (const item of items) {
      if (!desiredUids.includes(item.uid)) desiredUids.push(item.uid);
    }

    // Apply order via moveNode
    if (desiredUids.length > 1) {
      for (let i = 1; i < desiredUids.length; i++) {
        await nb.surfaces.moveNode(desiredUids[i], desiredUids[i - 1], 'after');
      }
    }
  }, log);
}
