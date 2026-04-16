/**
 * Auto-derive edit + detail popups from addNew form.
 *
 * AI only writes ONE popup (addNew). This expander automatically creates:
 *   - editForm popup on recordActions.edit (same fields/layout, + filterByTk binding)
 *   - details popup on fields.name click (same fields, type=details, + createdAt)
 *
 * If edit/detail popups already exist (manually defined), skip derivation.
 * Pure function — no API calls.
 */
import type { PopupSpec, BlockSpec } from '../types/spec';

/**
 * Expand popup list: for every addNew popup, auto-derive edit + detail.
 */
export function expandPopups(popups: PopupSpec[]): PopupSpec[] {
  const existingTargets = new Set(popups.map(ps => ps.target).filter(Boolean));
  const result: PopupSpec[] = [];

  for (const ps of popups) {
    result.push(ps);

    // Only derive from addNew popups
    const target = ps.target || '';
    if (!target.includes('.actions.addNew')) continue;

    const baseRef = extractBaseRef(target);
    const srcBlock = ps.blocks?.[0];
    const coll = ps.coll || '';
    // view_field: which field gets clickToOpen detail popup (default: 'name')
    const viewField = (ps as Record<string, unknown>).view_field as string || 'name';

    if (!srcBlock) continue;

    // ── Derive editForm popup ──
    const editTarget = `${baseRef}.recordActions.edit`;
    if (!existingTargets.has(editTarget)) {
      const editBlock = structuredClone(srcBlock);
      editBlock.key = 'editForm';
      editBlock.type = 'editForm';
      delete editBlock.resource;
      editBlock.resource_binding = { filterByTk: '{{ctx.view.inputArgs.filterByTk}}' };
      editBlock.coll = coll;

      result.push({ target: editTarget, coll, blocks: [editBlock] });
      existingTargets.add(editTarget);
    }

    // ── Derive details popup (field click) ──
    const detailTarget = `${baseRef}.fields.${viewField}`;
    if (!existingTargets.has(detailTarget)) {
      const detailBlock = structuredClone(srcBlock);
      detailBlock.key = 'details';
      detailBlock.type = 'details';
      delete detailBlock.resource;
      detailBlock.resource_binding = { filterByTk: '{{ctx.view.inputArgs.filterByTk}}' };
      detailBlock.coll = coll;
      delete (detailBlock as unknown as Record<string, unknown>).actions;

      // Add createdAt to detail fields if not present
      const fields = detailBlock.fields || [];
      if (!fields.includes('createdAt')) {
        fields.push('createdAt');
      }
      detailBlock.fields = fields;

      result.push({
        target: detailTarget,
        mode: 'drawer',
        coll,
        blocks: [detailBlock],
      });
      existingTargets.add(detailTarget);
    }
  }

  return result;
}

/**
 * Extract base reference from a popup target.
 * "$tasks.table.actions.addNew" → "$tasks.table"
 */
function extractBaseRef(target: string): string {
  const parts = target.split('.');
  const baseParts: string[] = [];
  for (const p of parts) {
    if (p === 'actions' || p === 'recordActions' || p === 'record_actions' || p === 'fields') break;
    baseParts.push(p);
  }
  return baseParts.join('.');
}
