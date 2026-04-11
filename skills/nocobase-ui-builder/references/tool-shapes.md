# Tool Shapes

This file summarizes the minimal request shapes most often needed by this skill.

## 1. Inspect Reads

### `get`

Use `get` for normal structural inspection and post-write readback.

```json
{ "pageSchemaUid": "employees-page-schema" }
```

### `describeSurface`

Use `describeSurface` only when its richer public tree helps analyze an existing surface.

```json
{
  "locator": {
    "pageSchemaUid": "employees-page-schema"
  }
}
```

### `catalog`

Use `catalog` when current-target capability is the question.

```json
{
  "target": { "uid": "table-block-uid" },
  "sections": ["fields"]
}
```

## 2. `executeDsl` Create

```json
{
  "version": "1",
  "mode": "create",
  "navigation": {
    "group": { "title": "Workspace" },
    "item": { "title": "Employees" }
  },
  "page": {
    "title": "Employees",
    "documentTitle": "Employees workspace"
  },
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        {
          "type": "table",
          "collection": "employees",
          "fields": ["nickname"]
        }
      ]
    }
  ]
}
```

## 3. `executeDsl` Replace

`replace` rebuilds existing route-backed tab slots by array index. It does not use tab `key` to match old tabs.

```json
{
  "version": "1",
  "mode": "replace",
  "target": {
    "pageSchemaUid": "employees-page-schema"
  },
  "page": {
    "title": "Employees workspace"
  },
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        {
          "type": "table",
          "collection": "employees",
          "fields": ["nickname"]
        }
      ]
    }
  ]
}
```

## 4. Localized Edit Examples

### `compose`

```json
{
  "target": { "uid": "tab-schema-uid" },
  "mode": "append",
  "blocks": [
    {
      "key": "employeesTable",
      "type": "table",
      "resource": {
        "dataSourceKey": "main",
        "collectionName": "employees"
      },
      "fields": ["nickname"]
    }
  ]
}
```

### `configure`

```json
{
  "target": { "uid": "table-block-uid" },
  "changes": {
    "pageSize": 20
  }
}
```

### `addTab`

```json
{
  "target": { "uid": "page-uid" },
  "title": "Summary"
}
```

### `moveTab`

```json
{
  "sourceUid": "summary-tab-uid",
  "targetUid": "overview-tab-uid",
  "position": "before"
}
```

### `removeNode`

```json
{
  "target": { "uid": "banner-block-uid" }
}
```

## 5. Common Invalid Public `executeDsl` Shapes

These are invalid for the new public `executeDsl` path:

```json
{ "dsl": { "version": "1" } }
```

```json
{ "version": "1", "mode": "replace", "target": { "mode": "update-page" } }
```

```json
{ "version": "1", "mode": "create", "tabs": [{ "blocks": [{ "type": "table", "collectionName": "employees" }] }] }
```

```json
{ "version": "1", "mode": "create", "tabs": [{ "blocks": [{ "type": "table", "collection": "employees", "fields": [{ "fieldPath": "nickname" }] }] }] }
```
