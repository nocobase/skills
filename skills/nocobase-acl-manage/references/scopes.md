# Scopes

Use scopes for:

- own-record access
- site/company/department boundaries
- business-unit filters
- published/active/approved subsets

General rule:

- Decide scope explicitly for every important action.
- If there is no scope, confirm that full-row visibility or mutation is intended.

Scope creation rules:

- Business scopes should be created under the target data source.
- Do not create business scopes in global `rolesResourcesScopes`.
- Built-in scopes such as `all` and `own` are system-provided defaults. Treat them as immutable.
- When creating a scope, pass business fields such as `name`, `resourceName`, and `scope`.
- Do not pass `id` when creating a scope.
- When binding an existing scope to an action, pass `scopeId`.
- Do not bind a scope by passing nested `scope.id` or a full `scope` object in place of `scopeId`.

Scope variables and built-in scopes:

- In the ACL scope editor, the frontend variable selector primarily exposes:
  - `$user`
    - Current user
    - Backed by the `users` collection
    - Default depth is 3, so nested paths such as `{{$user.department.manager.id}}` may be selectable when those relations exist on `users`
  - `$nRole`
    - Current role
    - Bound to the `roles` collection
    - Intended mainly for the current role value itself
- Recommended variable usage:
  - use `$user` for most business scopes
  - example: `{{$user.id}}`
  - example: `{{$user.site.id}}`
  - example: `{{$user.company.id}}`

Built-in scopes:

- `all`
  - Means no row restriction
- `own`
  - Means own-record semantics based on `createdById`

Important boundary:

- `own` does not mean owner, assignee, approver, manager, or department member.
- For those business semantics, create a custom scope and reference `$user` against the real business relation path.
