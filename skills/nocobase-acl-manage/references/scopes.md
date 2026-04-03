# Scopes

Use scopes for:

- own-record access
- site/company/department boundaries
- business-unit filters
- published/active/approved subsets

General rule:

- Decide scope explicitly for every important action.
- If there is no scope, confirm that full-row visibility or mutation is intended.

## Scope Format

A scope's `scope` field uses the same filter condition format as all other NocoBase filter configurations.

**Full format reference**: [nocobase-utils / Filter Condition Format](../../../../nocobase-utils/references/filter/index.md)

Key rules (summary):
- **Always wrap conditions with `$and` or `$or`** — never place field conditions at the root level.
- Use `$and` for single or AND-combined conditions; `$or` for OR-combined conditions.
- Values can be dynamic variables with `{{path}}` syntax. In ACL scopes, the available variables are `$user` (current user) and `$nRole` (current role).

```json
// ✅ Single condition
{ "$and": [ { "createdBy": { "id": { "$eq": "{{$user.id}}" } } } ] }

// ✅ Multiple AND conditions
{
  "$and": [
    { "status": { "$eq": "published" } },
    { "department": { "id": { "$eq": "{{$user.department.id}}" } } }
  ]
}

// ✅ OR conditions
{
  "$or": [
    { "status": { "$eq": "published" } },
    { "createdBy": { "id": { "$eq": "{{$user.id}}" } } }
  ]
}
```

## CRITICAL: Always Check Built-in Scopes First

**Before creating any custom scope, ALWAYS list existing scopes first:**

```
GET /api/dataSources/{dataSourceKey}/roles.resourcesScopes:list
```

NocoBase provides built-in scopes that cover common use cases:

- **`all`** (ID varies by installation)
  - Means no row restriction
  - Use when the action should access all records

- **`own`** (ID varies by installation)
  - Means own-record semantics based on `createdById`
  - Use when the action should only access records created by the current user
  - **This is the correct choice for "only own records" requirements**

**DO NOT create custom scopes for common patterns that built-in scopes already cover.**

Example of checking scopes:
```json
// Response from scopes:list
{
  "data": [
    {
      "id": 355828166098945,
      "key": "all",
      "name": "{{t(\"All records\")}}",
      "scope": {}
    },
    {
      "id": 355828166098946,
      "key": "own",
      "name": "{{t(\"Own records\")}}",
      "scope": {"createdById": "{{ ctx.state.currentUser.id }}"}
    }
  ]
}
```

Use the `id` from the built-in scope when configuring actions:
```json
{
  "name": "update",
  "scopeId": 355828166098946,
  "fields": ["quantity", "notes"]
}
```

## Custom Scope Creation Rules

**Only create custom scopes when built-in scopes cannot satisfy the requirement.**

Examples of when custom scopes are needed:
- Department-level access
- Manager approval
- Site-specific data
- Published content only
- Custom ownership fields (not `createdBy`)

### API Rules

- Business scopes should be created under the target data source.
- Do not create business scopes in global `rolesResourcesScopes`.
- When creating a scope, pass business fields such as `name`, `resourceName`, and `scope`.
- Do not pass `id` when creating a scope.
- When binding an existing scope to an action, pass `scopeId`.
- Do not bind a scope by passing nested `scope.id` or a full `scope` object in place of `scopeId`.

### Scope Variables

In ACL scopes, the frontend variable selector primarily exposes:

- `$user` — current user, backed by the `users` collection. Default depth is 3, so nested paths like `{{$user.department.manager.id}}` are selectable when those relations exist.
- `$nRole` — current role, bound to the `roles` collection. Intended mainly for the current role value itself.

Recommended usage:
- Use `$user` for most business scopes: `{{$user.id}}`, `{{$user.site.id}}`, `{{$user.company.id}}`

### Boundary Notes

- `own` does not mean owner, assignee, approver, manager, or department member.
- For those business semantics, create a custom scope and reference `$user` against the real business relation path.
