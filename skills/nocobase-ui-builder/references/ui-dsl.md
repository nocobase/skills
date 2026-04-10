# UI DSL

This file defines the stable skill-side DSL contract used between intent discovery and execution. Always emit explicit `version = "1"` and explicit `kind`, even though the backend can infer some cases.

## 1. Core Rules

- Use `kind = "blueprint"` for whole-page creation or whole-page update requests.
- Use `kind = "patch"` for precise existing-surface structural edits.
- Always keep `assumptions` and `unresolvedQuestions` arrays.
- `executeDsl` is allowed only when `unresolvedQuestions` is empty.
- `dataBound = true` means the block must reference a real `dataSourceKey`.
- Popup intent must be explicit through `popups[*].completion`.
- `shell-only` popup is only valid when the user explicitly wants the shell first.
- Per [normative-contract.md](./normative-contract.md), nested popups, popup-scoped bindings such as `currentRecord` / `associatedRecords`, same-row layouts, and field `clickToOpen/openView` still belong to DSL scope.

## 2. Blueprint DSL

Use blueprint DSL for:

- new page creation
- whole-page redesign from high-level intent
- update-page structural rewrites that are easier to express as one page structure than as isolated patch ops

Canonical shape:

```json
{
  "version": "1",
  "kind": "blueprint",
  "intent": "management",
  "title": "Employees",
  "target": {
    "mode": "create-page"
  },
  "navigation": {
    "parent": {
      "createGroup": {
        "title": "Workspace"
      }
    },
    "item": {
      "title": "Employees"
    },
    "page": {
      "title": "Employees",
      "enableHeader": true,
      "enableTabs": true,
      "displayTitle": true
    },
    "initialTab": {
      "title": "Overview"
    }
  },
  "dataSources": [
    {
      "key": "employees",
      "kind": "collection",
      "dataSourceKey": "main",
      "collectionName": "employees"
    },
    {
      "key": "employeeRecord",
      "kind": "binding",
      "scope": "popup",
      "popupId": "employeeViewPopup",
      "binding": "currentRecord",
      "collectionName": "employees"
    }
  ],
  "layout": {
    "kind": "rows-columns",
    "rows": [
      {
        "key": "main",
        "columns": [
          {
            "key": "left",
            "width": 3,
            "items": ["employeesFilter"]
          },
          {
            "key": "right",
            "width": 9,
            "items": ["employeesTable"]
          }
        ]
      }
    ]
  },
  "blocks": [
    {
      "id": "employeesFilter",
      "type": "filterForm",
      "title": "Employee filter",
      "dataBound": true,
      "dataSourceKey": "employees",
      "fields": [{ "fieldPath": "nickname" }],
      "actions": [{ "id": "search", "type": "submit", "title": "Search" }]
    },
    {
      "id": "employeesTable",
      "type": "table",
      "title": "Employees",
      "dataBound": true,
      "dataSourceKey": "employees",
      "fields": [{ "fieldPath": "nickname" }],
      "recordActions": [
        {
          "id": "viewEmployee",
          "type": "view",
          "title": "View",
          "popupId": "employeeViewPopup"
        }
      ]
    }
  ],
  "interactions": [
    {
      "type": "filter-target",
      "sourceBlockId": "employeesFilter",
      "fieldPath": "nickname",
      "targetBlockId": "employeesTable"
    }
  ],
  "popups": [
    {
      "id": "employeeViewPopup",
      "title": "View employee",
      "completion": "completed",
      "blocks": [
        {
          "id": "employeeDetails",
          "type": "details",
          "title": "Employee details",
          "dataBound": true,
          "dataSourceKey": "employeeRecord",
          "fields": [{ "fieldPath": "nickname" }]
        }
      ]
    }
  ],
  "assumptions": [],
  "unresolvedQuestions": []
}
```

Blueprint notes:

- `target.mode = "create-page"` creates a new page. `target.mode = "update-page"` requires `target.locator`.
- `navigation` is meaningful for `create-page`. For `update-page`, keep navigation changes out unless the live contract explicitly supports them through the chosen path.
- `dataSources[*].key` is DSL-local. Blocks reference it through `dataSourceKey`.
- `binding` data sources are currently popup-scoped.
- If popup blocks need `currentRecord`, `associatedRecords`, same-row layout, or field-driven open-view semantics, keep those semantics explicit in DSL. Do not treat them as an automatic reason to leave the DSL path.
- Every block referenced in `layout.rows[*].columns[*].items` must exist in `blocks[]`.
- Every popup referenced by `popupId` must exist in `popups[]`.

## 3. Patch DSL

Use patch DSL for concrete existing-surface deltas.

Canonical shape:

```json
{
  "version": "1",
  "kind": "patch",
  "target": {
    "locator": {
      "pageSchemaUid": "employees-page-schema"
    }
  },
  "changes": [
    {
      "id": "addTable",
      "op": "block.add",
      "values": {
        "ref": "employeesTable",
        "type": "table",
        "resourceInit": {
          "dataSourceKey": "main",
          "collectionName": "employees"
        }
      }
    },
    {
      "id": "addNickname",
      "op": "field.add",
      "target": {
        "id": "employeesTable"
      },
      "values": {
        "fieldPath": "nickname"
      }
    }
  ],
  "assumptions": [],
  "unresolvedQuestions": []
}
```

Patch notes:

- `target.locator` anchors the editable surface.
- Each change may target/source either by DSL id or by live locator.
- `{ "id": "employeesTable" }` means `ref = employeesTable` when that ref was introduced by an earlier change or provided through `bindRefs`.
- `{ "id": "employeesTable", "anchor": "popupGrid" }` means the derived ref `employeesTable.popupGrid` when that anchor exists.
- If you cannot name a stable existing node, use `locator` instead of inventing an id.

Supported patch ops:

- `page.destroy`
- `tab.add`, `tab.update`, `tab.move`, `tab.remove`
- `block.add`, `field.add`, `action.add`, `recordAction.add`
- `settings.update`, `layout.replace`
- `node.move`, `node.remove`
- `template.detach`

## 4. Authoring Heuristics

- Prefer blueprint DSL when the user is describing a page in business terms.
- Prefer patch DSL when the user is describing a concrete delta on an existing known surface.
- Keep ids readable and stable; for example `employeesTable`, `viewEmployee`, `employeeViewPopup`.
- Put uncertainty in `assumptions` or `unresolvedQuestions`, not in silent guesswork.
- If the request is destructive or ambiguous, draft first and confirm before execution.

## 5. What Makes DSL `Ready To Execute`

A DSL document is ready to execute only when all of the following are true:

- explicit `version` and `kind`
- all required locators, data sources, blocks, popups, and layout references resolve locally within the document or from live facts
- `assumptions` are acceptable for the user-facing intent
- `unresolvedQuestions` is empty
- `validateDsl` succeeds
