/**
 * YAML spec types — structure.yaml + enhance.yaml
 */

// ── Block types ──

export type BlockType =
  | 'table' | 'filterForm' | 'createForm' | 'editForm' | 'details'
  | 'list' | 'gridCard' | 'jsBlock' | 'chart' | 'markdown' | 'iframe'
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
  filterPaths?: string[];         // Target filter paths (filterForm fields)
  clickToOpen?: boolean;          // Enable click-to-open popup
  width?: number;                 // Column width (default: auto/150, only export if non-default)
  ellipsis?: boolean;             // Ellipsis on overflow (default: true, only export if false)
  popupSettings?: {
    collectionName?: string;
    mode?: string;
    size?: string;
    filterByTk?: string;
    popupTemplateUid?: string;    // Popup template reference
  };
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
  dataScope?: Record<string, unknown>;
  pageSize?: number;
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

// ── Collection field def ──

export interface FieldDef {
  name: string;
  interface: string;
  title: string;
  required?: boolean;
  target?: string;
  targetField?: string;
  foreignKey?: string;
  options?: (string | { value: string; label: string })[];
  default?: unknown;
  description?: string;
}

// ── Collection def ──

export interface CollectionDef {
  title: string;
  titleField?: string;
  fields: FieldDef[];
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
