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
- Layout is optional; when omitted, the server auto-generates a simple top-to-bottom layout.
- `layout` is only allowed on `tabs[]` and inline `popup` documents; individual blocks do not accept `layout`.
- Public executeDsl blocks do **not** support generic `form`; use `editForm` or `createForm`.
- The DSL is structure-only; it does not expose planning or execution internals.

Important:

- This file describes the **inner page DSL document** only.
- When you call `flow_surfaces_execute_dsl`, put this document under `requestBody` as an **object**.
- Do not stringify this document into `requestBody: "{\"version\":\"1\"...}"`.
- If a surrounding tool UI still renders `flow_surfaces_execute_dsl.requestBody` as `string`, treat that as stale schema drift and still send this document as an object under `requestBody`.
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
  "tabs": []
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
  "assets": {
    "scripts": {
      "overviewBanner": {
        "version": "1.0.0",
        "code": "ctx.render('<div>Employees overview</div>');"
      }
    }
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
    },
    {
      "title": "Summary",
      "blocks": [
        {
          "type": "jsBlock",
          "title": "Overview banner",
          "script": "overviewBanner"
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

## 5. Supported Semantics

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

`field.target` is only a **string block key** in the same tab or popup scope:

```json
{ "field": "status", "type": "filter", "target": "employeesTable" }
```

Do not send object selectors there.

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

## 6. Canonical Naming Rule

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

## 7. Unsupported / Forbidden Public Fields

Use this file as the **shape reference**, not as a second full contract document.

- Send only the structure fields described here.
- Use the canonical names from Section 6.
- Keep `ref`, `$ref`, block-level `layout`, layout-cell `uid`, object-style `field.target`, and deprecated aliases out of the payload.
- Keep non-DSL control fields and alias fields out of the payload; the authoritative contract lives in [normative-contract.md](./normative-contract.md).

## 8. Response Shape

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
