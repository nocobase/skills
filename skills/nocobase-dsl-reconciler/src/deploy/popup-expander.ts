/**
 * Expand auto-derived popups from addNew form.
 *
 * auto: [edit]   → derive editForm from addNew (same fields/layout)
 * auto: [detail] → derive details popup for field click (name/title)
 *
 * Pure function — no API calls.
 */
import type { PopupSpec, BlockSpec } from '../types/spec';

/**
 * Expand popup list: auto-derive edit/detail popups from addNew.
 * If a popup with the same target already exists, skip the auto-derived one.
 */
export function expandPopups(popups: PopupSpec[]): PopupSpec[] {
  const existingTargets = new Set(popups.map(ps => ps.target).filter(Boolean));
  const result: PopupSpec[] = [];

  for (const ps of popups) {
    result.push(ps);

    const auto = ps.auto;
    if (!auto?.length) continue;

    const target = ps.target || '';
    const baseRef = extractBaseRef(target);
    const srcBlock = ps.blocks?.[0];
    const coll = ps.coll || '';
    const viewField = ps.view_field || 'name';

    // auto: [edit] — derive editForm
    if (auto.includes('edit')) {
      const editTarget = `${baseRef}.record_actions.edit`;
      if (!existingTargets.has(editTarget) && srcBlock) {
        const editBlock = structuredClone(srcBlock);
        editBlock.key = 'form';
        editBlock.type = 'editForm';
        delete editBlock.resource;
        editBlock.resource_binding = { filterByTk: '{{ctx.view.inputArgs.filterByTk}}' };
        editBlock.coll = coll;

        result.push({ target: editTarget, coll, blocks: [editBlock] });
        existingTargets.add(editTarget);
      }
    }

    // auto: [detail] — derive details popup for field click
    if (auto.includes('detail')) {
      const detailTarget = `${baseRef}.fields.${viewField}`;
      if (!existingTargets.has(detailTarget) && srcBlock) {
        const detailBlock = structuredClone(srcBlock);
        detailBlock.key = 'details_0';
        detailBlock.type = 'details';
        delete detailBlock.resource;
        detailBlock.resource_binding = { filterByTk: '{{ctx.view.inputArgs.filterByTk}}' };
        detailBlock.coll = coll;
        delete (detailBlock as unknown as Record<string, unknown>).actions;
        detailBlock.recordActions = ['edit'];

        // Add createdAt to fields if not present
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
  }

  return result;
}

/**
 * Extract base reference from a popup target.
 * "$categories.table.actions.addNew" → "$categories.table"
 */
function extractBaseRef(target: string): string {
  const parts = target.split('.');
  const baseParts: string[] = [];
  for (const p of parts) {
    if (p === 'actions' || p === 'record_actions') break;
    baseParts.push(p);
  }
  return baseParts.join('.');
}
