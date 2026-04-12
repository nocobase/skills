# Tool Shapes

This file summarizes the minimal request shapes most often needed by this skill.

## 0. Global Envelope Rule

- `flow_surfaces_get` is the common exception in this skill: it uses top-level locator fields directly.
- Most other `flow_surfaces_*` tools used here expect the business payload under `requestBody`.
- Unless a section explicitly says **Inner payload only**, prefer copying the **Tool-call envelope** examples, not the inner object by itself.
- For `executeDsl`, always start from the tool-call envelope in this file. Do **not** start from example JSON in `ui-dsl.md`.
- Never stringify `requestBody`.
- Never add an outer `{ values: ... }` wrapper.
- Never invent the literal `"root"` as `target.uid` / `locator.uid`; use a real uid from live readback.
- For `executeDsl`, `requestBody` is the page DSL object itself; do not wrap it again and do not flatten it to top-level fields.
- Public executeDsl blocks do **not** support generic `form`; use `editForm` or `createForm`.
- For custom `edit` popups with `popup.blocks`, include exactly one `editForm` block.
- For normal single-page requests, keep exactly one real tab in the DSL; do not send empty / placeholder tabs.
- Do not add placeholder `Summary` / `Later` / `备用` tabs or explanatory `markdown` / note / banner blocks unless the user explicitly asked for them.
- Default DSL `fields[]` entries to simple strings. Only use a field object when `popup`, `target`, `renderer`, or field-specific `type` is required.
- `layout` belongs only on `tabs[]` or inline `popup`, and when present it must be an object. If you are unsure, omit it.

Safe mental model:

1. author the inner business object
2. keep it as an object in memory
3. call MCP with `{ "requestBody": <that same object> }`
4. never transform it with `JSON.stringify(...)`

Common wrong shapes:

```json
{
  "requestBody": "{\"version\":\"1\",\"mode\":\"create\"}"
}
```

```json
{
  "target": { "uid": "table-block-uid" },
  "changes": { "pageSize": 20 }
}
```

The second example is wrong because `configure` expects:

```json
{
  "requestBody": {
    "target": { "uid": "table-block-uid" },
    "changes": { "pageSize": 20 }
  }
}
```

## 1. Inspect Reads

### `get`

Use `get` for normal structural inspection and post-write readback.

```json
{ "pageSchemaUid": "employees-page-schema" }
```

### `describeSurface`

Use `describeSurface` only when its richer public tree helps analyze an existing surface.

Tool-call envelope:

```json
{
  "requestBody": {
    "locator": {
      "pageSchemaUid": "employees-page-schema"
    }
  }
}
```

### `catalog`

Use `catalog` when current-target capability is the question.

Tool-call envelope:

```json
{
  "requestBody": {
    "target": { "uid": "table-block-uid" },
    "sections": ["fields"]
  }
}
```

Wrong:

```json
{
  "requestBody": {
    "target": { "uid": "root" },
    "sections": ["fields"]
  }
}
```

If you do not yet have a real target uid, read structure first; do not guess `"root"`.

## 2. `executeDsl` Create

Tool-call envelope:

```json
{
  "requestBody": {
    "version": "1",
    "mode": "create",
    "navigation": {
      "group": { "routeId": 12 },
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
}
```

Inner DSL only — **NEVER send this block alone to MCP**:

```json
{
  "version": "1",
  "mode": "create",
  "navigation": {
    "group": { "routeId": 12 },
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

When the target group is not already known, `navigation.group.title` is also valid; executeDsl will reuse a unique same-title group or create a new one when no match exists. Same-title reuse is title-only. `navigation.group.routeId` is exact targeting only and must not be mixed with `icon`, `tooltip`, or `hideInMenu`; if an existing group's metadata must change, use low-level `updateMenu` instead.

When the requirement is "click the shown record / relation record to open details", prefer a field popup rather than inventing a new action button:

```json
{
  "requestBody": {
    "version": "1",
    "mode": "create",
    "tabs": [
      {
        "title": "Overview",
        "blocks": [
          {
            "type": "table",
            "collection": "employees",
            "fields": [
              {
                "field": "department.title",
                "popup": {
                  "title": "Department details",
                  "blocks": [
                    {
                      "type": "details",
                      "resource": {
                        "binding": "currentRecord",
                        "collectionName": "departments"
                      },
                      "fields": ["title"]
                    }
                  ]
                }
              }
            ]
          }
        ]
      }
    ]
  }
}
```

Readback commonly normalizes this to clickable-field / `clickToOpen` semantics. If the requirement explicitly says "details button" or "action column", use an action / recordAction instead.

For custom edit popups, use `editForm`, not `form`:

```json
{
  "requestBody": {
    "version": "1",
    "mode": "create",
    "tabs": [
      {
        "title": "Overview",
        "blocks": [
          {
            "type": "table",
            "collection": "employees",
            "recordActions": [
              {
                "type": "edit",
                "popup": {
                  "blocks": [
                    { "key": "editForm", "type": "editForm", "fields": ["nickname"], "actions": ["submit"] }
                  ]
                }
              }
            ]
          }
        ]
      }
    ]
  }
}
```

In a custom `edit` popup, the single `editForm` may omit `resource`; executeDsl will inherit the opener's current-record context.

## 3. `executeDsl` Replace

`replace` rebuilds existing route-backed tab slots by array index. It does not use tab `key` to match old tabs.

Tool-call envelope:

```json
{
  "requestBody": {
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
}
```

Inner DSL only — **NEVER send this block alone to MCP**:

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

Tool-call envelope:

```json
{
  "requestBody": {
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
}
```

### `configure`

Tool-call envelope:

```json
{
  "requestBody": {
    "target": { "uid": "table-block-uid" },
    "changes": {
      "pageSize": 20
    }
  }
}
```

### `addTab`

Tool-call envelope:

```json
{
  "requestBody": {
    "target": { "uid": "page-uid" },
    "title": "Summary"
  }
}
```

### `moveTab`

Tool-call envelope:

```json
{
  "requestBody": {
    "sourceUid": "summary-tab-uid",
    "targetUid": "overview-tab-uid",
    "position": "before"
  }
}
```

### `removeNode`

Tool-call envelope:

```json
{
  "requestBody": {
    "target": { "uid": "banner-block-uid" }
  }
}
```

## 5. Canonical Public `executeDsl` Details

### Nested `resource` object

At block root, use `collection`. Inside nested `resource`, use `resource.collectionName`.

```json
{
  "version": "1",
  "mode": "create",
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        {
          "key": "employeesTable",
          "type": "table",
          "collection": "employees",
          "recordActions": [
            {
              "type": "view",
              "popup": {
                "blocks": [
                  {
                    "key": "employeeDetails",
                    "type": "details",
                    "resource": {
                      "binding": "currentRecord",
                      "collectionName": "employees"
                    },
                    "fields": ["nickname"]
                  }
                ],
                "layout": {
                  "rows": [["employeeDetails"]]
                }
              }
            }
          ]
        }
      ],
      "layout": {
        "rows": [[{ "key": "employeesTable", "span": 24 }]]
      }
    }
  ]
}
```

Notes:

- prefer `navigation.group.routeId` whenever an existing destination group is already known.
- `navigation.group.routeId` is exact targeting only; do not mix it with group metadata.
- `layout` is allowed on `tabs[]` and inline `popup` documents only; block objects do **not** accept `layout`.
- for popup relation tables, prefer `resource.binding = "associatedRecords"` with `resource.associationField = "<relationField>"`.
- the convenience shorthand `currentRecord | associatedRecords + associationPathName` only works for a single relation field name.
- on record-capable blocks, author `view` / `edit` / `updateRecord` / `delete` in `recordActions`.
- in `fields[]`, prefer simple string field names; only upgrade a field to an object when the extra behavior is actually needed.
- `field.target` is only a string block key.
- layout cells are only `"blockKey"` or `{ "key": "blockKey", "span": 12 }`.
- public `executeDsl` never uses `ref` / `$ref` / `uid` selectors.

Canonical popup relation-table example:

```json
{
  "type": "table",
  "resource": {
    "binding": "associatedRecords",
    "associationField": "roles",
    "collectionName": "roles"
  },
  "fields": ["title", "name"]
}
```

## 6. Common Invalid Public `executeDsl` Shapes

These are invalid for the new public `executeDsl` path:

```json
{ "dsl": { "version": "1" } }
```

```json
{ "requestBody": "{\"version\":\"1\",\"mode\":\"create\"}" }
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

```json
{ "version": "1", "mode": "create", "tabs": [{ "blocks": [{ "type": "details", "resource": { "collection": "employees" } }] }] }
```

```json
{ "version": "1", "mode": "create", "tabs": [{ "blocks": [{ "type": "details", "resource": { "resourceBinding": "currentRecord" } }] }] }
```

```json
{ "version": "1", "mode": "create", "tabs": [{ "blocks": [{ "type": "table", "collection": "employees", "recordActions": [{ "type": "view", "popup": { "$ref": "#/popup" } }] }] }] }
```

```json
{ "version": "1", "mode": "create", "navigation": { "group": { "routeId": 12, "icon": "UserOutlined" }, "item": { "title": "Employees" } }, "tabs": [{ "title": "Overview", "blocks": [{ "type": "table", "collection": "employees", "fields": ["nickname"] }] }] }
```

```json
{ "version": "1", "mode": "create", "tabs": [{ "title": "Overview", "blocks": [{ "type": "table", "resource": { "binding": "currentRecord", "associationPathName": "manager.roles", "collectionName": "roles" }, "fields": ["title"] }] }] }
```

```json
{ "version": "1", "mode": "create", "tabs": [{ "layout": { "rows": [[{ "uid": "employeesTable" }]] }, "blocks": [{ "key": "employeesTable", "type": "table", "collection": "employees" }] }] }
```

```json
{ "version": "1", "mode": "create", "tabs": [{ "blocks": [{ "key": "employeesTable", "type": "table", "collection": "employees", "layout": { "rows": [["employeesTable"]] } }] }] }
```

```json
{ "version": "1", "mode": "create", "tabs": [{ "blocks": [{ "key": "employeesTable", "type": "table", "collection": "employees", "fields": [{ "field": "nickname", "type": "filter", "target": { "key": "employeesTable" } }] }] }] }
```

```json
{ "version": "1", "mode": "create", "tabs": [{ "title": "Overview", "blocks": [{ "type": "table", "collection": "employees" }] }, { "title": "Later", "blocks": [] }] }
```

```json
{ "version": "1", "mode": "create", "tabs": [{ "title": "Overview", "blocks": [{ "type": "table", "collection": "employees" }, { "type": "markdown", "title": "Later notes" }] }] }
```

```json
{ "version": "1", "mode": "create", "tabs": [{ "blocks": [{ "type": "table", "collection": "employees", "fields": [{ "field": "nickname", "name": "Nickname" }] }] }] }
```
