/**
 * NocoBase API response types
 */

export interface ComposeBlockResult {
  key: string;
  type: string;
  uid: string;
  gridUid?: string;
  fields?: ComposeFieldResult[];
  actions?: ComposeActionResult[];
  recordActions?: ComposeActionResult[];
}

export interface ComposeFieldResult {
  key: string;
  uid: string;
  fieldPath: string;
  wrapperUid: string;
  fieldUid: string;
  innerFieldUid?: string;
}

export interface ComposeActionResult {
  key: string;
  type: string;
  uid: string;
  parentUid?: string;
  scope?: string;
}

export interface ComposeResult {
  target: { uid: string };
  mode: string;
  keyToUid: Record<string, string>;
  blocks: ComposeBlockResult[];
  layout?: {
    uid: string;
    rows: Record<string, string[][]>;
    sizes: Record<string, number[]>;
    rowOrder: string[];
  };
}

export interface PageResult {
  routeId: number;
  pageUid: string;
  tabSchemaUid: string;
  gridUid: string;
}

export interface MenuResult {
  routeId: number;
}

export interface FlowModelNode {
  uid: string;
  use: string;
  parentId?: string;
  subKey?: string;
  subType?: string;
  sortIndex?: number;
  stepParams?: Record<string, unknown>;
  flowRegistry?: Record<string, unknown>;
  subModels?: Record<string, FlowModelNode | FlowModelNode[]>;
}

export interface FlowModelTree {
  tree: FlowModelNode;
}

export interface CollectionMeta {
  name: string;
  title: string;
  fields?: FieldMeta[];
}

export interface FieldMeta {
  name: string;
  interface: string;
  type?: string;
  uiSchema?: Record<string, unknown>;
}
