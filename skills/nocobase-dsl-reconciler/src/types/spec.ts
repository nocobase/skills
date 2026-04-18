/**
 * YAML spec types — structure.yaml + enhance.yaml
 */

// ── Block types ──

export type BlockType =
  | 'table' | 'filterForm' | 'createForm' | 'editForm' | 'details'
  | 'list' | 'gridCard' | 'jsBlock' | 'chart' | 'markdown' | 'iframe'
  | 'map' | 'actionPanel'
  | 'comments' | 'recordHistory' | 'mailMessages' | 'reference';

export type ActionType =
  | 'filter' | 'refresh' | 'addNew' | 'delete' | 'bulkDelete'
  | 'submit' | 'reset' | 'edit' | 'view' | 'duplicate'
  | 'export' | 'import' | 'link' | 'workflowTrigger' | 'ai'
  | 'expandCollapse' | 'popup' | 'updateRecord';

// ── Field reference ──

export interface FieldRef {
  field: string;                  // Field path (e.g. 'name', 'customer.name')
  fieldPath?: string;             // @deprecated — use `field` instead
  label?: string;                 // Display label (filterForm fields)
  filterPaths?: string[];         // Flat filter paths — broadcast to all target blocks (legacy / single-target)
  /**
   * Per-target filter paths. When set, `filterPaths` is ignored and each
   * entry binds the field to ONE specific target block by its `key`
   * (matching another block in the same page's `blocks[]`). Required for
   * multi-table lookups where each table has different filterable columns
   * (e.g. leads has `account_number`, customers has `name` only).
   */
  targets?: { block: string; paths: string[] }[];
  clickToOpen?: boolean | string;  // true = auto-detect popup; "path" = explicit template file
  width?: number;                 // Column width (default: auto/150, only export if non-default)
  ellipsis?: boolean;             // Ellipsis on overflow (default: true, only export if false)
  popupSettings?: {
    collectionName?: string;
    mode?: string;
    size?: string;
    filterByTk?: string;
    popupTemplateUid?: string;    // Popup template reference
  };
  /**
   * When set, this o2m/m2m field renders as an inline editable sub-table
   * (PatternFormFieldModel + SubTableColumnModel children) instead of the
   * default RecordSelect picker. `columns` lists the child fields shown
   * in each row. Each entry can be a plain field name string or a
   * SubTableColumn object for column-level overrides.
   */
  type?: 'subTable' | 'subForm';
  columns?: (string | SubTableColumn)[];
  /**
   * For sub-form rendering of m2o/o2o fields: list of child fields to
   * inline-edit (vs. opening a popup). When omitted, falls back to NB
   * default (collection's titleField).
   */
  fields?: (string | FieldRef)[];
  mode?: 'inline' | 'collapse' | 'popup';
}

export interface SubTableColumn {
  field: string;                  // Sub-field name (no parent prefix — e.g. `quantity`, NOT `items.quantity`)
  width?: number;
  readonly?: boolean;
  hidden?: boolean;
}

export type FieldSpec = string | FieldRef;

// ── Resource ──

export interface ResourceSpec {
  collectionName?: string;
  dataSourceKey?: string;
  associationName?: string;
  sourceId?: string | number;
  binding?: 'currentRecord' | 'associatedRecords' | 'otherRecords';
}

export interface ResourceBinding {
  filterByTk?: string;
  associationName?: string;
  sourceId?: string | number;
}

// ── Action spec ──

export interface ActionSpec {
  type: ActionType;
  employee?: string;
  tasks_file?: string;
  [key: string]: unknown;
}

// ── JS item/column ──

export interface JsItemSpec {
  key: string;
  file: string;
  desc?: string;
}

export interface JsColumnSpec {
  key: string;
  field: string;
  file: string;
  title?: string;
  desc?: string;
}

// ── Event flow ──

export interface EventFlowSpec {
  flow_key: string;
  event: string | Record<string, unknown>;
  file: string;
  step_key?: string;
  desc?: string;
}

// ── Chart config ──

export interface ChartConfigSpec {
  sql?: string;
  sql_file?: string;
  render?: string;
  render_file?: string;
  title?: string;
  type?: string;
}

// ── Layout ──

export type LayoutCell = string | Record<string, number>;
export type LayoutRow = LayoutCell[];

// ── Block spec ──

export interface BlockSpec {
  key: string;
  type: BlockType;
  coll?: string;
  title?: string;
  desc?: string;
  file?: string;                    // jsBlock JS file
  chart_config?: string;            // chart config file
  templateRef?: {                   // ReferenceFormGridModel template reference
    templateUid: string;
    templateName?: string;
    targetUid: string;
    mode?: string;
  };
  fields?: FieldSpec[];
  actions?: (string | ActionSpec)[];
  recordActions?: (string | ActionSpec)[];
  js_items?: JsItemSpec[];
  js_columns?: JsColumnSpec[];
  field_layout?: (LayoutRow | string)[];  // rows + divider strings like '--- Section ---'
  event_flows?: EventFlowSpec[];
  resource?: ResourceSpec;
  resource_binding?: ResourceBinding;
  filter?: Record<string, unknown>;     // Shorthand: { field.$op: value } — deployer converts to dataScope
  dataScope?: Record<string, unknown>;
  pageSize?: number;
  dataLoadingMode?: 'auto' | 'manual';   // Table block: when 'manual', table only loads after user clicks Search
  sort?: Record<string, unknown>;
  tableSettings?: Record<string, unknown>;
  popups?: PopupSpec[];
  tabs?: TabSpec[];
  // ── Linkage / reaction rules ──
  fieldValueRules?: Record<string, unknown>[];   // form field conditional value rules
  blockLinkageRules?: Record<string, unknown>[];  // block conditional visibility rules
  fieldLinkageRules?: Record<string, unknown>[];  // form field conditional display/required/value
}

// ── Popup spec ──

export interface PopupSpec {
  target: string;
  mode?: 'drawer' | 'dialog';  // default: drawer
  coll?: string;
  blocks?: BlockSpec[];
  tabs?: TabSpec[];
  layout?: LayoutRow[];
  auto?: ('edit' | 'detail')[];  // auto-derive edit/detail from addNew form
  view_field?: string;           // field name for detail popup clickToOpen (default: 'name')
}

// ── Tab spec ──

export interface TabSpec {
  title?: string;
  coll?: string;
  blocks?: BlockSpec[];
  layout?: LayoutRow[];
  popups?: PopupSpec[];
}

// ── Page spec ──

export interface PageSpec {
  page: string;
  icon?: string;
  coll?: string;
  blocks: BlockSpec[];
  layout?: LayoutRow[];
  tabs?: TabSpec[];
  page_event_flows?: EventFlowSpec[];
}

// ── Field interface types ──

/** All supported NocoBase field interfaces. */
export type FieldInterface =
  // Basic scalar
  | 'input' | 'textarea' | 'email' | 'phone' | 'url'
  | 'password' | 'color' | 'icon'
  | 'integer' | 'number' | 'percent' | 'checkbox'
  // Choices
  | 'select' | 'multipleSelect' | 'radioGroup' | 'checkboxGroup'
  | 'chinaRegion'
  // Date & time
  | 'datetime' | 'datetimeNoTz' | 'dateOnly' | 'time' | 'unixTimestamp'
  // Rich text & media
  | 'markdown' | 'richText' | 'vditor' | 'attachment' | 'attachmentURL'
  // Relations
  | 'm2o' | 'o2m' | 'm2m' | 'o2o'
  // System (auto-created, do NOT include in collection YAML)
  | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'
  | 'id' | 'snowflakeId' | 'uuid' | 'nanoid'
  // Advanced
  | 'formula' | 'sequence' | 'sort' | 'code' | 'encryption' | 'json'
  | 'tableoid' | 'space'
  // Map / geometry (plugin-backed)
  | 'point' | 'lineString' | 'circle' | 'polygon';

// ── Collection field def ──

export interface FieldDef {
  name: string;
  interface: FieldInterface;
  title: string;
  required?: boolean;
  target?: string;           // relation target collection
  targetField?: string;      // relation target field (default: id)
  foreignKey?: string;       // explicit FK name
  through?: string;          // m2m join table
  options?: (string | { value: string; label: string; color?: string })[];
  default?: unknown;
  description?: string;
  uiSchema?: Record<string, unknown>;
}

// ── Collection def ──

/** A raw SQL object (trigger, function, view, constraint...) that lives on
 *  the collection's underlying table. Stored verbatim — we don't try to
 *  abstract over PostgreSQL DDL because the surface area is too large
 *  relative to the win. Ensure-style: drop+recreate by name on each deploy. */
export interface SqlObjectDef {
  name: string;            // identity for drop+recreate (must be unique within the collection)
  kind?: 'trigger' | 'function' | 'view' | 'constraint' | 'index';  // hint only — sql is authoritative
  sql: string;             // full DDL (CREATE OR REPLACE / CREATE INDEX / etc.)
  drop?: string;           // DROP statement to run BEFORE sql; auto-derived if omitted
}

export interface CollectionDef {
  title: string;
  titleField?: string;
  fields: FieldDef[];
  /** Raw SQL DDL that travels with the collection — captured by pull, deployed
   *  by push. Used for triggers / functions / db-level constraints that NB's
   *  collection schema can't express. */
  triggers?: SqlObjectDef[];
}

// ── Top-level structure.yaml ──

export interface StructureSpec {
  module: string;
  icon?: string;
  group?: string;
  collections?: Record<string, CollectionDef>;
  pages: PageSpec[];
}

// ── Top-level enhance.yaml ──

export interface EnhanceSpec {
  popups?: PopupSpec[];
}
