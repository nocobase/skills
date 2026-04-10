# Tool Shapes

Read this file when family, locator, and target uid are already known, and the only remaining question is how to wrap the MCP request. For family / locator, see [runtime-playbook.md](./runtime-playbook.md). For the public-semantic rules of `settings`, see [settings.md](./settings.md). For popup semantics and `currentRecord`, see [popup.md](./popup.md). For post-write verification, see [verification.md](./verification.md).

## 1. One-Screen Hard Rules

- `flow_surfaces_get` only accepts root-level `uid`, `pageSchemaUid`, `tabSchemaUid`, or `routeId`
- `get` accepts neither `requestBody` nor `target`
- Existing-surface DSL execution should use `describeSurface` first so `expectedFingerprint` can be passed into `validateDsl` / `executeDsl`
- Always emit explicit `dsl.kind` and `dsl.version = "1"`
- Use `verificationMode = "strict"` by default on `executeDsl`
- This skill's default structural path is `validateDsl` / `executeDsl`
- Lifecycle APIs such as `createMenu`, `updateMenu`, and `createPage` remain direct APIs only for lifecycle-only exceptions or for low-level fallback that is already justified by concrete `validateDsl` evidence
- Most write APIs require a `requestBody`; many of them then place `target.uid` inside `requestBody`
- This file only keeps the minimum request envelopes. For popup semantics, guards, and popup-specific write flow, follow [popup.md](./popup.md). When a low-level popup payload is needed, keep `popup.mode` explicit. New inline subtrees usually use `replace`, while explicit append uses `append`
- Semantic resource bindings inside popup blocks must always use object-shaped `resource`; `currentCollection`, `currentRecord`, `associatedRecords`, and `otherRecords` are never string shorthand
- The presence or absence of a local example in this file does not change DSL coverage. Coverage policy still follows [normative-contract.md](./normative-contract.md) and [dsl-execution.md](./dsl-execution.md).

## 2. Primary DSL Envelopes

### Existing surface: `describeSurface -> validateDsl -> executeDsl`

`describeSurface` anchors an existing editable surface:

```json
{
  "requestBody": {
    "locator": {
      "pageSchemaUid": "employees-page-schema"
    }
  }
}
```

`validateDsl` for an existing-surface patch run:

```json
{
  "requestBody": {
    "expectedFingerprint": "fingerprint-from-describeSurface",
    "bindRefs": [
      {
        "ref": "employeesTable",
        "locator": {
          "uid": "employees-table-uid"
        },
        "expectedKind": "block"
      }
    ],
    "dsl": {
      "version": "1",
      "kind": "patch",
      "target": {
        "locator": {
          "pageSchemaUid": "employees-page-schema"
        }
      },
      "changes": [
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
  }
}
```

`executeDsl` for the same run keeps the same envelope and adds `verificationMode`:

```json
{
  "requestBody": {
    "expectedFingerprint": "fingerprint-from-describeSurface",
    "bindRefs": [
      {
        "ref": "employeesTable",
        "locator": {
          "uid": "employees-table-uid"
        },
        "expectedKind": "block"
      }
    ],
    "verificationMode": "strict",
    "dsl": {
      "version": "1",
      "kind": "patch",
      "target": {
        "locator": {
          "pageSchemaUid": "employees-page-schema"
        }
      },
      "changes": [
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
  }
}
```

### New page: `validateDsl -> executeDsl`

```json
{
  "requestBody": {
    "dsl": {
      "version": "1",
      "kind": "blueprint",
      "intent": "management",
      "title": "Employees",
      "target": {
        "mode": "create-page"
      },
      "navigation": {
        "item": {
          "title": "Employees"
        }
      },
      "dataSources": [
        {
          "key": "employees",
          "kind": "collection",
          "dataSourceKey": "main",
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
                "key": "table",
                "width": 12,
                "items": ["employeesTable"]
              }
            ]
          }
        ]
      },
      "blocks": [
        {
          "id": "employeesTable",
          "type": "table",
          "title": "Employees",
          "dataBound": true,
          "dataSourceKey": "employees",
          "fields": [{ "fieldPath": "nickname" }]
        }
      ],
      "interactions": [],
      "popups": [],
      "assumptions": [],
      "unresolvedQuestions": []
    }
  }
}
```

Use the same envelope for `executeDsl`, plus `verificationMode = "strict"`.

Shape rules:

- Existing-surface DSL runs carry `expectedFingerprint`; pure bootstrap blueprint runs usually do not.
- For this skill, put the normalized document under `requestBody.dsl` instead of relying on top-level shorthand.
- `bindRefs` are only for already existing nodes on the current surface.
- `unresolvedQuestions` must be empty before `executeDsl`.

## 3. `catalog` Request / Response Shape

When `requestBody.sections` is omitted, the backend may choose `selectedSections` automatically and report them in the response.

Minimal light-response request:

```json
{
  "requestBody": {
    "target": {
      "uid": "page-grid-uid"
    }
  }
}
```

Example with `expand`:

```json
{
  "requestBody": {
    "target": {
      "uid": "page-grid-uid"
    },
    "expand": [
      "item.configureOptions",
      "item.contracts",
      "node.contracts"
    ]
  }
}
```

Minimal response skeleton:

```json
{
  "target": {
    "uid": "page-grid-uid",
    "kind": "route-content"
  },
  "scenario": {
    "surfaceKind": "route-content"
  },
  "selectedSections": ["blocks", "actions", "node"]
}
```

## 4. Root-Level Locator `get`

Corresponding MCP tool: `mcp__nocobase__flow_surfaces_get`

Valid examples:

```json
{ "uid": "table-block-uid" }
```

```json
{ "pageSchemaUid": "employees-page-schema" }
```

```json
{ "tabSchemaUid": "overview-tab-schema" }
```

```json
{ "routeId": "123" }
```

Rules:

- Only root-level locator fields are accepted
- `requestBody` is not accepted
- `target` is not accepted
- Pass only one root locator at a time
- Values such as `hostUid`, `pageUid`, `gridUid`, `popupPageUid`, `popupTabUid`, and `popupGridUid` should all default into `uid` when reading

## 5. Low-Level Fallback Request Placement

These lifecycle APIs use `requestBody`, but do not accept `requestBody.target.uid`:

| Semantic name | MCP tool | Key fields |
| --- | --- | --- |
| `createMenu` | `flow_surfaces_create_menu` | `requestBody.title`, optional `type/icon/tooltip/hideInMenu/parentMenuRouteId` |
| `updateMenu` | `flow_surfaces_update_menu` | `requestBody.menuRouteId`, optional `title/icon/tooltip/hideInMenu/parentMenuRouteId` |
| `createPage` | `flow_surfaces_create_page` | `requestBody.menuRouteId` initializes a bindable menu item; other common fields include `title/tabTitle/enableTabs` |
| `destroyPage` | `flow_surfaces_destroy_page` | `requestBody.uid`, which must be `pageUid` |
| `moveTab` | `flow_surfaces_move_tab` | `requestBody.sourceUid/targetUid/position` |
| `removeTab` | `flow_surfaces_remove_tab` | `requestBody.uid` |
| `movePopupTab` | `flow_surfaces_move_popup_tab` | `requestBody.sourceUid/targetUid/position` |
| `moveNode` | `flow_surfaces_move_node` | `requestBody.sourceUid/targetUid/position` |

Additional lifecycle notes:

- `createMenu(type="group")` only returns menu route information; it does not return a writable page target
- `createMenu(type="item")` may return `pageSchemaUid/pageUid/tabSchemaUid/routeId`, but the page may still be uninitialized
- Do not call page/tab lifecycle APIs after `createMenu(type="item")` until `createPage(menuRouteId=...)` finishes initialization
- `createPage(menuRouteId=...)` initializes the bindable menu item into a real Modern page(v2)
- The `pageUid` returned by `createPage` is for page-level writes; `pageSchemaUid/tabSchemaUid/routeId` stay in the readback / locator lane; `gridUid` is for subsequent content-area construction

These tools all require:

```json
{
  "requestBody": {
    "target": { "uid": "..." }
  }
}
```

Common groups:

- `catalog`, `compose`, `configure`, `addTab`, `updateTab`, `addPopupTab`, `updatePopupTab`, `removePopupTab`
- `addBlock` / `addBlocks`, `addField` / `addFields`, `addAction` / `addActions`, `addRecordAction` / `addRecordActions`
- `updateSettings`, `setEventFlows`, `setLayout`, `removeNode`, `apply`

Common target choices:

- page lifecycle target -> `pageUid`
- route-content append target -> `gridUid`
- outer-tab target -> `tabSchemaUid`
- popup-page target -> `popupPageUid`
- popup-tab target -> `popupTabUid`
- popup-content append target -> `popupGridUid`

Rules:

- `pageSchemaUid` and `routeId` belong to `get` locators. Do not place them directly into `target.uid`.
- `pageUid`, `gridUid`, `tabSchemaUid`, `popupPageUid`, `popupTabUid`, and `popupGridUid` are not interchangeable "generic target uids".
- `currentRecord` is neither a locator nor a `target.uid`; it is popup-internal block resource-binding semantics.

Template-aware payload placement:

- block templates -> `requestBody.template` (or inner block spec `template`)
- fields templates -> `addField/addFields.requestBody.template`
- popup templates -> `requestBody.popup.template`
- existing opener switches popup template through `configure(changes.openView.template)` when allowed by the live contract

Minimal semantic popup `resource` reminders:

- `currentRecord` -> `{ "binding": "currentRecord" }`
- `associatedRecords` -> `{ "binding": "associatedRecords", "associationField": "<field>" }`
- keep these bindings in object form; never use string shorthand such as `resource: "currentRecord"`

## 6. Canonical Payload for `context`

```json
{
  "requestBody": {
    "target": { "uid": "popup-grid-uid" },
    "path": "record",
    "maxDepth": 2
  }
}
```

Rules:

- `path` only accepts bare paths, such as `record`, `popup.record`, or `item.parentItem.value`
- Do not pass template-wrapped forms like `ctx.record` or `{{ ctx.record }}`
- Omitting `path` means reading the default context tree under the current target
- Use `maxDepth` only when you need to narrow the context tree

## 7. Canonical Payload for `setLayout`

`setLayout` is a full-replace write. Use it only when the user really wants layout replacement and you have already read the current layout.

Correct two-column same-row shape:

```json
{
  "requestBody": {
    "target": { "uid": "grid-uid" },
    "rowOrder": ["row1"],
    "rows": {
      "row1": [["left-block"], ["right-block"]]
    },
    "sizes": {
      "row1": [12, 12]
    }
  }
}
```

Layout rules:

- `rows[rowKey]` outer-array length = column count
- `sizes[rowKey]` must have the same length as `rows[rowKey]`
- `[["a"], ["b"]]` means side by side
- `[["a", "b"]]` means one column stacking two items vertically
- `sizes[rowKey]` must be one-dimensional `number[]`

## 8. Destructive Advanced Shapes

- `apply(mode="replace")` and replace-style `setLayout` are destructive / full-replace paths
- Use them only when the user explicitly accepts subtree or layout replacement
- Always follow with full readback

## 9. Common Invalid Shapes

- passing `requestBody` or `target` into `get`
- omitting explicit `dsl.kind` and relying on backend inference
- calling `executeDsl` while `unresolvedQuestions` is still non-empty
- treating `pageSchemaUid` / `routeId` as `target.uid`
- forgetting the outer `requestBody` on lifecycle APIs
- calling page/tab lifecycle APIs after `createMenu(type="item")` but before `createPage(menuRouteId=...)`
- passing `currentRecord` as a bare locator or `target.uid`
- writing popup-internal `resource` as a string, such as `resource: "currentRecord"`
- carrying a `popup` subtree but omitting `popup.mode`, then relying on runtime fallback
- mixing `resource` and `resourceInit` on a popup collection block
- treating `settings.props.*`, `settings.decoratorProps.*`, or `settings.stepParams.*` as legal inputs to `add*`
- writing side-by-side layout as `rows[rowKey] = [[left, right]]`
- making `rows[rowKey]` and `sizes[rowKey]` lengths inconsistent
- writing `sizes[rowKey]` as a two-dimensional array such as `[[8, 16]]`
