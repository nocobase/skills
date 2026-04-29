---
title: "Common Conventions"
description: "Description of common conventions for workflow configuration, including configuration item formats, naming standards, etc."
---

# Common Conventions

## The `collection` Field in Trigger and Node Configuration

Some trigger and node configuration items use the `collection` field to represent a data table associated with the trigger or node. This field must use the following (colon-separated) format: `dataSourceName:collectionName`. The `dataSourceName` should be omitted if and only if the data source is `main` (the default primary data source).

## The `filter` Field in Trigger and Node Configuration

Some triggers and nodes use a `filter` (or `condition`) field to specify filtering conditions. This field is a JSON object that follows the NocoBase filter condition format.

**Full reference**: [nocobase-utils / Filter Condition Format](../../../nocobase-utils/references/filter/index.md)

Key points for workflow context:
- Root must be `{ "$and": [...] }` or `{ "$or": [...] }` — never place field conditions directly at the root.
- Values can be constants or workflow variable expressions (e.g., `"{{$context.data.id}}"`). See [Variable Expressions](#variable-expressions) below for available variable paths.
- Variables are NOT supported in trigger configuration items. In trigger configuration, only static values are allowed.
- Both dot-string notation (`"category.name"`) and nested object notation (`{ "category": { "name": {...} } }`) are valid for association fields.

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

## Variable Data Shape and Path Rules

Workflow variables are internally JSON values. In the variable picker UI they are usually exposed as a tree of `{ label, value, children? }`, but the actual runtime expression always uses the `value` path, not `label`.

### Core Rules

1. Most variables are JSON objects or arrays, and you usually reference only the needed sub-path.
2. Object properties are accessed with dot notation, such as `{{$context.data.title}}` or `{{$jobsMapByNodeKey.query1.author.department.name}}`.
3. A selected association field may itself be an object, and nested relations continue to form deeper object paths.
4. Some variables are scalar values directly, such as `{{$context.date}}` or `{{$jobsMapByNodeKey.calc_total}}`.
5. When a path segment is an array, selecting a child field under that array produces a mapped array of that child field's values.

### Arrays

Array behavior is the most common source of mistakes when writing workflow expressions.

- If the variable itself is an array, use the whole array only in nodes that accept arrays, such as `loop`, or in engines/functions that can process arrays.
- If you continue selecting a child field under an array item, the result becomes an array of that field from every item.
- If the source is a nested array structure, the mapped result is flattened into a one-dimensional array.
- The variable picker may still show the child fields of an array item, but that does not mean every downstream node can consume the mapped array result directly.

### Array Mapping Example

Suppose an upstream query node returns multiple records:

```json
[
  {
    "id": 1,
    "title": "Title 1",
    "tags": [
      { "name": "A" },
      { "name": "B" }
    ]
  },
  {
    "id": 2,
    "title": "Title 2",
    "tags": [
      { "name": "C" }
    ]
  }
]
```

Then the following expressions behave differently:

- `{{$jobsMapByNodeKey.query_posts}}`
  - The whole result array.
- `{{$jobsMapByNodeKey.query_posts.title}}`
  - Mapped field array: `["Title 1", "Title 2"]`.
- `{{$jobsMapByNodeKey.query_posts.tags}}`
  - Array of tag arrays.
- `{{$jobsMapByNodeKey.query_posts.tags.name}}`
  - Flattened mapped array: `["A", "B", "C"]`.

### Practical Guidance for Arrays

- Use the whole array when passing data into a `loop` node, for example `{{$jobsMapByNodeKey.query_posts}}`.
- Use a mapped child-field array only when the downstream node or expression engine explicitly supports arrays.
- Do not assume a mapped array can be written directly into any scalar field assignment.
- If you need a precise array/object shape for downstream use, add a `json-query` or `json-variable-mapping` node first.

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

The upstream means all the ancestor nodes search up the workflow graph by `upstreamId` recursively until null. Any other node ou of this path is not accessible.

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

Only use `dateRange` variables in filter conditions for date fields when needed, since they will be calculated by the system when the workflow executes.

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
      "totalPrice": "{{$jobsMapByNodeKey.6qww6wh1wb8}}"
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
