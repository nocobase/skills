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
import type { PopupSpec, BlockSpec } from '../../types/spec';

/**
 * Expand popup list: for every addNew popup, auto-derive edit + detail.
 */
export function expandPopups(popups: PopupSpec[], layoutBlocks: BlockSpec[] = []): PopupSpec[] {
  // Build map: blockKey → field name with clickToOpen (for detail popup derivation)
  const clickToOpenByBlock = new Map<string, string>();
  const blocksByKey = new Map<string, BlockSpec>();
  for (const bs of layoutBlocks) {
    blocksByKey.set(bs.key || bs.type, bs);
    if (!Array.isArray(bs.fields)) continue;
    for (const f of bs.fields) {
      if (typeof f !== 'object') continue;
      const fo = f as Record<string, unknown>;
      if (fo.clickToOpen) {
        const name = (fo.field || fo.fieldPath || '') as string;
        if (name) clickToOpenByBlock.set(bs.key || bs.type, name);
        break;
      }
    }
  }

  // Track targets that have INLINE content (hand-crafted, don't overwrite)
  // Template-reference popups (popup: templates/xxx) CAN be replaced by auto-derive
  const handCraftedTargets = new Set(
    popups.filter(ps => ps.blocks?.length || ps.tabs?.length).map(ps => ps.target).filter(Boolean),
  );

  // Also skip auto-derive for any `$SELF.<block>.fields.<field>` whose field
  // already has a `clickToOpen: <template-path>` binding. Deriving on top of
  // that would create an empty popup that overrides the template binding
  // at render time (symptom: clicking the field opens a popup with only
  // one field or no blocks). The template is the popup — don't double-wire.
  for (const bs of layoutBlocks) {
    if (!Array.isArray(bs.fields)) continue;
    for (const f of bs.fields) {
      if (typeof f !== 'object') continue;
      const fo = f as Record<string, unknown>;
      const tplPath = fo._clickToOpenPath || (typeof fo.clickToOpen === 'string' ? fo.clickToOpen : undefined);
      const fieldName = (fo.field || fo.fieldPath || '') as string;
      if (tplPath && fieldName) {
        handCraftedTargets.add(`$SELF.${bs.key || bs.type}.fields.${fieldName}`);
      }
    }
  }
  const result: PopupSpec[] = [];

  for (const ps of popups) {
    result.push(ps);

    // Only derive from addNew popups
    const target = ps.target || '';
    if (!target.includes('.actions.addNew')) continue;

    const baseRef = extractBaseRef(target);
    const srcBlock = ps.blocks?.[0];
    const coll = ps.coll || '';
    // view_field: which field gets clickToOpen detail popup
    // Priority: ps.view_field > clickToOpen field on the block > 'name' default
    const blockKey = baseRef.replace(/^\$SELF\./, '').split('.')[0];
    const viewField = ((ps as Record<string, unknown>).view_field as string)
      || clickToOpenByBlock.get(blockKey)
      || 'name';

    if (!srcBlock) continue;

    // If srcBlock was authored as a shared template ref (key: reference),
    // page-discovery attached `_refContent` with the template's field list
    // and layout. Use that when deriving edit/detail blocks so they aren't
    // empty shells. Without this, a minimal addNew popup that just points
    // at a form template (the agile-build default) would produce a detail
    // popup with zero fields.
    const refContent = (srcBlock as unknown as Record<string, unknown>)._refContent as
      { fields?: unknown; field_layout?: unknown } | undefined;
    const pullRefFields = (b: BlockSpec) => {
      if (!refContent) return;
      if (!b.fields && refContent.fields) b.fields = refContent.fields as BlockSpec['fields'];
      if (!b.field_layout && refContent.field_layout) b.field_layout = refContent.field_layout as BlockSpec['field_layout'];
    };

    // ── Derive editForm popup ──
    // Only if the source block will have recordActions.edit. If the block is
    // a table/details that doesn't declare recordActions in the DSL (typical
    // for copy-mode exports where empty record_actions got dropped), skip —
    // otherwise we emit a popup for a non-existent action and the resolver
    // warns on every deploy.
    const editTarget = `${baseRef}.recordActions.edit`;
    const srcBlockSpec = blocksByKey.get(blockKey);
    const hasEditRecordAction = !!srcBlockSpec?.recordActions?.some(a => {
      const t = typeof a === 'string' ? a : (a as Record<string, unknown>).type as string;
      return t === 'edit';
    });
    if (hasEditRecordAction && !handCraftedTargets.has(editTarget)) {
      const editBlock = structuredClone(srcBlock);
      editBlock.key = 'editForm';
      editBlock.type = 'editForm';
      delete editBlock.resource;
      editBlock.resource_binding = { filterByTk: '{{ctx.view.inputArgs.filterByTk}}' };
      editBlock.coll = coll;
      // Keep templateRef on editForm: a form template is reusable across
      // addNew/edit, so NB renders it correctly via ReferenceFormGridModel.
      // Pull refContent fields too as a fallback when the ref couldn't be
      // resolved (e.g. missing file) so the edit popup isn't empty.
      pullRefFields(editBlock);

      result.push({ target: editTarget, coll, blocks: [editBlock] });
      handCraftedTargets.add(editTarget);
    }

    // ── Derive details popup (field click) ──
    const detailTarget = `${baseRef}.fields.${viewField}`;
    if (!handCraftedTargets.has(detailTarget)) {
      const detailBlock = structuredClone(srcBlock);
      detailBlock.key = 'details';
      detailBlock.type = 'details';
      // A type:'reference' source gets turned into a first-class details
      // block — drop templateRef/templateUid so the deployer doesn't try
      // to render a reference shell.
      delete (detailBlock as unknown as Record<string, unknown>).templateRef;
      delete (detailBlock as unknown as Record<string, unknown>)._fromRef;
      delete (detailBlock as unknown as Record<string, unknown>)._refContent;
      delete detailBlock.resource;
      detailBlock.resource_binding = { filterByTk: '{{ctx.view.inputArgs.filterByTk}}' };
      detailBlock.coll = coll;
      delete (detailBlock as unknown as Record<string, unknown>).actions;

      pullRefFields(detailBlock);

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
      handCraftedTargets.add(detailTarget);
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
