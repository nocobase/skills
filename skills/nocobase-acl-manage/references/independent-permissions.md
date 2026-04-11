# Table Independent Permissions

## Table of Contents

- [MANDATORY: Field Configuration](#mandatory-field-configuration)
- [Before configuring independent permissions](#before-configuring-independent-permissions)
- [Field configuration rules](#field-configuration-rules)
- [Actions that support field configuration](#actions-that-support-field-configuration)
- [Field configuration examples](#field-configuration-examples)
- [Relation field guidance](#relation-field-guidance)
- [Realistic-role guidance](#realistic-role-guidance)
- [Common mistakes to avoid](#common-mistakes-to-avoid)

Use collection-level independent permissions when a collection needs behavior that differs from the global table strategy.

Common cases:

- only one collection should be readable
- one collection should use `view:own` while the rest use `view`
- one collection needs a custom scope filter
- one collection should expose only part of the fields

Key flag:

- `usingActionsConfig: true`

Configuration rule:

- Inspect `availableActions:list` before writing action names.
- Do not guess action names.
- **For realistic business roles, do not stop at action names alone.**

Collection targeting UX rule:

- user may provide business-facing table names (for example, `orders`, `customers`, `invoice`)
- do not force user to provide exact technical collection names
- resolve actual collection names from the selected data source collection list
- data source defaults to `main` unless user specifies another data source
- if resolution is ambiguous or empty, ask for clarification before write
- when scope is `all` or `own`, resolve built-in scope id and write explicit action scope binding
- do not keep `scopeId=null` when user selected `all` or `own`
- before write, confirm data source + resolved collections + actions + scope

## MANDATORY: Field Configuration

**When configuring independent permissions, field configuration is MANDATORY, not optional.**

### Before configuring independent permissions:

1. **Fetch collection fields first** using `collections.fields:list` or `collections:listMeta`
2. Identify which fields are:
   - Sensitive (financial, identity, approval status)
   - System fields (id, createdAt, updatedAt, createdBy, updatedBy)
   - Relation fields (associations that control data relationships)
   - Business fields (normal data fields)

### Field configuration rules:

- **Empty `fields: []` is not a full-field marker in this skill policy.**
- default behavior: when user does not provide field-level restrictions, resolve and write explicit full-field lists for each selected action
- For each action that supports field configuration (create, view, update, export), explicitly decide:
  - Which fields this role can access
  - Why these fields (document the decision)
- If you intentionally want full field access, explicitly state this decision and document why

### Actions that support field configuration:

From `availableActions:list`, these actions have `allowConfigureFields: true`:
- `create` - controls which fields can be set when creating records
- `view` - controls which fields are visible when reading records
- `update` - controls which fields can be modified when updating records
- `export` - controls which fields are included in exports
- `importXlsx` - controls which fields can be imported

### Field configuration examples:

**Example 1: Data entry role (can create/edit but not see sensitive fields)**
```json
{
  "name": "orders",
  "usingActionsConfig": true,
  "actions": [
    {
      "name": "create",
      "fields": ["productId", "quantity", "customerName", "notes"]
    },
    {
      "name": "view",
      "fields": ["id", "productId", "quantity", "customerName", "status", "createdAt"]
    },
    {
      "name": "update",
      "scopeId": 123,
      "fields": ["quantity", "notes"]
    }
  ]
}
```

**Example 2: Read-only analyst role (can view and export all fields)**
```json
{
  "name": "orders",
  "usingActionsConfig": true,
  "actions": [
    {
      "name": "view",
      "fields": ["id", "productId", "quantity", "customerName", "status", "createdAt", "updatedAt"]
    },
    {
      "name": "export",
      "fields": ["id", "productId", "quantity", "customerName", "status", "createdAt", "updatedAt"]
    }
  ]
}
```

**Example 3: Restricted viewer (can only see basic info)**
```json
{
  "name": "orders",
  "usingActionsConfig": true,
  "actions": [
    {
      "name": "view",
      "fields": ["id", "productId", "status", "createdAt"]
    }
  ]
}
```

### Relation field guidance:

- For relation fields, update permission on the field controls whether the request may change that association
- If a role must only read a relation label but must not change the association:
  - Allow the relation field on `view` and `export` actions
  - Keep it out of `create` and `update` field lists

### Realistic-role guidance:

Independent permissions should usually include:
- Action names (from `availableActions:list`)
- **Field lists for each action** (after fetching collection fields)
- Scope decision for actions that need row-level restrictions

Operational default:

- if user only provides collection + action + scope, do not block execution for missing field lists
- apply full-field access as default and state this in the result
- for `view`, default to full-field visibility unless user explicitly restricts fields
- implement full-field default as explicit field-name arrays resolved from collection metadata

**Decision documentation:**
- If fields are intentionally empty (`fields: []`), document this as a deliberate no-field permission decision and why
- If full-row access is intended, bind built-in `all` scope via non-null `scopeId` and document why

### Common mistakes to avoid:

Wrong example: configuring actions without fields
```json
{
  "name": "orders",
  "usingActionsConfig": true,
  "actions": [
    {"name": "create"},
    {"name": "view"},
    {"name": "update", "scopeId": 123}
  ]
}
```

Correct example: configuring actions with explicit field decisions
```json
{
  "name": "orders",
  "usingActionsConfig": true,
  "actions": [
    {"name": "create", "fields": ["productId", "quantity", "notes"]},
    {"name": "view", "fields": ["id", "productId", "quantity", "status"]},
    {"name": "update", "scopeId": 123, "fields": ["quantity", "notes"]}
  ]
}
```
