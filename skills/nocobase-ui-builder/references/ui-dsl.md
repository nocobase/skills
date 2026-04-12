# UI DSL

This file defines the simplified public **page-structure JSON DSL** used by `executeDsl`.

This file is for authoring the **inner page DSL document**. It is **not** the primary tool-call cookbook. For the actual MCP invocation shape, always read [tool-shapes.md](./tool-shapes.md) and start from its **Tool-call envelope** examples.

## 1. Core Rules

- The wire format is **JSON**.
- One document describes **one page**.
- `version` stays `"1"`.
- `mode` is either `"create"` or `"replace"`.
- `create` creates a new menu item + page.
- `replace` rewrites one existing page and therefore requires `target.pageSchemaUid`.
- In `replace`, omitted page-level fields are left unchanged.
- Tabs are interpreted in array order. In `replace`, DSL tabs map to existing route-backed tab slots by index.
- For a normal single-page request, default to exactly **one tab** unless the user explicitly asks for multiple route-backed tabs.
- Do not add empty / placeholder tabs to a normal single-page draft.
- Do not add placeholder `Summary` / `Later` / `备用` tabs or explanatory `markdown` / note / banner blocks unless the user explicitly asked for them.
- Side-by-side blocks, relation tables, and nested popups normally stay inside that one tab.
- Layout is optional; when omitted, the server auto-generates a simple top-to-bottom layout.
- `layout` is only allowed on `tabs[]` and inline `popup` documents; individual blocks do not accept `layout`.
- If `layout` is present, it must be an object. When you are not sure the layout is correct, omit it instead of guessing.
- Field entries default to simple strings. Upgrade to a field object only when `popup`, `target`, `renderer`, or field-specific `type` is required.
- Every field placed into any DSL `fields[]` must come from live `collections:get(appends=["fields"])` truth and have a non-empty `interface`; do not place schema-only fields with `interface: null` / empty into block or form fields.
- Public executeDsl blocks do **not** support generic `form`; use `editForm` or `createForm`.
- The DSL is structure-only; it does not expose planning or execution internals.

Important:

- This file describes the **inner page DSL document** only.
- When you call `flow_surfaces_execute_dsl`, put this document under `requestBody` as an **object**.
- Do not stringify this document into `requestBody: "{\"version\":\"1\"...}"`.
- Keep `requestBody` out of the inner DSL itself; `requestBody` exists only in the outer MCP tool-call envelope.
- If the tool returns `params/requestBody must be object` or `...must match exactly one schema in oneOf`, first fix the outer MCP call envelope; do not start by mutating the inner page DSL blindly.
- Unless a block is explicitly labeled **Tool-call envelope**, every JSON snippet below should be treated as inner DSL only.

## 2. Top-level Shape

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
    "documentTitle": "Employees workspace",
    "enableHeader": true,
    "displayTitle": true
  },
  "assets": {
    "scripts": {},
    "charts": {}
  },
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        {
          "type": "table",
          "collection": "employees"
        }
      ]
    }
  ]
}
```

### Top-level fields

- `version`: currently only `"1"`
- `mode`: `"create" | "replace"`
- `target`: required only for `replace`, shape `{ "pageSchemaUid": "..." }`
- `navigation`: only for `create`; controls menu group/item metadata
- `page`: page-level metadata
- `assets`: reusable script/chart blobs referenced by blocks/fields/actions
- `tabs`: non-empty ordered array of route-backed tabs

### `navigation.group` semantics

- Prefer `navigation.group.routeId` when the destination menu group is already known.
- `navigation.group.routeId` is exact targeting only; do not mix it with `icon`, `tooltip`, or `hideInMenu`.
- `navigation.group.title` is for new-group creation or title-only unique same-title reuse.
- When `routeId` is omitted and `title` matches:
  - zero existing groups -> create a new group
  - one existing group -> reuse that group
  - multiple existing groups -> reject and require `routeId`
- If same-title reuse hits an existing group, keep it title-only.
- If an existing group's metadata must change, do not rely on executeDsl create; use low-level `updateMenu` instead.

## 3. Create Example

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
    "documentTitle": "Employees workspace",
    "enableHeader": true,
    "displayTitle": true
  },
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        {
          "type": "table",
          "collection": "employees",
          "fields": ["nickname"],
          "recordActions": [
            {
              "type": "view",
              "title": "View",
              "popup": {
                "title": "Employee details",
                "blocks": [
                  {
                    "type": "details",
                    "resource": {
                      "binding": "currentRecord",
                      "collectionName": "employees"
                    },
                    "fields": ["nickname"]
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
```

## 4. Replace Example

```json
{
  "version": "1",
  "mode": "replace",
  "target": {
    "pageSchemaUid": "employees-page-schema"
  },
  "page": {
    "title": "Employees workspace",
    "documentTitle": "Employees replace flow",
    "displayTitle": false,
    "enableTabs": false
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

### Replace semantics

- `replace` targets one existing page through `target.pageSchemaUid`.
- DSL tabs map to existing route-backed tab slots by index, rewrite each slot in order, remove trailing old tabs, and append extra new tabs when needed.
- If `replace` expands a page from one hidden-tab state to multiple tabs, set `page.enableTabs: true` explicitly. When the current page has `enableTabs = false`, omitting it is rejected.
- If you need a tiny localized edit on one existing tab/node, do not use `replace`; use low-level APIs instead.

## 5. Single-tab Deep-popup Skeleton

Use this as a **generic structure pattern**, not as a copy-paste answer. It shows that a deep popup chain with sibling popup blocks still belongs to **one page / one tab**:

```json
{
  "version": "1",
  "mode": "create",
  "navigation": {
    "group": { "title": "Workspace" },
    "item": { "title": "Records" }
  },
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        {
          "key": "mainTable",
          "type": "table",
          "collection": "<mainCollection>",
          "fields": ["<summaryField>"],
          "recordActions": [
            {
              "type": "view",
              "title": "Details",
              "popup": {
                "blocks": [
                  {
                    "key": "mainDetails",
                    "type": "details",
                    "resource": {
                      "binding": "currentRecord",
                      "collectionName": "<mainCollection>"
                    },
                    "fields": ["<summaryField>"],
                    "recordActions": [
                      {
                        "type": "edit",
                        "popup": {
                          "blocks": [
                            {
                              "key": "editForm",
                              "type": "editForm",
                              "fields": ["<editableField>"]
                            }
                          ]
                        }
                      }
                    ]
                  },
                  {
                    "key": "relatedTable",
                    "type": "table",
                    "resource": {
                      "binding": "associatedRecords",
                      "associationField": "<relationField>",
                      "collectionName": "<relatedCollection>"
                    },
                    "fields": [
                      {
                        "field": "<relatedLabelField>",
                        "popup": {
                          "title": "Related details",
                          "blocks": [
                            {
                              "type": "details",
                              "resource": {
                                "binding": "currentRecord",
                                "collectionName": "<relatedCollection>"
                              },
                              "fields": ["<relatedLabelField>"],
                              "recordActions": [
                                {
                                  "type": "edit",
                                  "popup": {
                                    "blocks": [
                                      {
                                        "key": "relatedEditForm",
                                        "type": "editForm",
                                        "fields": ["<relatedEditableField>"]
                                      }
                                    ]
                                  }
                                }
                              ]
                            }
                          ]
                        }
                      }
                    ]
                  }
                ],
                "layout": {
                  "rows": [[{ "key": "mainDetails", "span": 12 }, { "key": "relatedTable", "span": 12 }]]
                }
              }
            }
          ]
        }
      ]
    }
  ]
}
```

Notes:

- Even with sibling popup blocks and nested edit popups, the outer page still has only **one tab**.
- When the intent is "click the shown related record to open details", the field object itself can carry the inline `popup`.
- If the requirement explicitly says "details button" or "action column", use an action / recordAction instead.

## 6. High-frequency Wrong vs Right

### A. `tab.layout` must be an object

Wrong:

```json
{
  "title": "Overview",
  "layout": "two-column",
  "blocks": [{ "type": "table", "collection": "employees" }]
}
```

Right:

```json
{
  "title": "Overview",
  "layout": {
    "rows": [["employeesTable"]]
  },
  "blocks": [{ "key": "employeesTable", "type": "table", "collection": "employees" }]
}
```

### B. `layout` does not belong on a block

Wrong:

```json
{
  "type": "table",
  "collection": "employees",
  "layout": {
    "rows": [["employeesTable"]]
  }
}
```

Right:

```json
{
  "title": "Overview",
  "layout": {
    "rows": [["employeesTable"]]
  },
  "blocks": [{ "key": "employeesTable", "type": "table", "collection": "employees" }]
}
```

### C. Do not keep an empty second tab in a single-page draft

Wrong:

```json
{
  "tabs": [
    { "title": "Overview", "blocks": [{ "type": "table", "collection": "employees" }] },
    { "title": "Later", "blocks": [] }
  ]
}
```

Right:

```json
{
  "tabs": [
    { "title": "Overview", "blocks": [{ "type": "table", "collection": "employees" }] }
  ]
}
```

### D. Do not add placeholder `markdown` / note / banner blocks in a single-page draft

Wrong:

```json
{
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        { "type": "table", "collection": "employees" },
        { "type": "markdown", "title": "Later notes" }
      ]
    }
  ]
}
```

Right:

```json
{
  "tabs": [
    {
      "title": "Overview",
      "blocks": [{ "type": "table", "collection": "employees" }]
    }
  ]
}
```

### E. Default `fields[]` entries to simple strings unless extra behavior is required

Wrong:

```json
{
  "type": "table",
  "collection": "employees",
  "fields": [{ "field": "nickname", "name": "Nickname" }]
}
```

Right:

```json
{
  "type": "table",
  "collection": "employees",
  "fields": ["nickname"]
}
```

## 7. Supported Semantics

### Block-level

Each tab contains `blocks[]`. A block can carry:

- optional local `key` when custom `layout` or cross-block references need a stable local identifier
- `type`
- `title`
- collection/binding info through `collection`, `associationPathName`, `resource`, `binding`
- `template`
- `settings`
- `fields[]`
- `actions[]`
- `recordActions[]`
- `script` / `chart` asset references

Supported block `type` values are:

- `table`
- `createForm`
- `editForm`
- `details`
- `filterForm`
- `list`
- `gridCard`
- `markdown`
- `iframe`
- `chart`
- `actionPanel`
- `jsBlock`

`form` is not a public executeDsl block type.

### Canonical resource shapes

Use **one** of these two styles per block:

#### A. Block-level shorthand

```json
{
  "type": "table",
  "collection": "employees",
  "associationPathName": "department",
  "fields": ["nickname"]
}
```

Rules:

- at block root, use `collection`, not `collectionName`
- at block root, use `binding`, not `resourceBinding`
- at block root, use `associationPathName`, not `association`
- `associationField` only makes sense when `binding` is present

#### B. Nested `resource` object

```json
{
  "type": "details",
  "resource": {
    "binding": "currentRecord",
    "collectionName": "employees"
  },
  "fields": ["nickname"]
}
```

Rules:

- inside `resource`, use `collectionName`, not `collection`
- inside `resource`, use `binding`, not `resourceBinding`
- inside `resource`, use `associationPathName`, not `association`
- do not mix block-level shorthand and nested `resource` on the same block
- when `resource.binding` is present, treat the object as binding-centered; do not mix it with raw locator-only forms such as `sourceId`

#### C. Canonical popup relation table

For a relation table inside a current-record popup, prefer:

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

Notes:

- this is the canonical form for "show the current record's related roles"
- executeDsl may normalize `currentRecord | associatedRecords + associationPathName` into this shape for convenience when `associationPathName` is a single relation field name
- the skill should still author this canonical `associatedRecords + associationField` shape directly

### Field shorthand

A field entry may be:

- a string, for example `"nickname"`
- an object with optional `key`, `field`, `renderer`, `type`, optional `target`, `settings`, and optional inline `popup`

Default to a simple string whenever the field only needs normal display/edit behavior. Upgrade to a field object only when `popup`, `target`, `renderer`, or field-specific `type` is actually required. Do not invent ad-hoc extra keys in field objects.

When the user says clicking a shown record / relation record should open details, prefer a field object with inline `popup` so the field itself is the opener. Readback commonly normalizes this to clickable-field / `clickToOpen` semantics. Use an action / recordAction only when the requirement explicitly says button / action column.

`field.target` is only a **string block key** in the same tab or popup scope:

```json
{ "field": "status", "type": "filter", "target": "employeesTable" }
```

Do not send object selectors there.

Clickable field example:

```json
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
```

### Action shorthand

An action / record action entry may be:

- a string action type
- an object with optional `key`, `type`, `title`, `settings`, and optional inline `popup`

For record-capable blocks (`table`, `details`, `list`, `gridCard`):

- author `view`, `edit`, `updateRecord`, and `delete` under `recordActions`
- executeDsl may auto-promote these common record actions from `actions`, but that is a convenience fallback, not the preferred authoring style
- for `edit`, backend default popup completion is fine for a standard single-form popup; if you author a custom edit popup with `popup.blocks`, that popup must contain exactly one `editForm`
- in a custom `edit` popup, that `editForm` may omit `resource`; executeDsl will inherit the opener's current-record context

### Popup

Inline popup is supported beneath a field/action/record action through:

```json
{
  "popup": {
    "title": "...",
    "mode": "replace",
    "template": { "uid": "...", "mode": "reference" },
    "blocks": [],
    "layout": { "rows": [["..."]] }
  }
}
```

`popup.layout` is valid because popup is a popup document. By contrast, block objects themselves do **not** accept `layout`; use `tab.layout` or `popup.layout`.

### Layout cell shape

`layout.rows` accepts only:

```json
["employeesTable"]
```

or

```json
[{ "key": "employeesTable", "span": 12 }]
```

Public `executeDsl` layout cells do **not** use `uid`, `ref`, or `$ref`.

### Assets

`assets.scripts` and `assets.charts` are reusable object maps. A block/field/action may refer to them by `script` or `chart`.

## 8. Canonical Naming Rule

When this skill authors `executeDsl`, always emit the canonical public names above.

- use block-level `collection`, not block-level `collectionName`
- use nested `resource.collectionName`, not `resource.collection`
- use `associationPathName`, not `association`
- use `field`, not `fieldPath`
- use `binding`, not `resourceBinding`
- use `popup`, not `openView`
- use string `target`, not object-style target selectors
- use layout cell `key`, not `uid`
- place `layout` only on `tabs[]` or `popup`, never on a block object
- do not use `ref` or `$ref`

## 9. Unsupported / Forbidden Public Fields

Use this file as the **shape reference**, not as a second full contract document.

- Send only the structure fields described here.
- Use the canonical names from Section 8.
- Keep `requestBody`, `ref`, `$ref`, block-level `layout`, layout-cell `uid`, object-style `field.target`, and deprecated aliases out of the payload.
- Keep non-DSL control fields and alias fields out of the payload; the authoritative contract lives in [normative-contract.md](./normative-contract.md).

## 10. Response Shape

`executeDsl` returns:

```json
{
  "version": "1",
  "mode": "create",
  "target": {
    "pageSchemaUid": "employees-page-schema",
    "pageUid": "employees-page-uid"
  },
  "surface": {}
}
```

The public response returns the resolved page target plus final `surface` readback.
