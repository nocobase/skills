/**
 * Convert YAML block spec → compose API format.
 *
 * Pure function — no API calls. Used by surface-deployer before compose.
 *
 * ⚠️ PITFALLS:
 * - resource must always have dataSourceKey: 'main' (compose 400 without it)
 * - popup context (editForm/details): binding: 'currentRecord' required
 * - details block: edit/view actions must go to recordActions (not actions)
 * - edit/view NOT in COMPOSE_ACTIONS — only created via save_model when spec declares them
 */
import type { BlockSpec, FieldSpec, LayoutRow } from '../types/spec';
import {
  COMPOSE_BLOCK_TYPES as COMPOSE_TYPES,
  LEGACY_BLOCK_TYPES as LEGACY_TYPES,
  COMPOSE_ACTION_TYPES as COMPOSE_ACTIONS,
} from '../utils/block-types';

// Don't filter system fields — if spec declares them, compose should include them.
// Original build mode adds them automatically, but copy mode needs explicit fields.
const SYSTEM_FIELDS = new Set<string>();

const LAYOUT_KEYS = new Set(['col', 'size']);

export { COMPOSE_TYPES, LEGACY_TYPES, COMPOSE_ACTIONS };

/**
 * Convert a block spec to compose API block format.
 * Returns null if the block type is not supported by compose.
 */
export function toComposeBlock(
  bs: BlockSpec,
  defaultColl: string,
): Record<string, unknown> | null {
  const btype = bs.type;
  const key = bs.key || btype;

  // Reference blocks with templateRef → use compose template mode
  if (btype === 'reference' && bs.templateRef?.templateUid) {
    return {
      key,
      template: {
        uid: bs.templateRef.templateUid,
        mode: bs.templateRef.mode || 'reference',
      },
    };
  }

  if (!COMPOSE_TYPES.has(btype)) return null;

  // Popup association blocks (sourceId with template var) can't use compose binding
  // — must be created via models.save with full resourceSettings
  const earlyBinding = (bs.resource_binding || {}) as Record<string, unknown>;
  const earlySrcId = earlyBinding.sourceId as string;
  if (earlySrcId && earlySrcId.includes('{{') && earlyBinding.associationName) {
    return null; // → handled by save_model in surface-deployer
  }

  const resBinding = bs.resource_binding || {};
  const block: Record<string, unknown> = { key, type: btype };

  // ── Resource ──
  const blockColl = bs.coll || defaultColl;

  if (bs.resource) {
    const resource = { ...bs.resource };
    // Ensure dataSourceKey is always present
    if (resource.collectionName && !resource.dataSourceKey) {
      resource.dataSourceKey = 'main';
    }
    block.resource = resource;
  } else if (resBinding.associationName) {
    const assocName = resBinding.associationName as string;
    const sourceId = resBinding.sourceId as string;
    const isPopupContext = sourceId && sourceId.includes('{{');

    if (isPopupContext) {
      // Popup context: use binding + associationField (short name)
      const assocField = assocName.includes('.') ? assocName.split('.').pop()! : assocName;
      const resource: Record<string, unknown> = {
        collectionName: blockColl,
        dataSourceKey: 'main',
        associationField: assocField,
        binding: ['list', 'gridCard'].includes(btype) ? 'associatedRecords' : 'currentRecord',
      };
      block.resource = resource;
    } else {
      const resource: Record<string, unknown> = {
        collectionName: blockColl,
        dataSourceKey: 'main',
        associationName: assocName,
      };
      if (sourceId) resource.sourceId = sourceId;
      block.resource = resource;
    }
  } else if (resBinding.filterByTk) {
    // Popup context: compose needs collectionName + "currentRecord" binding
    block.resource = blockColl
      ? { collectionName: blockColl, dataSourceKey: 'main', binding: 'currentRecord' }
      : { binding: 'currentRecord' };
  } else if (blockColl && !['jsBlock', 'chart', 'markdown'].includes(btype)) {
    block.resource = { collectionName: blockColl, dataSourceKey: 'main' };
  }

  // ── Template reference (ReferenceBlockModel) ──
  // Compose with template creates ReferenceBlockModel — only key + template, no type/resource/actions
  const hasTemplateRef = !!bs.templateRef?.templateUid;
  if (hasTemplateRef && ['createForm', 'editForm'].includes(btype)) {
    // Return minimal compose block — template handles everything
    return {
      key,
      template: {
        uid: bs.templateRef!.templateUid,
        mode: bs.templateRef!.mode || 'reference',
      },
    };
  }

  // ── Fields ──
  const includeFields = (
    ['table', 'createForm', 'editForm', 'details', 'filterForm'].includes(btype)
  );

  const layoutRows = (bs.field_layout || []).filter((r): r is LayoutRow => Array.isArray(r));
  const allFields = collectFields(bs.fields || [], layoutRows);

  if (allFields.size > 0 && includeFields) {
    block.fields = [...allFields].map(fp => ({ fieldPath: fp }));
  }

  // ── Actions (skip for chart/jsBlock/markdown — no data source) ──
  if (!['chart', 'jsBlock', 'markdown', 'iframe'].includes(btype)) {
    const actions = (bs.actions || []).filter(a => {
      const t = typeof a === 'string' ? a : (a as Record<string, unknown>).type as string;
      return COMPOSE_ACTIONS.has(t);
    });
    const recordActions = (bs.recordActions || []).filter(a => {
      const t = typeof a === 'string' ? a : (a as Record<string, unknown>).type as string;
      return COMPOSE_ACTIONS.has(t);
    });

    if (actions.length > 0) {
      block.actions = actions.map(a => typeof a === 'string' ? { type: a } : a);
    }
    if (recordActions.length > 0) {
      block.recordActions = recordActions.map(a => typeof a === 'string' ? { type: a } : a);
    }
  }

  return block;
}

/**
 * Collect all field paths from fields list + field_layout.
 * Excludes system fields and layout directives.
 */
function collectFields(fields: FieldSpec[], fieldLayout: LayoutRow[]): Set<string> {
  const result = new Set<string>();

  // Collect names of non-compose fields (custom, markdown) to skip in field_layout
  const skipNames = new Set<string>();
  for (const f of fields) {
    if (typeof f !== 'object') continue;
    const fObj = f as unknown as Record<string, unknown>;
    if (fObj.type === 'custom' || fObj.type === 'markdown') {
      skipNames.add((fObj.name as string) || (fObj.key as string) || '');
    }
  }

  // From fields list (skip custom/markdown — they're created via save_model, not compose)
  for (const f of fields) {
    if (typeof f === 'object' && (f as unknown as Record<string, unknown>).type === 'custom') continue;
    if (typeof f === 'object' && (f as unknown as Record<string, unknown>).type === 'markdown') continue;
    const fp = typeof f === 'string' ? f : (f.field || f.fieldPath || '');
    if (fp && !fp.startsWith('[') && !SYSTEM_FIELDS.has(fp)) {
      result.add(fp);
    }
  }

  // From field_layout (may reference fields not in fields list)
  for (const row of fieldLayout) {
    if (!Array.isArray(row)) continue;
    for (const item of row) {
      if (typeof item === 'string' && !item.startsWith('[') && !item.startsWith('---')) {
        if (!SYSTEM_FIELDS.has(item) && !skipNames.has(item)) result.add(item);
      } else if (item && typeof item === 'object') {
        for (const k of Object.keys(item)) {
          if (!LAYOUT_KEYS.has(k) && !k.startsWith('[') && !k.startsWith('---')) {
            if (!SYSTEM_FIELDS.has(k) && !skipNames.has(k)) result.add(k);
          }
        }
      }
    }
  }

  return result;
}
