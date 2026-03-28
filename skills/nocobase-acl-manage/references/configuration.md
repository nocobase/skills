# ACL Configuration

## Configuration standard

When the user asks for a realistic business-role configuration, do not stop after creating roles and adding a few actions.

Build a permission matrix first:

- which system snippets are allowed or denied
- which desktop/mobile routes are granted
- which collections rely on global table strategy
- which collections use independent permissions
- which actions are allowed on each collection
- which fields are visible or editable for each important action
- which row scopes apply, or why no scope is needed

General rule:

- If a layer is intentionally empty, write down the reason.
- Do not leave global strategy empty, field lists empty, or scope empty by accident.
- "No scope" is only valid when the business truly wants full-row access for that action.
- "No field restriction" is only valid when the business truly accepts full-field access for that action.

## 1. Create or update the role itself

Use role CRUD when the task is about:

- adding a new role
- renaming or describing a role
- hiding a role
- setting whether a role is configurable
- setting snippets

Only set `default: true` when the user clearly wants this role assigned automatically to new users.

## 2. Configure system permissions

System permissions are configured on the role itself, typically through `roles:update`.
Plugin/configuration permissions may also be adjusted incrementally through snippet association actions such as:

- `roles.snippets:add`
- `roles.snippets:remove`

Primary field:

- `snippets`

Use this layer for broad system capability such as:

- allowing UI/system features
- denying plugin-manager capability
- denying app-level capability
- allowing or denying specific plugin/configuration entries such as `pm.api-doc.documentation`

Do not use snippets as a shortcut for ordinary business-table access.

Common high-leverage snippets:

- `ui.*`
  - Allows to configure interface.
- `pm`
  - Allows to install, activate, disable plugins.
- `pm.*`
  - Allows to configure plugins.
- `app`
  - Allows to clear cache, reboot application.

General rule:

- Ordinary business roles should not receive these high-privilege snippets by default.
- Grant them only when the user explicitly wants a role that can configure the system, plugins, interface, or application lifecycle.

## 3. Set the default role

Use the dedicated default-role action when the user wants all new users to receive a specific role automatically.

Do not infer this from the role title or from a role being “basic”.

## 4. Set the system role mode

Check role mode before debugging “wrong permissions” for multi-role users.

- `default`
  - Users operate under one active role.
  - If `X-Role` asks for union mode here, middleware falls back to a normal role.
- `allow-use-union`
  - Users can switch into the synthetic union role.
- `only-use-union`
  - Middleware forces union behavior for multi-role users.

If the user reports inconsistent access across sessions or role switches, verify role mode first.

## 5. Configure route permissions

Route permissions are separate from system snippets and table ACL.

Common desktop route operations:

- `roles.desktopRoutes:add`
- `roles.desktopRoutes:remove`
- `roles.desktopRoutes:set`
- `roles.desktopRoutes:list`
- `desktopRoutes:listAccessible`

Treat route permissions as menu/page visibility controls. Configure them explicitly when the user asks about desktop/mobile navigation, visible menus, or accessible pages.

## 6. Configure global table permissions

Use the data-source role strategy endpoint first for broad permissions.

This is the right layer for rules like:

- this role can view all records in a collection family
- this role can create and update records generally
- this role should only have `view:own`

Prefer the global strategy when:

- many collections should behave similarly
- the user is describing a role broadly
- no field-level or collection-specific exception is needed yet

Do not jump straight to resource-level overrides for every collection. That makes ACL harder to audit and easier to drift.

Realistic-role guidance:

- If the final design keeps global strategy empty, state why. Common reasons:
  - the role should only touch a small set of business collections
  - non-business collections must not inherit broad rights
  - every relevant collection has materially different rules and therefore uses independent permissions
- Do not leave global strategy empty simply because independent permissions were easier to prototype.

## 7. Configure table independent permissions

Use collection-level resource config only when one collection needs exceptions beyond the global table strategy.

Common cases:

- only one collection should be readable
- one collection should use `view:own` while the rest use `view`
- one action on one collection should expose only part of the fields
- one collection needs a custom scope filter

Key flag:

- `usingActionsConfig: true`
  - This means the collection is using dedicated action configuration.

Inspect `availableActions:list` before writing action names. Do not guess action names or assume every action supports field-level configuration.

Realistic-role guidance:

- Independent permissions should usually include not only action names but also an explicit field strategy for important actions.
- For business roles, `view`, `create`, `update`, and `export` often need different field lists.
- If fields are omitted intentionally, confirm that full-field access is acceptable for that action.

## 8. Configure field permissions

Field permission is action-specific.

Before restricting fields:

- inspect `availableActions:list`
- use only actions where `allowConfigureFields` is true

Be conservative with field whitelists. Overly narrow field lists often break UI blocks, association labels, or update forms in ways that look like data issues rather than ACL issues.

Realistic-role guidance:

- Configure field lists wherever the business distinguishes between readable fields and editable fields.
- Treat the following as strong signals that field permissions should be explicit:
  - sensitive identity fields
  - financial fields
  - approval or status fields
  - file/attachment relation fields
  - association fields whose mutation should be controlled
- A realistic role config should be able to answer:
  - what this role may see
  - what this role may edit
  - what this role may export

Relation-field guidance:

- For relation fields, update permission on the field effectively controls whether the request may change that association through ordinary create/update payloads.
- Treat relation-field update permission as association-change permission, not just scalar field editing.
- If the business needs a user to change a relation such as owner, assignee, account, or contact, make sure that relation field is included in the allowed update/create field list where applicable.
- If the business must only read a relation label but must not change the association, allow the relation field on view/export actions but keep it out of create/update field lists.

## 9. Configure row scopes

Use scopes for:

- own-record access
- location/site-based access
- business-unit filters
- published / active / approved record subsets

Treat scope filters like production query logic. Validate them carefully.

Good patterns:

- `createdById = current user id`
- relation-aware filters that match real schema paths
- reusable named scopes for repeated business rules

Bad patterns:

- filters referencing fields that do not exist
- own-record semantics on collections without ownership fields
- copying a scope from one collection to another without checking field compatibility

Realistic-role guidance:

- Decide scope explicitly for every important action.
- If there is no scope, confirm that full-row visibility or mutation is intended.
- If different roles should see different organizational slices, do not postpone scope design until after action configuration.

Scope creation rules:

- Business scopes should be created under the target data source, for example `dataSources/{dataSourceKey}/rolesResourcesScopes:create`.
- Do not create business scopes in global `rolesResourcesScopes`.
- Built-in scopes such as `all` and `own` are system-provided defaults. Treat them as immutable.
- When creating a scope, pass only business fields such as `name`, `resourceName`, and `scope`.
- Do not pass `id` when creating a scope. The database generates it.
- When binding an existing scope to an action, pass `scopeId`.
- Do not bind a scope by passing nested `scope.id` or a full `scope` object in place of `scopeId`.
- Prefer relation-path filters that match the business meaning in the schema, for example `owner.id` or `assignee.id`.
- Do not default to low-level foreign-key filters such as `ownerId` or `assigneeId` in generic ACL guidance unless the user explicitly wants field-based filters.
- Use built-in `own` only when the intended rule really means `createdById = current user id`.
- Do not substitute built-in `own` for other business semantics such as owner, assignee, approver, or manager.

Scope variables and built-in scopes:

- In the ACL scope editor, the frontend variable selector primarily exposes:
  - `$user`
    - Current user
    - Backed by the `users` collection
    - Default depth is 3, so nested paths such as `{{$user.department.manager.id}}` may be selectable when those relations exist on `users`
  - `$nRole`
    - Current role
    - Bound to the `roles` collection
    - Intended mainly for the current role value itself; the frontend marks it as no-children
- Recommended variable usage:
  - Use `$user` for most business scopes
  - Example: `{{$user.id}}`
  - Example: `{{$user.site.id}}`
  - Example: `{{$user.company.id}}`
- Do not document or recommend deprecated variable names in new ACL guidance. Use the current frontend-exposed names.

Built-in scopes:

- `all`
  - Means no row restriction
  - Use it only when full-row visibility or mutation is the intended business rule
- `own`
  - Means own-record semantics based on `createdById`
  - Use it only when the collection really uses creator ownership as the business boundary

Important boundary:

- `own` does not mean owner, assignee, approver, manager, or department member.
- For those business semantics, create a custom scope and reference `$user` against the real business relation path.

Association mutation guidance:

- Treat association endpoints such as `add`, `set`, `remove`, and `toggle` as source-resource update operations with extra ACL checks.
- To allow those operations safely, the role must effectively have update permission on the source resource.
- If the ACL params use a whitelist, the association field itself must be included.
- If the ACL params use a scope filter, the source record must satisfy that scope.
- Do not assume having update permission on a target collection is enough to mutate an association from the source side.

## Recommended MCP Workflow

1. Inspect role mode and current role context.
2. Inspect or create the role.
3. Configure system snippets if needed.
4. Configure route permissions if needed.
5. Inspect available actions.
6. Draft the full permission matrix for the target role.
7. Read or set global table strategy for the data source.
8. List role collections and identify exceptions.
9. Add or reuse scopes.
10. Add collection-level independent permissions only where needed.
11. Add field restrictions where the business boundary requires them.
12. Re-read the resulting config.
13. For scoped actions, verify both `scopeId` on the action and the scope record itself.
14. If possible, verify against a real record path that should be allowed and one that should be denied.

## CRM Example

Use a narrow resource model instead of broad global grants.

Example collections:

- `accounts`
- `contacts`
- `opportunities`
- `activities`
- `cases`

Example roles:

- `sales_rep`
- `sales_manager`
- `support_agent`

Recommended order for this CRM:

1. Create the role with conservative metadata.
2. Configure only the system snippets actually needed.
3. Configure desktop/mobile routes if the role should see CRM pages.
4. Create reusable scopes before binding resource actions.
5. Keep global table strategy minimal or empty unless the same rule truly applies to most collections.
6. Configure collection-level independent permissions for CRM tables that differ by role.
7. Re-read role collections to confirm which tables are using `strategy` and which are using `resourceAction`.

Example scopes:

- opportunity owner: `ownerId = {{$user.id}}`
- activity assignee: `assigneeId = {{$user.id}}`
- case assignee: `assigneeId = {{$user.id}}`

Example resource layout:

- `sales_rep`
  - `accounts`: `view`
  - `contacts`: `view`
  - `opportunities`: `view`, `create`, `update` with owner scope
  - `activities`: `view`, `create`, `update` with assignee scope
  - `cases`: no access by default
- `sales_manager`
  - `accounts`: `view`, `export`
  - `contacts`: `view`, `export`
  - `opportunities`: `view`, `create`, `update`, `export`
  - `activities`: `view`, `create`, `update`
  - `cases`: `view`
- `support_agent`
  - `accounts`: `view`
  - `contacts`: `view`
  - `cases`: `view`, `create`, `update` with assignee scope
  - `activities`: `view`, `create`, `update` with assignee scope
  - `opportunities`: no access by default

Field guidance for this CRM:

- Do not expose financial fields such as `amount` to support roles unless the business explicitly wants it.
- For view and export actions, include relation labels only if the action supports field configuration and the UI actually needs them.
- When create and update actions carry association values, make sure the association fields are not accidentally excluded from the allowed field list.

## Verification API Pattern

Use the real API shape when auditing results:

1. `dataSources:list`
2. `dataSources/{dataSourceKey}/roles:get`
3. `roles/{roleName}/dataSourcesCollections:list`
4. `roles/{roleName}/dataSourceResources:get`
5. `rolesResourcesScopes:get` or `dataSources/{dataSourceKey}/rolesResourcesScopes:get`

For scoped actions, do not rely only on appended `actions.scope` payloads. Prefer:

- read the resource action and record its `scopeId`
- read the target scope record separately by id
