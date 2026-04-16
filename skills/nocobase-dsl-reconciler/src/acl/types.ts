/**
 * ACL (Access Control List) types for the NocoBase reconciler.
 *
 * Matches the YAML DSL described in docs/acl-dsl-design.md.
 * These types cover both the on-disk YAML format and the API response shapes.
 */

// ── YAML DSL types (acl.yaml) ──

/** Valid per-collection action names. */
export type AclActionName =
  | 'create' | 'view' | 'update' | 'destroy'
  | 'export' | 'importXlsx';

/** A named scope definition (top-level `scopes:` key). */
export interface ScopeSpec {
  collection: string;
  title: string;
  filter: Record<string, unknown>;
}

/** Per-action permission config within a collection override. */
export interface ActionPermissionSpec {
  /** Scope reference: "all", "own", or a custom key from `scopes:`. */
  scope?: string;
  /** Allowed fields. Empty / omitted = no restriction. */
  fields?: string[];
}

/** Per-collection action overrides within a role. */
export type CollectionPermissions = Partial<Record<AclActionName, ActionPermissionSpec | boolean | Record<string, never>>>;

/** Global table strategy. */
export interface StrategySpec {
  actions: string[];
}

/** A role definition. */
export interface RoleSpec {
  title: string;
  description?: string;
  default?: boolean;
  snippets?: string[];
  allowConfigure?: boolean | null;
  allowNewMenu?: boolean;

  strategy?: StrategySpec;
  pages?: string[];
  collections?: Record<string, CollectionPermissions>;
}

/** Top-level acl.yaml structure. */
export interface AclSpec {
  scopes?: Record<string, ScopeSpec>;
  roles: Record<string, RoleSpec>;
}

// ── API response types ──

/** Role record from `roles:list`. */
export interface ApiRole {
  name: string;
  title: string;
  description?: string | null;
  default?: boolean;
  hidden?: boolean;
  allowConfigure?: boolean | null;
  allowNewMenu?: boolean;
  snippets?: string[];
  strategy?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Data-source role strategy from `dataSources/main/roles:get`. */
export interface ApiDataSourceRole {
  roleName: string;
  dataSourceKey: string;
  strategy?: {
    actions: string[];
  } | null;
}

/** Scope record from `dataSources/main/rolesResourcesScopes:list`. */
export interface ApiScope {
  id: number | string;
  key: string;
  name: string;
  resourceName?: string;
  dataSourceKey?: string;
  scope: Record<string, unknown>;
}

/** Collection config from `roles/<name>/dataSourcesCollections:list`. */
export interface ApiCollectionConfig {
  name: string;
  title?: string;
  roleName: string;
  usingConfig: 'strategy' | 'resourceAction';
  exists: boolean;
}

/** Action record within a resource (from dataSourceResources:get appends). */
export interface ApiResourceAction {
  id?: number | string;
  name: string;
  fields: string[];
  scopeId?: number | string | null;
  scope?: ApiScope | null;
}

/** Resource record from `roles/<name>/dataSourceResources:get`. */
export interface ApiResource {
  id?: number | string;
  roleName?: string;
  dataSourceKey?: string;
  name: string;
  usingActionsConfig: boolean;
  actions?: ApiResourceAction[];
}

/** Route record used for page permission mapping. */
export interface ApiRouteNode {
  id: number;
  title?: string;
  type: string;
  parentId?: number | null;
  schemaUid?: string;
  icon?: string;
  children?: ApiRouteNode[];
}
