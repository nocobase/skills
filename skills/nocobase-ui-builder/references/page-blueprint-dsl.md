# Page Blueprint DSL

This file defines the stable `pageBlueprint` structure used between read-only planning and UI execution.

## 1. Core Shape

```json
{
  "version": "1",
  "intent": "management",
  "title": "User Management",
  "target": {
    "mode": "create-page"
  },
  "dataSources": [
    {
      "key": "users",
      "kind": "collection",
      "dataSourceKey": "main",
      "collectionName": "users"
    },
    {
      "key": "user-view-record",
      "kind": "binding",
      "scope": "popup",
      "popupId": "user-view-popup",
      "binding": "currentRecord",
      "collectionName": "users"
    },
    {
      "key": "user-edit-record",
      "kind": "binding",
      "scope": "popup",
      "popupId": "user-edit-popup",
      "binding": "currentRecord",
      "collectionName": "users"
    }
  ],
  "layout": {
    "kind": "rows-columns",
    "rows": [
      {
        "key": "row-main",
        "columns": [
          { "key": "col-filter", "width": 3, "items": ["users-filter"] },
          { "key": "col-table", "width": 7, "items": ["users-table"] }
        ]
      },
      {
        "key": "row-help",
        "columns": [
          { "key": "col-help", "width": 10, "items": ["users-help"] }
        ]
      }
    ]
  },
  "blocks": [
    {
      "id": "users-filter",
      "type": "filterForm",
      "title": "User Filter",
      "dataBound": true,
      "dataSourceKey": "users",
      "fields": [
        { "fieldPath": "username" },
        { "fieldPath": "nickname" }
      ],
      "actions": [
        { "type": "submit", "title": "Search" },
        { "type": "reset", "title": "Reset" }
      ]
    },
    {
      "id": "users-table",
      "type": "table",
      "title": "Users",
      "dataBound": true,
      "dataSourceKey": "users",
      "fields": [
        { "fieldPath": "username" },
        { "fieldPath": "nickname" }
      ],
      "actions": [
        {
          "id": "users-add",
          "type": "addNew",
          "title": "Add user",
          "popupId": "user-create-popup"
        }
      ],
      "recordActions": [
        {
          "id": "users-view",
          "type": "view",
          "title": "View",
          "popupId": "user-view-popup"
        },
        {
          "id": "users-edit",
          "type": "edit",
          "title": "Edit",
          "popupId": "user-edit-popup"
        }
      ]
    },
    {
      "id": "users-help",
      "type": "markdown",
      "title": "Usage Notes",
      "dataBound": false
    }
  ],
  "interactions": [
    {
      "type": "filter-target",
      "sourceBlockId": "users-filter",
      "fieldPath": "username",
      "targetBlockId": "users-table"
    }
  ],
  "popups": [
    {
      "id": "user-create-popup",
      "title": "Add user",
      "completion": "completed",
      "blocks": [
        {
          "id": "user-create-form",
          "type": "createForm",
          "dataBound": true,
          "dataSourceKey": "users",
          "fields": [
            { "fieldPath": "username" },
            { "fieldPath": "nickname" }
          ],
          "actions": [
            { "type": "submit", "title": "Submit" }
          ]
        }
      ]
    },
    {
      "id": "user-view-popup",
      "title": "View user",
      "completion": "completed",
      "blocks": [
        {
          "id": "user-view-details",
          "type": "details",
          "dataBound": true,
          "dataSourceKey": "user-view-record",
          "fields": [
            { "fieldPath": "username" },
            { "fieldPath": "nickname" }
          ]
        }
      ]
    },
    {
      "id": "user-edit-popup",
      "title": "Edit user",
      "completion": "completed",
      "blocks": [
        {
          "id": "user-edit-form",
          "type": "editForm",
          "dataBound": true,
          "dataSourceKey": "user-edit-record",
          "fields": [
            { "fieldPath": "username" },
            { "fieldPath": "nickname" }
          ],
          "actions": [
            { "type": "submit", "title": "Save" }
          ]
        }
      ]
    }
  ],
  "assumptions": [],
  "unresolvedQuestions": []
}
```

## 2. Required Semantics

- `version`: current DSL version. Use `"1"` for now.
- `intent`: one of `management`, `detail`, `dashboard`, `portal`, or `custom`.
- `title`: the user-facing page title for the planned surface.
- `target`: where the blueprint should apply.
- `dataSources`: reusable real data-source facts used by `data-bound block`s.
- `layout`: explicit row/column intent, not just prose.
- `blocks`: the page-level blocks to build.
- `interactions`: cross-block semantics such as filter targeting, popup opening, or block linkage that should not be guessed later.
- `popups`: popup entries that page actions or interactions depend on. Omit only when the page truly has no popup semantics in scope.
- `assumptions`: planning assumptions that execution should preserve or re-check.
- `unresolvedQuestions`: any ambiguity that blocks safe execution.

## 3. Target Rules

`target` must use one of these shapes:

```json
{ "mode": "create-page" }
```

```json
{
  "mode": "update-page",
  "locator": {
    "uid": "page-uid-or-node-uid"
  }
}
```

Rules:

- `create-page` means the blueprint will create a new page/menu-first surface.
- `update-page` requires a real locator such as `uid`, `pageSchemaUid`, or `routeId`.
- Do not say a blueprint supports `update-page` unless the target locator has already been discovered from live facts.

## 4. Data-Source Rules

Each `dataSources[*]` item should capture a reusable real fact. Common stable shapes are:

`collection`:

```json
{
  "key": "users",
  "kind": "collection",
  "dataSourceKey": "main",
  "collectionName": "users"
}
```

`association`:

```json
{
  "key": "user-roles",
  "kind": "association",
  "dataSourceKey": "main",
  "collectionName": "users",
  "associationPathName": "roles"
}
```

popup-scoped `currentRecord`:

```json
{
  "key": "user-view-record",
  "kind": "binding",
  "scope": "popup",
  "popupId": "user-view-popup",
  "binding": "currentRecord",
  "collectionName": "users"
}
```

popup-scoped `associatedRecords`:

```json
{
  "key": "user-role-records",
  "kind": "binding",
  "scope": "popup",
  "popupId": "user-view-popup",
  "binding": "associatedRecords",
  "associationField": "roles",
  "collectionName": "roles"
}
```

Rules:

- `dataSources[*].key` must be unique inside one blueprint.
- `dataSources[*].dataSourceKey`, when present, means the underlying NocoBase data-source key such as `main`. By contrast, `blocks[*].dataSourceKey` refers to the blueprint entry key in `dataSources[*].key`.
- `data-bound block`s should prefer `dataSourceKey` over repeating a raw low-level `resource` object in the blueprint.
- Execution may later map a blueprint data source into live `resource` or `resourceInit`, but that translation belongs to execution, not to the blueprint contract.
- `kind = "collection"` requires `collectionName`.
- `kind = "association"` requires both `collectionName` and `associationPathName`.
- `kind = "binding"` requires `scope`, `popupId`, and `binding`.
- `kind = "binding"` may only be used after the required live binding fact, such as `currentRecord` or `associatedRecords`, has already been confirmed through live `catalog`.
- `binding = "associatedRecords"` requires `associationField`.
- If one block truly needs a different binding from the shared source entry, document that difference explicitly rather than silently forking it at execution time.

## 5. Layout and Page-Block Rules

Each page block should include:

- `id`
- `type`
- `dataBound`
- `title` when user-facing labeling matters
- `dataSourceKey` when `dataBound = true`
- `fields` / `actions` / `recordActions` when relevant

Rules:

- `dataBound = true` requires a real `dataSourceKey`.
- Page-level `blocks[*].dataSourceKey` must resolve to `dataSources[*].key`, not directly to the underlying NocoBase data-source key such as `main`.
- `dataBound = false` should omit `dataSourceKey` unless the live capability truly requires one.
- `fields[*].fieldPath` must come from real schema facts. Do not invent field names.
- `actions` and `recordActions` should use object form consistently. Do not mix string shorthand and object form in the same stable DSL.
- Every page-level `blocks[*].id` must appear exactly once in `layout.rows[*].columns[*].items`.
- `layout` must not reference popup block ids.

## 6. Interaction Rules

Use `interactions` for cross-block or cross-popup semantics that should stay explicit.

Common cases:

- filter field -> target block binding
- opener action -> popup linkage when the action object alone is not enough
- list/table/details coordination that would otherwise be left to guesswork

Illustrative fragment:

```json
[
  {
    "type": "filter-target",
    "sourceBlockId": "users-filter",
    "fieldPath": "status",
    "targetBlockId": "users-table"
  }
]
```

## 7. Popup Rules

Each popup entry should include:

- `id`
- `title` when user-facing labeling matters
- `completion`: `completed` or `shell-only`
- `blocks` when `completion = "completed"` and execution does not rely on backend default CRUD popup completion

Rules:

- Put popup content into `popups` when the page structure depends on popup completion.
- A popup action is not "done" unless the popup content semantics were also planned, unless the user explicitly wants shell-only popup setup.
- `completion = "completed"` requires meaningful popup content, either through explicit `blocks` or through a clearly stated dependency on backend default CRUD popup completion.
- `completion = "shell-only"` may omit `blocks` or use an empty list, but it must not be described as completed popup content.
- Every referenced `popupId` must resolve to a defined popup entry in the same blueprint.
- Popup blocks follow the same `dataBound` / `dataSourceKey` rules as page blocks.
- If a popup block uses a popup-scoped `kind = "binding"` data source, that data source must reference the same popup through `popupId`.

Illustrative shell-only popup:

```json
{
  "id": "user-import-popup",
  "title": "Import users",
  "completion": "shell-only"
}
```

## 8. Non-Data Example

`non-data block`s may stay unbound:

```json
{
  "id": "dashboard-help",
  "type": "markdown",
  "title": "How to read this page",
  "dataBound": false
}
```

## 9. Blueprint Invariants

- Every `dataSourceKey` used by a block must resolve to exactly one `dataSources[*].key`.
- Every page-level `blocks[*].id` must appear exactly once in page `layout`.
- Popup blocks live only under `popups[*].blocks`; they must not be reused as page-level `blocks`.
- Every `popupId` referenced from `actions`, `recordActions`, or `interactions` must resolve to a popup entry in `popups`.
- Every popup-scoped `kind = "binding"` source must reference an existing popup entry through `popupId`.
- `assumptions` and `unresolvedQuestions` may surface ambiguity, but they must not hide required execution steps such as "decide popup content later" when the popup was already promised as completed.

## 10. Execution Expectations

- Execution should hand the confirmed `pageBlueprint` to [planning-compiler.md](./planning-compiler.md), compile it into `plan.steps[]`, and then run `validatePlan` / `executePlan` by default.
- Execution should translate blueprint-level `dataSources` into live `resource` / `resourceInit` payloads only at write time.
- Execution must not silently widen the scope beyond the confirmed blueprint.
- If a confirmed blueprint node cannot be expressed through live `catalog` facts or current plan coverage, stop execution and return to blueprint revision instead of guessing a low-level path.
