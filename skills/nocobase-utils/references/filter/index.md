---
title: Filter Condition Format
description: Authoritative reference for NocoBase filter condition structure, operators, field path syntax, and variable usage. Applies to block query conditions, data scopes, ACL scopes, workflow query/update/delete nodes, collection event conditions, and anywhere else filters are configured.
---

# Filter Condition Format

NocoBase uses a unified filter condition format across all features: block query conditions, data scope settings, ACL permission scopes, workflow node conditions (Query, Update, Delete, Collection Event trigger), and more.

## Critical Rules

- **Top-level MUST be a logical wrapper** — every filter object must have `$and` or `$or` as its only root key. Never put field conditions directly at the root.
- **Never invent operator names.** Only use operators from the tables below.
- **Operator names are exact strings** with `$` prefix (e.g., `$eq`, `$includes`). Case-sensitive.

## Top-level Structure

```json
{ "$and": [ <condition>, <condition>, ... ] }
{ "$or":  [ <condition>, <condition>, ... ] }
```

Even a single condition must be wrapped:

```json
// ❌ Wrong — field at root level
{ "status": { "$eq": "active" } }

// ✅ Correct — always wrapped
{ "$and": [ { "status": { "$eq": "active" } } ] }
```

`$and` and `$or` can be nested inside each other for complex logic:

```json
{
  "$and": [
    { "status": { "$eq": "active" } },
    {
      "$or": [
        { "type": { "$eq": "vip" } },
        { "score": { "$gte": 100 } }
      ]
    }
  ]
}
```

## Condition Structure

Each condition entry is an object with one or more field conditions:

```
{ "<fieldPath>": { "<operator>": <value> } }
```

### Direct Fields

```json
{ "status": { "$eq": "active" } }
{ "amount": { "$gte": 100 } }
{ "tags": { "$empty": true } }
```

### Relation Fields (dot-path)

Use the relation name, then nest the target field:

```json
{ "createdBy": { "id": { "$eq": "{{$user.id}}" } } }
{ "department": { "id": { "$eq": "{{$user.department.id}}" } } }
{ "order": { "status": { "$eq": "paid" } } }
```

> For relation fields, access nested fields by nesting the field name under the relation name — do **not** use dot notation like `"createdBy.id"` as the key.

---

## Operators Reference

### General Comparison

| Operator | Applies to | Description | Example value |
|---|---|---|---|
| `$eq` | any scalar | Equal. If value is an array, behaves as `$in`. | `"active"`, `1`, `null` |
| `$ne` | any scalar | Not equal. If value is an array, behaves as `$notIn`. Null-safe (also matches null). | `"draft"` |
| `$gt` | number, date | Greater than | `100` |
| `$gte` | number, date | Greater than or equal | `100` |
| `$lt` | number, date | Less than | `100` |
| `$lte` | number, date | Less than or equal | `100` |
| `$in` | any scalar | Value is in the given array | `["a", "b"]` |
| `$notIn` | any scalar | Value is not in the array. Null-safe (also matches null). | `["x", "y"]` |

### Null / Empty

| Operator | Applies to | Description |
|---|---|---|
| `$empty` | string, array, any | Is empty (null, `""`, or empty array depending on field type) |
| `$notEmpty` | string, array, any | Is not empty |
| `$exists` | relation | Relation record exists (not null) |
| `$notExists` | relation | Relation record does not exist (null) |

### String

| Operator | Applies to | Description | Example value |
|---|---|---|---|
| `$includes` | string | Contains substring (case-insensitive on PG) | `"keyword"` |
| `$notIncludes` | string | Does not contain substring | `"keyword"` |
| `$startsWith` | string | Starts with prefix (case-insensitive on PG) | `"prefix"` |
| `$notStartsWith` | string | Does not start with prefix | `"prefix"` |
| `$endWith` | string | Ends with suffix (case-insensitive on PG) | `"suffix"` |
| `$notEndWith` | string | Does not end with suffix | `"suffix"` |

> All string operators also accept an array of values — any match (OR logic) for `$includes`/`$startsWith`/`$endWith`, all-must-not-match (AND logic) for their negations.

### Array / Multi-select Fields

| Operator | Applies to | Description | Example value |
|---|---|---|---|
| `$match` | array | Array exactly matches the given set (all elements, no extras) | `["a", "b"]` |
| `$notMatch` | array | Array does not exactly match | `["a", "b"]` |
| `$anyOf` | array | Array contains at least one of the given values | `["a", "b"]` |
| `$noneOf` | array | Array contains none of the given values. Null-safe. | `["a", "b"]` |
| `$arrayEmpty` | array | Array is empty or null | *(no value needed)* |
| `$arrayNotEmpty` | array | Array is not empty | *(no value needed)* |

### Boolean Fields

| Operator | Applies to | Description | Example value |
|---|---|---|---|
| `$isTruly` | boolean | Is truthy (`true`). Pass `true` to test for true; pass `false` to invert. | `true` |
| `$isFalsy` | boolean | Is falsy (`false` or null). Pass `true` to test for falsy; pass `false` to invert. | `true` |

### Date Fields

Date operators accept either an ISO date string or a named shortcut string (e.g., `"today"`, `"thisWeek"`, `"lastMonth"`).

| Operator | Description |
|---|---|
| `$dateOn` | Date falls on the given date/period |
| `$dateNotOn` | Date does not fall on the given date/period |
| `$dateBefore` | Date is before the given date/period |
| `$dateNotBefore` | Date is not before (≥) the given date/period |
| `$dateAfter` | Date is after the given date/period |
| `$dateNotAfter` | Date is not after (≤) the given date/period |
| `$dateBetween` | Date falls within the given range (array of two date values) |

---

## Variable Values

Condition values can be dynamic variables using `{{path}}` double-brace syntax (powered by [json-templates](https://github.com/nicktindall/json-templates)). The variable is resolved at runtime before the filter is applied.

```json
{ "$and": [ { "createdBy": { "id": { "$eq": "{{$user.id}}" } } } ] }
{ "$and": [ { "department": { "id": { "$eq": "{{$user.department.id}}" } } } ] }
```

Available variable paths depend on the context:

| Context | Common variables |
|---|---|
| ACL scope | `{{$user.id}}`, `{{$user.<field>}}`, `{{$user.<relation>.<field>}}`, `{{$nRole}}` |
| Workflow node condition | `{{$context.data.<field>}}`, `{{$jobsMapByNodeKey.<key>.<field>}}` |
| Block / UI linkage | Depends on the block's data context |

---

## Complete Examples

### Single condition (direct field)
```json
{ "$and": [ { "status": { "$eq": "published" } } ] }
```

### Single condition (relation field)
```json
{ "$and": [ { "createdBy": { "id": { "$eq": "{{$user.id}}" } } } ] }
```

### Multiple conditions with AND
```json
{
  "$and": [
    { "status": { "$eq": "active" } },
    { "department": { "id": { "$eq": "{{$user.department.id}}" } } }
  ]
}
```

### Multiple conditions with OR
```json
{
  "$or": [
    { "status": { "$eq": "published" } },
    { "createdBy": { "id": { "$eq": "{{$user.id}}" } } }
  ]
}
```

### Nested AND + OR
```json
{
  "$and": [
    { "type": { "$in": ["article", "news"] } },
    {
      "$or": [
        { "status": { "$eq": "published" } },
        { "createdBy": { "id": { "$eq": "{{$user.id}}" } } }
      ]
    }
  ]
}
```

### Date range
```json
{ "$and": [ { "createdAt": { "$dateBetween": ["2024-01-01", "2024-12-31"] } } ] }
```

### Array field
```json
{ "$and": [ { "tags": { "$anyOf": ["urgent", "important"] } } ] }
```

### Boolean field
```json
{ "$and": [ { "isActive": { "$isTruly": true } } ] }
```

### Null / existence check
```json
{ "$and": [ { "assignee": { "$exists": true } } ] }
{ "$and": [ { "description": { "$notEmpty": true } } ] }
```
