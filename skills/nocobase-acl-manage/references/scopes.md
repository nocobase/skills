# Scopes

Use scopes for:

- own-record access
- site/company/department boundaries
- business-unit filters
- published/active/approved subsets

General rule:

- Decide scope explicitly for every important action.
- If there is no scope, confirm that full-row visibility or mutation is intended.

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
  "scopeId": 355828166098946,  // Use the actual ID of the built-in "own" scope
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

### Scope Structure Format

**CRITICAL: Custom scopes must use the correct NocoBase filter structure.**

For relation-based scopes (recommended):
```json
{
  "$and": [
    {
      "createdBy": {
        "id": {
          "$eq": "{{$user.id}}"
        }
      }
    }
  ]
}
```

For direct field scopes:
```json
{
  "$and": [
    {
      "departmentId": {
        "$eq": "{{$user.departmentId}}"
      }
    }
  ]
}
```

For multiple conditions:
```json
{
  "$and": [
    {
      "status": {
        "$eq": "published"
      }
    },
    {
      "department": {
        "id": {
          "$eq": "{{$user.departmentId}}"
        }
      }
    }
  ]
}
```

**Key points:**
- Always wrap conditions in `$and` array (even for single conditions)
- For relation fields, use the relation name (e.g., `createdBy`, `department`) and access nested fields (e.g., `id`)
- For direct fields, use the field name directly (e.g., `departmentId`, `status`)
- Use NocoBase filter operators: `$eq`, `$ne`, `$in`, `$notIn`, `$gt`, `$gte`, `$lt`, `$lte`, etc.

### Custom Scope Creation Rules

- Business scopes should be created under the target data source.
- Do not create business scopes in global `rolesResourcesScopes`.
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
