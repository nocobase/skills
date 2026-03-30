---
title: "Common Conventions"
description: "Description of common conventions for workflow configuration, including configuration item formats, naming standards, etc."
---

# Common Conventions

## The `collection` Field in Trigger and Node Configuration

Some trigger and node configuration items use the `collection` field to represent a data table associated with the trigger or node. This field must use the following (colon-separated) format: `dataSourceName:collectionName`. The `dataSourceName` should be omitted if and only if the data source is `main` (the default primary data source).

## The `filter` Field in Trigger and Node Configuration

Some triggers and nodes use a `filter` (or `condition`) field to specify filtering conditions. This field is a JSON object that follows the **data table filter DSL** format described below.

### Basic Structure

**The root node of a filter object must be a condition group: `{ "$and": [...] }` or `{ "$or": [...] }`.** All conditions must be placed inside the top-level condition group array. Do not place conditions directly at the root level.

Each element in the condition group array is either:
- A **single condition**: `{ "fieldName": { "$operator": value } }`
- A **nested condition group**: `{ "$and": [...] }` or `{ "$or": [...] }`

The `value` in a condition can be a constant or a variable expression (e.g., `"{{ $context.data.id }}"`).

For association fields, use dot notation to reference nested fields, e.g., `"category.name"`.

### Available Operators

#### General (all field types)
| Operator | Description |
| --- | --- |
| `$eq` | Equal |
| `$ne` | Not equal |
| `$in` | In (value is an array) |
| `$notIn` | Not in (value is an array) |
| `$empty` | Is empty |
| `$notEmpty` | Is not empty |

#### String fields
| Operator | Description |
| --- | --- |
| `$includes` | Contains substring |
| `$notIncludes` | Does not contain substring |
| `$startsWith` | Starts with |
| `$notStartsWith` | Does not start with |
| `$endWith` | Ends with |
| `$notEndWith` | Does not end with |

#### Date fields
| Operator | Description |
| --- | --- |
| `$dateOn` | On the specified date |
| `$dateNotOn` | Not on the specified date |
| `$dateBefore` | Before the specified date |
| `$dateNotBefore` | Not before the specified date |
| `$dateAfter` | After the specified date |
| `$dateNotAfter` | Not after the specified date |
| `$dateBetween` | Between two dates (value is `[start, end]`) |

#### Array fields
| Operator | Description |
| --- | --- |
| `$match` | Matches all elements |
| `$notMatch` | Does not match all elements |
| `$anyOf` | Matches any element |
| `$noneOf` | Matches none of the elements |
| `$arrayEmpty` | Array is empty |
| `$arrayNotEmpty` | Array is not empty |

#### Boolean fields
| Operator | Description |
| --- | --- |
| `$isTruly` | Is truthy |
| `$isFalsy` | Is falsy |

#### Association fields
| Operator | Description |
| --- | --- |
| `$exists` | Association exists |
| `$notExists` | Association does not exist |

### Examples

#### Simple filter with one condition

```json
{
  "$and": [
    { "status": { "$eq": "published" } }
  ]
}
```

#### Multiple conditions with AND logic

```json
{
  "$and": [
    { "status": { "$eq": "active" } },
    { "createdAt": { "$dateBefore": "2025-01-01" } }
  ]
}
```

#### Nested AND/OR logic

```json
{
  "$and": [
    { "status": { "$ne": "archived" } },
    {
      "$or": [
        { "title": { "$includes": "Nocobase" } },
        { "category.name": { "$eq": "Tech" } }
      ]
    }
  ]
}
```

#### Using variable expressions

```json
{
  "$and": [
    { "id": { "$eq": "{{$context.data.id}}" } }
  ]
}
```

## The `appends` Field in Trigger and Node Configuration

Many triggers and nodes accept an `appends` field to preload associated (relationship) fields. Without `appends`, only the scalar fields of the record are available — association data will be `null` or missing.

### Format

`appends` is an array of strings. Each element is a **dot-separated path** representing the association field(s) to preload:

```json
{
  "appends": ["category", "author", "author.profile", "author.books", "comments"]
}
```

- `"category"` — preloads the `category` association (one level).
- `"author"` — preloads the `author` association.
- `"author.profile"` — preloads the nested `profile` association through `author` (multi-level).
- `"author.books"` — preloads the nested `books` association through `author` (multi-level).
- `"comments"` — preloads the `comments` association (one level).

### Rules

0. Use this field to specify which associations to preload for use in variable expressions. With it, sometimes you can avoid extra query nodes just to fetch related data.
1. Each path element must match an association field name defined in the collection.
2. Multi-level associations use dot notation: `"parent.child.grandchild"`.
3. Only preloaded associations are accessible in variable expressions. For example, `{{$context.data.author.name}}` requires `"author"` in `appends`.
4. An empty array `[]` (the default) means no associations are preloaded.
5. In triggers that support `appends`, preloading only applies to certain events — check each trigger's documentation for specifics (e.g., collection event trigger does not load `appends` for delete events).
6. Mostly, do not preload to-many associations more than one level deep (e.g., `"posts.comments"`), as it may lead to large data loads and performance issues.

### Example

A query node preloading `author` and the author's nested `department`:

```json
{
  "collection": "posts",
  "multiple": false,
  "params": {
    "filter": {
      "$and": [
        { "id": { "$eq": "{{$context.data.id}}" } }
      ]
    },
    "appends": ["author", "author.department"]
  }
}
```

After execution, the node result will include `author` with its `department` data, accessible as `{{$jobsMapByNodeKey.<nodeKey>.author.department.name}}`.

## Variable Expressions

Variable expressions are used throughout workflow configurations — in node `config` fields (such as `params.values`, `expression`, `message`, etc.) and in filter conditions. They allow nodes to reference dynamic data from the trigger, upstream nodes, system, and environment.

### Syntax

Variable expressions use the `{{<path>}}` template syntax (double curly braces, **no spaces** inside the braces). The `<path>` is a dot-separated property path starting with a variable group prefix.

**Correct**: `"{{$context.data.title}}"`, `"{{$jobsMapByNodeKey.abc123.name}}"`

**Wrong**: `"{{ $context.data.title }}"` (spaces inside braces are tolerated but discouraged), `"{{$node_123456}}"` (invalid prefix), `"{{$jobsMapByNodeId.123}}"` (deprecated, do not use)

### Variable Groups

| Group | Prefix | Description | Available In |
| --- | --- | --- | --- |
| Trigger context | `$context` | Data produced by the trigger event. Structure varies by trigger type — see each trigger's documentation. | All nodes |
| Node results | `$jobsMapByNodeKey` | Output of a completed upstream node, indexed by the node's `key` property (a short random string like `abc123`, **not** the numeric `id`). | Nodes downstream of the referenced node |
| Scope variables | `$scopes` | Variables provided by ancestor branch/loop nodes (e.g., loop item). Indexed by the ancestor node's `key`. | Nodes inside the scope (e.g., inside a loop body) |
| System variables | `$system` | Built-in system values and functions. | All nodes |
| Environment variables | `$env` | Application environment variables configured in NocoBase. | All nodes |

### Trigger Context (`$context`)

The structure depends on the trigger type. Common patterns:

| Trigger Type | Available Variables |
| --- | --- |
| Collection event | `$context.data` (the triggered record) |
| Action / Custom action | `$context.data`, `$context.user`, `$context.roleName` |
| Schedule | `$context.date`; `$context.data` (only in data table time field mode) |
| Webhook | `$context.headers`, `$context.query`, `$context.body` |
| Request interception | `$context.params.filterByTk`, `$context.params.filter`, `$context.params.values`, `$context.user`, `$context.roleName` |
| Approval | `$context.data`, `$context.approvalId`, `$context.applicant`, `$context.applicantRoleName` |

See each trigger's reference documentation for full details.

### Node Results (`$jobsMapByNodeKey`)

Reference an upstream node's output by its `key` (not `id`). Every node has a `key` property — a short random string (e.g., `6qww6wh1wb8`) assigned at creation. You can find it by reading the node via `flow_nodes:get`.

**Format**: `{{$jobsMapByNodeKey.<nodeKey>.<propertyPath>}}`

**Examples**:
```
{{$jobsMapByNodeKey.6qww6wh1wb8}}          — the full result of the node
{{$jobsMapByNodeKey.6qww6wh1wb8.id}}       — the id field of the result
{{$jobsMapByNodeKey.6qww6wh1wb8.data.name}} — nested property access
```

**Common mistakes to avoid**:
- Do NOT use the node's numeric `id` — use the string `key` instead.
- Do NOT invent a key — always read the actual `key` from the node record after creating it.
- Do NOT reference a node that is not upstream of the current node.

### Scope Variables (`$scopes`)

Available only inside nodes that are children of a branch/loop node. The ancestor node must implement scope variable support (e.g., loop nodes provide `item` and `index`).

**Format**: `{{$scopes.<ancestorNodeKey>.<variableName>}}`

**Example** (inside a loop node with key `abc123`):
```
{{$scopes.abc123.item}}    — the current loop iteration item
{{$scopes.abc123.index}}   — the current loop iteration index
```

### System Variables (`$system`)

| Variable | Description |
| --- | --- |
| `$system.now` | Current date/time |
| `$system.instanceId` | Server instance ID |
| `$system.genSnowflakeId` | Generate a unique Snowflake ID |
| `$system.dateRange.yesterday` | Yesterday's date range |
| `$system.dateRange.today` | Today's date range |
| `$system.dateRange.tomorrow` | Tomorrow's date range |
| `$system.dateRange.thisWeek` | This week's date range |
| `$system.dateRange.lastMonth` | Last month's date range |
| `$system.dateRange.thisMonth` | This month's date range |
| `$system.dateRange.thisYear` | This year's date range |

### Environment Variables (`$env`)

Application-level environment variables configured in NocoBase settings.

**Format**: `{{$env.VARIABLE_NAME}}`

### Usage Examples

#### Assigning field values in an update node

```json
{
  "params": {
    "values": {
      "status": "published",
      "updatedAt": "{{$system.now}}",
      "reviewerId": "{{$context.user.id}}",
      "totalPrice": "{{$jobsMapByNodeKey.6qww6wh1wb8.result}}"
    }
  }
}
```

#### Using variables in filter conditions

```json
{
  "$and": [
    { "id": { "$eq": "{{$context.data.id}}" } },
    { "category": { "$eq": "{{$jobsMapByNodeKey.abc123.category}}" } }
  ]
}
```

#### Referencing loop scope inside a loop body

```json
{
  "params": {
    "filter": {
      "$and": [
        { "id": { "$eq": "{{$scopes.loop1key.item.id}}" } }
      ]
    },
    "values": {
      "processed": true,
      "batchIndex": "{{$scopes.loop1key.index}}"
    }
  }
}
