/**
 * Unified registry for block type and action type mappings.
 *
 * Single source of truth — all consumers import derived maps from here.
 *
 * Consumers:
 *   - surface-deployer.ts    → BLOCK_TYPE_TO_MODEL (type → model)
 *   - project-deployer.ts    → BLOCK_TYPE_TO_MODEL
 *   - block-composer.ts      → COMPOSE_BLOCK_TYPES, LEGACY_BLOCK_TYPES, COMPOSE_ACTION_TYPES
 *   - block-exporter.ts      → MODEL_TO_BLOCK_TYPE, MODEL_TO_ACTION_TYPE, SIMPLE_ACTION_TYPES
 *   - action-filler.ts       → NON_COMPOSE_ACTION_TYPE_TO_MODEL
 *   - block-filler.ts        → FILLABLE_ACTION_TYPE_TO_MODEL
 *   - blueprint-converter.ts → BLOCK_TYPE_TO_MODEL
 *   - export/index.ts        → MODEL_TO_BLOCK_TYPE
 */

// ─── Block Registry ───

export interface BlockTypeEntry {
  type: string;           // DSL type name (table, filterForm, etc.)
  model: string;          // NocoBase model class (TableBlockModel, etc.)
  composable: boolean;    // Can be created via compose API
}

export const BLOCK_REGISTRY: BlockTypeEntry[] = [
  // Compose-supported blocks
  { type: 'table',          model: 'TableBlockModel',          composable: true },
  { type: 'filterForm',     model: 'FilterFormBlockModel',     composable: true },
  { type: 'createForm',     model: 'CreateFormModel',          composable: true },
  { type: 'editForm',       model: 'EditFormModel',            composable: true },
  { type: 'details',        model: 'DetailsBlockModel',        composable: true },
  { type: 'list',           model: 'ListBlockModel',           composable: true },
  { type: 'gridCard',       model: 'GridCardBlockModel',       composable: true },
  { type: 'jsBlock',        model: 'JSBlockModel',             composable: true },
  { type: 'chart',          model: 'ChartBlockModel',          composable: true },
  { type: 'markdown',       model: 'MarkdownBlockModel',       composable: true },
  { type: 'iframe',         model: 'IframeBlockModel',         composable: true },
  // Legacy blocks (not supported by compose API)
  { type: 'comments',       model: 'CommentsBlockModel',       composable: false },
  { type: 'recordHistory',  model: 'RecordHistoryBlockModel',  composable: false },
  { type: 'mailMessages',   model: 'MailMessagesBlockModel',   composable: false },
  { type: 'reference',      model: 'ReferenceBlockModel',      composable: false },
];

// ─── Action Registry ───

export interface ActionTypeEntry {
  type: string;           // DSL action name (filter, refresh, ai, etc.)
  model: string;          // NocoBase model class
  composable: boolean;    // In COMPOSE_ACTIONS (block-composer: sent in compose request)
  fillable: boolean;      // Can be added via addAction/addRecordAction API (block-filler)
  simple: boolean;        // No config needed — export as bare string (not object with stepParams)
}

export const ACTION_REGISTRY: ActionTypeEntry[] = [
  // Compose-supported + fillable actions
  { type: 'filter',         model: 'FilterActionModel',                        composable: true,  fillable: true,  simple: true },
  { type: 'refresh',        model: 'RefreshActionModel',                       composable: true,  fillable: true,  simple: true },
  { type: 'addNew',         model: 'AddNewActionModel',                        composable: true,  fillable: true,  simple: true },
  { type: 'delete',         model: 'DeleteActionModel',                        composable: true,  fillable: true,  simple: true },
  { type: 'bulkDelete',     model: 'BulkDeleteActionModel',                    composable: true,  fillable: true,  simple: true },
  { type: 'submit',         model: 'SubmitActionModel',                        composable: true,  fillable: true,  simple: true },
  { type: 'reset',          model: 'ResetActionModel',                         composable: true,  fillable: true,  simple: true },
  // Not in compose request, but fillable via addAction/addRecordAction API
  { type: 'edit',           model: 'EditActionModel',                          composable: false, fillable: true,  simple: true },
  { type: 'view',           model: 'ViewActionModel',                          composable: false, fillable: true,  simple: true },
  // Non-compose, non-fillable (legacy save_model only)
  { type: 'duplicate',      model: 'DuplicateActionModel',                     composable: false, fillable: false, simple: false },
  { type: 'export',         model: 'ExportActionModel',                        composable: false, fillable: false, simple: false },
  { type: 'import',         model: 'ImportActionModel',                        composable: false, fillable: false, simple: false },
  { type: 'link',           model: 'LinkActionModel',                          composable: false, fillable: false, simple: false },
  { type: 'workflowTrigger', model: 'CollectionTriggerWorkflowActionModel',    composable: false, fillable: false, simple: false },
  { type: 'ai',             model: 'AIEmployeeButtonModel',                    composable: false, fillable: false, simple: false },
  { type: 'expandCollapse', model: 'ExpandCollapseActionModel',                composable: false, fillable: false, simple: true },
  { type: 'popup',          model: 'PopupCollectionActionModel',               composable: false, fillable: false, simple: false },
  { type: 'updateRecord',   model: 'UpdateRecordActionModel',                  composable: false, fillable: false, simple: false },
  { type: 'addChild',       model: 'AddChildActionModel',                      composable: false, fillable: false, simple: false },
  { type: 'historyExpand',  model: 'RecordHistoryExpandActionModel',           composable: false, fillable: false, simple: true },
  { type: 'historyCollapse', model: 'RecordHistoryCollapseActionModel',        composable: false, fillable: false, simple: true },
];

/**
 * Action model aliases — additional model names that map to canonical action types.
 *
 * The exporter encounters these variant model names in live trees.
 * They map to the same DSL type as the canonical model in ACTION_REGISTRY.
 */
export const ACTION_MODEL_ALIASES: Record<string, string> = {
  FormSubmitActionModel: 'submit',
  FilterFormSubmitActionModel: 'submit',
  FilterFormResetActionModel: 'reset',
  FilterFormCollapseActionModel: 'collapse',
};

// ─── Derived maps (block types) ───

/** Block type shorthand → FlowModel class name. */
export const BLOCK_TYPES: Record<string, string> = Object.fromEntries(
  BLOCK_REGISTRY.map(e => [e.type, e.model]),
);

/** Alias for BLOCK_TYPES — used by surface-deployer, project-deployer, blueprint-converter. */
export const BLOCK_TYPE_TO_MODEL = BLOCK_TYPES;

/** FlowModel class name → block type shorthand. */
export const MODEL_TO_TYPE: Record<string, string> = Object.fromEntries(
  BLOCK_REGISTRY.map(e => [e.model, e.type]),
);

/** Alias for MODEL_TO_TYPE — used by block-exporter, project-exporter. */
export const MODEL_TO_BLOCK_TYPE = MODEL_TO_TYPE;

/** Block types supported by compose API. */
export const COMPOSE_BLOCK_TYPES: Set<string> = new Set(
  BLOCK_REGISTRY.filter(e => e.composable).map(e => e.type),
);

/** Block types NOT supported by compose API (legacy save_model). */
export const LEGACY_BLOCK_TYPES: Set<string> = new Set(
  BLOCK_REGISTRY.filter(e => !e.composable).map(e => e.type),
);

// ─── Derived maps (action types) ───

/** Action type shorthand → FlowModel class name (all actions). */
export const ACTION_TYPES: Record<string, string> = Object.fromEntries(
  ACTION_REGISTRY.map(e => [e.type, e.model]),
);

/** Alias for ACTION_TYPES. */
export const ACTION_TYPE_TO_MODEL = ACTION_TYPES;

/**
 * FlowModel class name → action type shorthand (canonical entries only).
 *
 * Note: some model names map to the same type (e.g. SubmitActionModel,
 * FormSubmitActionModel, FilterFormSubmitActionModel all → 'submit').
 * This map only contains the canonical entry from ACTION_REGISTRY.
 * For the full map including aliases, use MODEL_TO_ACTION_TYPE_FULL.
 */
export const ACTION_MODEL_TO_TYPE: Record<string, string> = Object.fromEntries(
  ACTION_REGISTRY.map(e => [e.model, e.type]),
);

/**
 * FlowModel class name → action type shorthand (including aliases).
 *
 * Used by block-exporter to resolve variant model names encountered in live trees.
 */
export const MODEL_TO_ACTION_TYPE: Record<string, string> = {
  ...ACTION_MODEL_TO_TYPE,
  ...ACTION_MODEL_ALIASES,
};

/** Action types supported by compose API (sent in compose request). */
export const COMPOSE_ACTION_TYPES: Set<string> = new Set(
  ACTION_REGISTRY.filter(e => e.composable).map(e => e.type),
);

/**
 * Action types fillable via addAction/addRecordAction API.
 * Superset of COMPOSE_ACTION_TYPES — includes edit/view.
 * Used by block-filler.
 */
export const FILLABLE_ACTION_TYPE_TO_MODEL: Record<string, string> = Object.fromEntries(
  ACTION_REGISTRY.filter(e => e.fillable).map(e => [e.type, e.model]),
);

/** Action types that are simple (bare string in export, no config needed). */
export const SIMPLE_ACTION_TYPES: Set<string> = new Set([
  ...ACTION_REGISTRY.filter(e => e.simple).map(e => e.type),
  // Alias-only types that are also simple (produced by exporter, not in ACTION_REGISTRY)
  'collapse',
]);

/**
 * Non-compose action type → model map.
 * Actions that must be created via legacy save_model (not compose API, not addAction).
 * Used by action-filler.
 */
export const NON_COMPOSE_ACTION_TYPE_TO_MODEL: Record<string, string> = Object.fromEntries(
  ACTION_REGISTRY.filter(e => !e.composable && !e.fillable).map(e => [e.type, e.model]),
);

// ─── Legacy aliases (backward compatibility with utils/index.ts re-exports) ───

// BLOCK_TYPES, MODEL_TO_TYPE, ACTION_TYPES, ACTION_MODEL_TO_TYPE
// are already exported above as named exports.
