// Public API
export { NocoBaseClient, type NocoBaseClientOptions } from './client';
export { RefResolver } from './refs';
export { parseLayoutSpec, applyLayout, type GridLayout } from './layout';
export * from './types';
export { slugify, generateUid, deepMerge, loadYaml, dumpYaml, saveYaml } from './utils';

// Deploy
export { validate, toComposeBlock, expandPopups, verifySql, deploySurface, deployPopup, fillBlock, ensureAllCollections, postVerify, reorderTableColumns } from './deploy';
export { scaffold } from './deploy/scaffold';

// Export
export { exportPageSurface, exportPopupSurface, exportAllPopups } from './export';

// Sync
export { sync } from './sync';

// ACL
export { exportAcl, deployAcl, deployAclSpec } from './acl';
export type { AclSpec, RoleSpec, ScopeSpec, ExportAclOptions, DeployAclOptions } from './acl';

// Workflow
export { exportWorkflows, deployWorkflows } from './workflow';
export type { WorkflowSpec, NodeSpec, WorkflowState, WorkflowStateFile } from './workflow';

// DSL builder API
export {
  // Field
  field,
  // Actions
  link, ai, updateRecord, action,
  // Blocks
  table, filterForm, form, editForm, details, list, gridCard,
  jsBlock, chart, markdown, reference,
  // Popup / Tab / Page / Route / App
  popup, tab, page, group, route, app,
  // Helpers
  filter, jsColumn, jsItem, eventFlow,
} from './dsl';
export { compilePage, compileRoutes, compileApp } from './dsl/compile';
export { loadTsPage, loadTsApp, loadTsPages, loadPageLayout } from './dsl/loader';
