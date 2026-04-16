/**
 * Reorder table columns to match spec field order via moveNode.
 * Handles both regular field columns AND JS columns in interleaved order.
 */
import type { NocoBaseClient } from '../client';
import { bestEffort } from '../utils/error-utils';
import { slugify } from '../utils/slugify';

export async function reorderTableColumns(
  nb: NocoBaseClient,
  blockUid: string,
  specFields: string[],
  jsColumnKeys?: string[],
  columnOrder?: string[],
): Promise<void> {
  // No bestEffort — let errors surface for debugging
  {
    const data = await nb.get({ uid: blockUid });
    const tree = data.tree;
    const rawCols = tree.subModels?.columns;
    const cols = (Array.isArray(rawCols) ? rawCols : rawCols ? [rawCols] : []) as unknown as Record<string, unknown>[];

    if (cols.length < 2) return;

    // Build maps: fieldPath → uid, jsKey → uid
    const fieldUidMap = new Map<string, string>();
    const jsUidMap = new Map<string, string>();
    let actionsUid = '';

    for (const c of cols) {
      const use = c.use as string || '';
      if (use.includes('TableActionsColumn')) {
        actionsUid = c.uid as string;
        continue;
      }
      if (use === 'JSColumnModel') {
        const sp = c.stepParams as Record<string, unknown>;
        const title = ((sp?.tableColumnSettings as Record<string, unknown>)?.title as Record<string, unknown>)?.title as string || '';
        const code = ((sp?.jsSettings as Record<string, unknown>)?.runJs as Record<string, unknown>)?.code as string || '';
        // Match by title slug or code desc
        const descMatch = code.match(/\*\s+([^@*\n]+)/);
        const desc = descMatch?.[1]?.trim() || '';
        const matchKey = slugify(title || desc || `js_${jsUidMap.size}`);
        jsUidMap.set(matchKey, c.uid as string);
        continue;
      }
      const fp = (c.stepParams as Record<string, unknown>)?.fieldSettings as Record<string, unknown>;
      const fieldPath = (fp?.init as Record<string, unknown>)?.fieldPath as string;
      if (fieldPath) fieldUidMap.set(fieldPath, c.uid as string);
    }

    // Build desired UID order
    const desired: string[] = [];

    if (columnOrder?.length) {
      // Use interleaved column_order from export (preserves JS column positions)
      for (const entry of columnOrder) {
        if (entry.startsWith('[JS:') && entry.endsWith(']')) {
          const jsKey = entry.slice(4, -1);
          const uid = jsUidMap.get(jsKey);
          if (uid) desired.push(uid);
        } else {
          const uid = fieldUidMap.get(entry);
          if (uid) desired.push(uid);
        }
      }
    } else {
      // Fallback: fields first, then JS columns
      for (const fp of specFields) {
        const uid = fieldUidMap.get(fp);
        if (uid) desired.push(uid);
      }
      for (const uid of jsUidMap.values()) {
        desired.push(uid);
      }
    }

    if (desired.length < 2) return;

    // Check if already correct
    const currentOrder = cols
      .filter(c => !(c.use as string || '').includes('ActionsColumn'))
      .map(c => c.uid as string);

    if (JSON.stringify(desired) === JSON.stringify(currentOrder)) return;

    // Move columns into desired order
    let prevUid = actionsUid;
    let moved = 0;
    for (const uid of desired) {
      if (prevUid) {
        try {
          await nb.surfaces.moveNode(uid, prevUid, 'after');
          moved++;
        } catch { /* skip individual move failures */ }
      }
      prevUid = uid;
    }
  }
}
