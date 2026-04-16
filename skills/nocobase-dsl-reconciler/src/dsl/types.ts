/**
 * DSL builder types — intermediate representations that compile to spec types.
 *
 * Naming: all DSL types use "Def" suffix to distinguish from spec types.
 * The existing spec.ts FieldDef (collection schema) is unrelated to these.
 */

import type { BlockType, ActionType } from '../types/spec';

// ── Field definition (column / form field) ──

export interface FieldOpts {
  width?: number;
  ellipsis?: boolean;
  clickToOpen?: boolean;
  label?: string;
  filterPaths?: string[];
  popup?: string | true | PopupOpts;
  popupSettings?: {
    collectionName?: string;
    mode?: string;
    size?: string;
    filterByTk?: string;
    popupTemplateUid?: string;
  };
}

/** A field reference in the DSL — either a bare field name or field() call result. */
export type FieldInput = string | FieldDefNode;

export interface FieldDefNode {
  __kind: 'field';
  name: string;
  opts: FieldOpts;
}

// ── Action definition ──

export interface LinkOpts {
  icon?: string;
  url: string;
  key?: string;
  stepParams?: Record<string, unknown>;
}

export interface AiOpts {
  employee: string;
  tasksFile?: string;
  key?: string;
}

export interface UpdateRecordOpts {
  icon?: string;
  tooltip?: string;
  style?: 'link' | 'default';
  assign: Record<string, unknown>;
  hiddenWhen?: DataScopeInput;
  key?: string;
  stepParams?: Record<string, unknown>;
}

/** A simple action string or a full action definition. */
export type ActionInput = string | ActionDefNode;

export interface ActionDefNode {
  __kind: 'action';
  type: ActionType;
  config: Record<string, unknown>;
}

// ── DataScope (filter) ──

export interface DataScopeItem {
  path: string;
  operator: string;
  value: unknown;
  noValue?: boolean;
}

export interface DataScopeInput {
  logic: '$and' | '$or';
  items: DataScopeItem[];
}

// ── JS block / column / item ──

export interface JsColumnInput {
  key: string;
  field?: string;
  file: string;
  title?: string;
  desc?: string;
}

export interface JsItemInput {
  key: string;
  file: string;
  desc?: string;
}

// ── Event flow ──

export interface EventFlowInput {
  flow_key: string;
  event: string | Record<string, unknown>;
  file: string;
  step_key?: string;
  desc?: string;
}

// ── Layout ──

export type LayoutCell = string | Record<string, number>;
export type LayoutRow = LayoutCell[];

// ── Block definition ──

export interface BlockDefNode {
  __kind: 'block';
  key: string;
  type: BlockType;
  coll?: string;
  title?: string;
  desc?: string;
  file?: string;
  chartConfig?: string;
  fields?: FieldInput[];
  actions?: ActionInput[];
  recordActions?: ActionInput[];
  jsColumns?: JsColumnInput[];
  jsItems?: JsItemInput[];
  fieldLayout?: (LayoutRow | string)[];
  columnOrder?: string[];
  eventFlows?: EventFlowInput[];
  resource?: ResourceInput;
  resourceBinding?: ResourceBindingInput;
  dataScope?: DataScopeInput | Record<string, unknown>;
  pageSize?: number;
  sort?: Record<string, unknown>;
  tableSettings?: Record<string, unknown>;
  popups?: PopupDefNode[];
  tabs?: TabDefNode[];
  templateRef?: {
    templateUid: string;
    templateName?: string;
    targetUid: string;
    mode?: string;
  };
  stepParams?: Record<string, unknown>;
}

// ── Popup definition ──

export interface PopupOpts {
  mode?: 'drawer' | 'dialog';
  coll?: string;
  blocks: BlockInput[];
  layout?: LayoutRow[];
  tabs?: TabDefNode[];
}

export interface PopupDefNode {
  __kind: 'popup';
  target: string;
  mode?: 'drawer' | 'dialog';
  coll?: string;
  blocks: BlockInput[];
  layout?: LayoutRow[];
  tabs?: TabDefNode[];
}

// ── Tab definition ──

export interface TabDefNode {
  __kind: 'tab';
  title?: string;
  coll?: string;
  blocks: BlockInput[];
  layout?: LayoutRow[];
  popups?: PopupDefNode[];
}

// ── Resource ──

export interface ResourceInput {
  collectionName?: string;
  dataSourceKey?: string;
  associationName?: string;
  sourceId?: string | number;
  binding?: 'currentRecord' | 'associatedRecords' | 'otherRecords';
}

export interface ResourceBindingInput {
  filterByTk?: string;
  associationName?: string;
  sourceId?: string | number;
}

// ── Page definition ──

export interface PageDefNode {
  __kind: 'page';
  title: string;
  icon?: string;
  coll?: string;
  blocks: BlockInput[];
  layout?: LayoutRow[];
  tabs?: TabDefNode[];
  popups?: PopupDefNode[];
  pageEventFlows?: EventFlowInput[];
}

// ── Block input (can be a node or inline) ──

export type BlockInput = BlockDefNode;

// ── Route / App definition ──

export interface RouteDefNode {
  __kind: 'route';
  title: string;
  type: 'group' | 'flowPage';
  icon?: string;
  hidden?: boolean;
  children?: RouteDefNode[];
  /** For flowPage routes — the page definition. */
  page?: PageDefNode;
}

export interface AppDefNode {
  __kind: 'app';
  title: string;
  icon?: string;
  routes: RouteDefNode[];
}
