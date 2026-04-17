/**
 * State types — state.yaml tracking UIDs across deploys
 */

export interface FieldState {
  wrapper: string;
  field: string;
}

export interface ActionState {
  uid: string;
  popup_grid?: string;
  popup_page?: string;
  popup_tab?: string;
}

export interface JsState {
  uid: string;
}

export interface BlockState {
  uid: string;
  type: string;
  grid_uid?: string;
  fields?: Record<string, FieldState>;
  actions?: Record<string, ActionState>;
  record_actions?: Record<string, ActionState>;
  js_items?: Record<string, JsState>;
  js_columns?: Record<string, JsState>;
  spec_hash?: string;  // hash of the block's declared DSL spec; when hash matches on redeploy, skip processing
}

export interface TabState {
  tab_uid: string;
  blocks: Record<string, BlockState>;
}

export interface PopupState {
  target_uid: string;
  blocks: Record<string, BlockState>;
}

export interface PageState {
  route_id?: number;
  page_uid?: string;
  tab_uid: string;
  grid_uid?: string;
  blocks: Record<string, BlockState>;
  tab_states?: Record<string, TabState>;
  popups?: Record<string, PopupState>;
}

export interface TemplateState {
  uid: string;         // NocoBase template UID
  targetUid: string;   // template target flowModel UID
  type: 'block' | 'popup';
  collection?: string;
}

export interface ModuleState {
  group_id?: number;
  group_ids?: Record<string, number>;  // keyed by SOURCE group title, for multi-group projects
  pages: Record<string, PageState>;
  template_uids?: Record<string, TemplateState>;  // key = "type:name" e.g. "block:Form: Tasks"
}
