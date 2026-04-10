# Tool Shapes

Read this file when family, locator, and target uid are already known, and the only remaining question is how to wrap the MCP request. For family / locator, see [runtime-playbook.md](./runtime-playbook.md). For the public-semantic rules of `settings`, see [settings.md](./settings.md). For popup semantics and `currentRecord`, see [popup.md](./popup.md). For post-write verification, see [verification.md](./verification.md).

## Contents

1. One-screen hard rules
2. Minimal plan envelopes
3. `catalog` request / response shape
4. Root-level locator `get`
5. `requestBody` without `target`
6. target-based `requestBody.target.uid`
7. Canonical payload for `context`
8. Canonical payload for `setLayout`
9. `apply` / `mutate`
10. Common invalid shapes

## One-Screen Hard Rules

- `flow_surfaces_get` only accepts `uid`, `pageSchemaUid`, `tabSchemaUid`, and `routeId`
- `get` accepts root-level locators only; `describeSurface`, `validatePlan`, and `executePlan` use the request envelopes shown below
- `get` accepts neither `requestBody` nor `target`
- If family / locator is not resolved yet, do not assemble the payload directly. Go back to [runtime-playbook.md](./runtime-playbook.md) first
- Other than `pageSchemaUid/tabSchemaUid/routeId`, all other ids should default into `uid` for reads
- Most write APIs require a `requestBody`; many of them then place `target.uid` inside `requestBody`
- `createMenu`, `updateMenu`, and `createPage` are lifecycle APIs and do not accept `target`
- `createPage` initializes a bindable menu item when `menuRouteId` is provided. Calling `createPage` without `menuRouteId` is only allowed when the user explicitly accepts the side effects of a standalone / compat page
- In the current implementation, `tabSchemaUid` can be used both as the `get` locator for `outer-tab` and directly as its write target uid, but `pageSchemaUid` and `routeId` are still `get` locators only
- `setLayout` and `setEventFlows` are high-impact full-replace APIs. Read the full current state first, then decide whether to write
- Popup-capable canonical payload shapes are defined in this file. `popup.mode` must be written explicitly. New inline subtrees usually use `replace`, while explicit append uses `append`
- Template-aware creation uses the same payload families. `addBlock/addBlocks/compose` may carry `template`; `addField/addFields` may carry `template` for fields templates; popup-capable actions and fields may carry `popup.template`
- `validatePlan` / `executePlan` caller input supports two reference forms: use `{ "ref": "..." }` for existing named nodes or earlier-step created refs, and use `{ "step": "...", "path": "..." }` only for raw prior-step outputs such as `routeId`. Do not use `$ref`
- For plan chaining, do not rely on `blocksByKey.*`, `actionsByKey.*`, `recordActionsByKey.*`, or array-index result paths. Declare stable `ref` values on the producer node instead
- Semantic resources inside popup that depend on `resourceBindings` must not use a one-shot inline popup. Go back to the `guard-first popup flow` in [popup.md](./popup.md)
- Semantic resource bindings inside popup blocks must always use object-shaped `resource`; `currentCollection`, `currentRecord`, `associatedRecords`, and `otherRecords` are never string shorthand

## Minimal plan envelopes

This section only records the legal envelope of the high-level plan / execution APIs. Execution preference, compilation policy, and fallback rules live in [execution-checklist.md](./execution-checklist.md) and [planning-compiler.md](./planning-compiler.md).

### Existing surface: `describeSurface -> validatePlan -> executePlan`

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

`validatePlan` for an existing surface uses the `surface` + `expectedFingerprint` envelope:

```json
{
  "requestBody": {
    "surface": {
      "locator": {
        "pageSchemaUid": "employees-page-schema"
      }
    },
    "expectedFingerprint": "fingerprint-from-describeSurface",
    "plan": {
      "steps": [
        {
          "id": "composeTable",
          "action": "compose",
          "selectors": {
            "target": {
              "locator": {
                "uid": "page-grid-uid"
              }
            }
          },
          "values": {
            "mode": "append",
            "blocks": [
              {
                "ref": "employeesTable",
                "type": "table",
                "resource": {
                  "dataSourceKey": "main",
                  "collectionName": "employees"
                },
                "fields": [{ "ref": "employeesTable.nickname", "fieldPath": "nickname" }]
              }
            ]
          }
        }
      ]
    }
  }
}
```

`executePlan` for the same existing surface uses the same request envelope as `validatePlan`.

### Bootstrap creation: `validatePlan -> executePlan`

`validatePlan` for bootstrap creation omits both `surface` and `expectedFingerprint`:

```json
{
  "requestBody": {
    "plan": {
      "steps": [
        {
          "id": "workspace",
          "action": "createMenu",
          "values": {
            "title": "Workspace",
            "type": "group"
          }
        },
        {
          "id": "employeesMenu",
          "action": "createMenu",
          "values": {
            "title": "Employees",
            "type": "item",
            "parentMenuRouteId": {
              "step": "workspace",
              "path": "routeId"
            }
          }
        },
        {
          "id": "employeesPage",
          "action": "createPage",
          "values": {
            "menuRouteId": {
              "step": "employeesMenu",
              "path": "routeId"
            },
            "tabTitle": "Overview"
          }
        }
      ]
    }
  }
}
```

Representative continuation for a one-shot complex bootstrap plan:

```json
{
  "requestBody": {
    "plan": {
      "steps": [
        {
          "id": "group",
          "action": "createMenu",
          "values": {
            "title": "Workspace",
            "type": "group"
          }
        },
        {
          "id": "menu",
          "action": "createMenu",
          "values": {
            "title": "Users",
            "type": "item",
            "parentMenuRouteId": {
              "step": "group",
              "path": "routeId"
            }
          }
        },
        {
          "id": "page",
          "action": "createPage",
          "values": {
            "menuRouteId": {
              "step": "menu",
              "path": "routeId"
            },
            "ref": "usersPage",
            "tabTitle": "Overview"
          }
        },
        {
          "id": "composeMain",
          "action": "compose",
          "selectors": {
            "target": {
              "ref": "usersPage.tab"
            }
          },
          "values": {
            "mode": "append",
            "blocks": [
              {
                "ref": "usersTable",
                "type": "table",
                "resource": {
                  "dataSourceKey": "main",
                  "collectionName": "users"
                },
                "fields": [
                  { "ref": "usersTable.username", "fieldPath": "username" },
                  { "ref": "usersTable.nickname", "fieldPath": "nickname" }
                ],
                "recordActions": [
                  {
                    "ref": "usersTable.viewUser",
                    "type": "view"
                  }
                ]
              }
            ]
          }
        },
        {
          "id": "composeUserPopup",
          "action": "compose",
          "selectors": {
            "target": {
              "ref": "usersTable.viewUser.popupGrid"
            }
          },
          "values": {
            "mode": "replace",
            "blocks": [
              {
                "ref": "userDetails",
                "type": "details",
                "resource": {
                  "binding": "currentRecord"
                }
              }
            ]
          }
        }
      ]
    }
  }
}
```

This is the canonical pattern when one bootstrap `executePlan` needs to continue from raw lifecycle results such as `routeId`, then switch to stable semantic refs such as `usersPage.tab`, `usersTable.viewUser.popupGrid`, or `userDetails.editUser.popupGrid`.
The same chaining rule also applies when the downstream step is `configure`, `addField`, `addAction`, or another target-taking structural step.

`executePlan` for bootstrap uses the same request envelope as `validatePlan`.

Shape rules:

- Existing-surface plans carry `surface.locator` plus `expectedFingerprint`; bootstrap plans carry neither.
- In caller input, use `{ "step": "...", "path": "..." }` only for raw prior-step outputs such as `routeId`.
- Named nodes in the same plan should be routed through `{ "ref": "..." }`, including earlier-step created refs such as `usersPage.tab` or `usersTable.viewUser.popupGrid`; `bindRefs` are only for already existing nodes on the current surface.
- `selectors.target/source` belong to the plan-step layer; do not mix low-level `target.uid` into plan-step `values`.
- Use `locator` inside `selectors` when the step points to an already existing surface or node.
- Any remaining `key` examples in low-level popup/block payloads below are local payload identifiers only. They are not the naming contract for `validatePlan` / `executePlan`, and they must not replace `ref` for plan chaining.

Common derived refs:

- `createPage(ref="usersPage")` -> `usersPage`, `usersPage.tab`, `usersPage.grid`
- block `ref="usersTable"` -> `usersTable`, `usersTable.grid`, `usersTable.item`, `usersTable.actionsColumn`
- field `ref="userDetails.username"` -> `userDetails.username`, `userDetails.username.field`, `userDetails.username.innerField`, plus popup refs when the field opens a popup
- action / recordAction `ref="usersTable.viewUser"` -> `usersTable.viewUser`, `usersTable.viewUser.assignForm`, `usersTable.viewUser.popupGrid`

## `catalog` request / response shape

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

Example with explicit `sections` override:

```json
{
  "requestBody": {
    "target": {
      "uid": "details-block-uid"
    },
    "sections": ["recordActions", "node"]
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

Notes:

- `scenario` and `selectedSections` are response metadata; they are not request-mode switches
- Depending on the target, `scenario.popup`, `scenario.fieldContainer`, and `scenario.actionContainer` may also appear
- `response.selectedSections` reports the effective section selection used by the backend

## Root-Level Locator `get`

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
- In popup scenarios, if the live environment only exposes `tabUid` or `gridUid`, they still go into `uid`

## `requestBody` Without `target`

These tools all have `requestBody`, but do not accept `requestBody.target.uid`:

| Semantic name | MCP tool | Key fields |
| --- | --- | --- |
| `createMenu` | `flow_surfaces_create_menu` | `requestBody.title`, optional `type/icon/tooltip/hideInMenu/parentMenuRouteId` |
| `updateMenu` | `flow_surfaces_update_menu` | `requestBody.menuRouteId`, optional `title/icon/tooltip/hideInMenu/parentMenuRouteId` |
| `createPage` | `flow_surfaces_create_page` | `requestBody.menuRouteId` initializes a bindable menu item; other common fields include `title/tabTitle/enableTabs` |
| `destroyPage` | `flow_surfaces_destroy_page` | `requestBody.uid`, which must be `pageUid` |
| `moveTab` | `flow_surfaces_move_tab` | `requestBody.sourceUid/targetUid/position`; outer tab uses `tabSchemaUid` directly |
| `removeTab` | `flow_surfaces_remove_tab` | `requestBody.uid`; outer tab uses `tabSchemaUid` directly |
| `movePopupTab` | `flow_surfaces_move_popup_tab` | `requestBody.sourceUid/targetUid/position` |
| `moveNode` | `flow_surfaces_move_node` | `requestBody.sourceUid/targetUid/position` |

Rules:

- These lifecycle APIs only wrap one `requestBody` at the MCP layer
- `createMenu`, `updateMenu`, and `createPage` do not accept `target`
- `createMenu(type="group")` only returns menu route information. It does not return a writable page target
- `createMenu(type="item")` may return `pageSchemaUid/pageUid/tabSchemaUid/routeId`, but the page may still be uninitialized. Do not call page/tab lifecycle APIs immediately
- `createPage(menuRouteId=...)` initializes the bindable menu item into a real Modern page(v2)
- The `pageUid` returned by `createPage` is used for page-level write APIs. `pageSchemaUid/tabSchemaUid/routeId` are for readback. `gridUid` is for subsequent content-area construction

## target-based `requestBody.target.uid`

These tools all require:

```json
{
  "requestBody": {
    "target": { "uid": "..." }
  }
}
```

### Common Groups of target-based Tools

- surface and lifecycle: `catalog`, `compose`, `configure`, `addTab`, `updateTab`, `addPopupTab`, `updatePopupTab`, `removePopupTab`
- content append: `addBlock` / `addBlocks`, `addField` / `addFields`, `addAction` / `addActions`, `addRecordAction` / `addRecordActions`
- merge-like configuration: `updateSettings`
- high-impact full-replace: `setEventFlows`, `setLayout`
- precise delete: `removeNode`
- high-end fallback entry: `apply`

### Common target choices

- `addTab.target.uid = pageUid`
- `updateTab.target.uid = tabSchemaUid`
- `addPopupTab.target.uid = popupPageUid`
- `updatePopupTab/removePopupTab.target.uid = popupTabUid`
- For route-backed content areas, the common `target.uid` is `gridUid`
- For popup content areas, the common `target.uid` is `popupGridUid`
- For outer-tab surface `catalog/configure`, the common `target.uid` is `tabSchemaUid`
- For popup-tab surface `catalog/configure`, the common `target.uid` is `popupTabUid`

Rules:

- `target` is part of the business payload, and the MCP layer wraps it again in `requestBody`
- For public-semantic `settings` keys, when to use `add* + settings`, and when to fall back to `configure/updateSettings`, see [settings.md](./settings.md)
- `pageSchemaUid` and `routeId` belong to `get` locators. Do not place them directly into `target.uid`
- `pageUid`, `gridUid`, `tabSchemaUid`, `popupPageUid`, `popupTabUid`, and `popupGridUid` are not interchangeable "generic target uids"
- `currentRecord` is neither a locator nor a `target.uid`; it is popup-internal block resource-binding semantics, and its decision flow lives in [popup.md](./popup.md)
- `mutate` is not part of this top-level `target.uid` group; it uses `requestBody.ops[]`, and each op decides for itself whether to carry `target`

### Minimal shape of popup-capable `addRecordAction` that does not depend on a live guard

When you want to create the opener and carry the popup subtree in one shot, and the popup content does not depend on popup `resourceBindings`, use this canonical shape:

```json
{
  "requestBody": {
    "target": { "uid": "details-block-uid" },
    "type": "popup",
    "settings": {
      "title": "Details"
    },
    "popup": {
      "mode": "replace",
      "blocks": [
        {
          "key": "help",
          "type": "markdown",
          "settings": {
            "content": "# Details Help"
          }
        }
      ]
    }
  }
}
```

If the write returns `popupPageUid` / `popupTabUid` / `popupGridUid`, all later writes should reuse those values directly rather than re-guessing the popup host.

### Template-aware payload placement

- For `addBlock`, `addBlocks`, and compose block specs, place the block template under `requestBody.template` (or the corresponding inner block spec)
- For `addField` and `addFields` when importing saved form-grid fields, place the fields template under `requestBody.template`
- For popup-capable actions and fields, place popup template reuse under `requestBody.popup.template`
- `configure` switches an existing popup template through `requestBody.changes.openView.template` when the live contract allows it
- For complete template envelopes, selection rules, and reference/copy semantics, see [templates.md](./templates.md)

### Minimal semantic `resource` shape for guard-sensitive popup-content

The following pattern should only be used after you already have `popupGridUid`, and after the popup-content `catalog` has confirmed that the relevant binding is available. `resource` should be semantic object form, not a fallback string. The examples below only show common bindings; for the full binding set and scene restrictions, see [popup.md](./popup.md).

`currentRecord`:

```json
{
  "requestBody": {
    "target": { "uid": "popup-grid-uid" },
    "mode": "append",
    "blocks": [
      {
        "key": "current-user-details",
        "type": "details",
        "resource": {
          "binding": "currentRecord"
        },
        "fields": ["nickname", "email"]
      }
    ]
  }
}
```

`associatedRecords`:

```json
{
  "requestBody": {
    "target": { "uid": "popup-grid-uid" },
    "mode": "append",
    "blocks": [
      {
        "key": "roles-table",
        "type": "table",
        "resource": {
          "binding": "associatedRecords",
          "associationField": "roles"
        },
        "fields": ["name", "title"],
        "recordActions": ["view"]
      }
    ]
  }
}
```

## Canonical payload for `context`

`flow_surfaces_context` is also a target-based `requestBody`, but commonly carries `path` / `maxDepth` in addition:

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
- Only pass `maxDepth` when you need to narrow the context tree; stop once you have enough information

For frequent `add* + settings` templates, see [settings.md](./settings.md). This file only keeps envelope / locator / target / high-risk payload shapes and does not expand public settings templates again.

## Canonical payload for `setLayout`

`setLayout` is a high-impact full-replace write path. Use it only when the user explicitly accepts whole replacement and you have already read the full current layout state. `rows` / `sizes` are easy to get wrong, so keep this mental model:

- `rows[rowKey]` describes which columns exist in that row
- each element of `rows[rowKey]` then describes which child uids exist in that column
- therefore: outer array length = column count = length of `sizes[rowKey]`
- `sizes[rowKey]` must be a one-dimensional `number[]`; do not write `[[8,16]]`

Quick translation from natural language to layout structure:

| User intent | Correct shape | Semantics |
| --- | --- | --- |
| two blocks side by side in one row | `row1: [["a"], ["b"]]` | two columns, one block per column |
| two blocks stacked in left column, one block in right column | `row1: [["a1", "a2"], ["b"]]` | two columns; left column stacks two items, right column has one item |
| two blocks in two vertical rows | `row1: [["a"]]`, `row2: [["b"]]` | two rows, one column in each row |

Correct shape for two columns with one child in each:

```json
{
  "requestBody": {
    "target": { "uid": "grid-uid" },
    "rowOrder": ["row1"],
    "rows": {
      "row1": [["chart-a"], ["chart-b"]]
    },
    "sizes": {
      "row1": [12, 12]
    }
  }
}
```

Key distinction:

- `[["chart-a"], ["chart-b"]]` = two columns
- `[["chart-a", "chart-b"]]` = one column stacking two children

So the following is wrong:

```json
{
  "rows": {
    "row1": [["chart-a", "chart-b"]]
  },
  "sizes": {
    "row1": [12, 12]
  }
}
```

Because it actually declares only 1 column while giving 2 column widths.

Another high-risk anti-pattern may not always be blocked by the server, but its runtime semantics are wrong:

```json
{
  "rows": {
    "row1": [["guide", "form"]]
  },
  "sizes": {
    "row1": [8]
  }
}
```

This does not produce "guide + form side by side". It produces "one left column with width 8, stacking both blocks vertically".

Another common mistake is writing `sizes` as a two-dimensional array:

```json
{
  "rows": {
    "row1": [["guide"], ["form"]]
  },
  "sizes": {
    "row1": [[8, 16]]
  }
}
```

This is also wrong at the contract level, because `sizes[rowKey]` only accepts one-dimensional `number[]`.

## `apply` / `mutate`

`apply(mode="replace")` and replace-style `mutate` are destructive paths. Use them only when the user explicitly requests subtree replacement, and explain the blast radius before writing.

`mcp__nocobase__flow_surfaces_apply`

```json
{
  "requestBody": {
    "target": { "uid": "table-block-uid" },
    "mode": "replace",
    "spec": { "subModels": {} }
  }
}
```

`mcp__nocobase__flow_surfaces_mutate`

```json
{
  "requestBody": {
    "atomic": true,
    "ops": [
      {
        "opId": "step1",
        "type": "<advanced-op>",
        "values": {}
      },
      {
        "opId": "step2",
        "type": "<advanced-op>",
        "values": {
          "someRef": { "ref": "step1.id" }
        }
      }
    ]
  }
}
```

Rules:

- `apply` only supports `mode = "replace"`
- `mutate` defaults to `atomic = true`
- Chain references inside `mutate` always use `{ "ref": "<opId>.<path>" }`
- The `mutate` snippet above only demonstrates request shape and chained references
- `apply(mode="replace")` and replace-style `mutate` are destructive request shapes and require full readback after execution

## Common Invalid Shapes

- passing `requestBody` or `target` into `get`
- treating `pageSchemaUid` / `routeId` as `target.uid`
- forgetting the outer `requestBody` on lifecycle APIs
- calling page/tab lifecycle APIs after `createMenu(type="item")` but before `createPage(menuRouteId=...)`
- hand-writing raw `{ "ref": "step.path" }` or `$ref` inside `validatePlan/executePlan` caller input instead of `{ "step": "...", "path": "..." }`
- passing `currentRecord` as a bare locator or `target.uid`
- placing `currentRecord` / `associatedRecords` directly into an inline popup subtree that has not gone through popup-content `catalog` validation
- writing popup-internal `resource` as a string, such as `resource: "currentRecord"` or `resource: "associatedRecords"`
- carrying a `popup` subtree but omitting `popup.mode`, then relying on runtime fallback; canonical skill payloads must explicitly write `append` or `replace`
- mixing `resource` and `resourceInit` on a popup collection block: semantic binding uses the `resource` object; non-popup or raw resource initialization uses `resourceInit`
- treating `settings.props.*`, `settings.decoratorProps.*`, or `settings.stepParams.*` as legal inputs to `add*`
- writing a two-column layout as `rows[rowKey] = [[a, b]]` while also passing `sizes[rowKey] = [12, 12]`
- making the top-level lengths of `rows[rowKey]` and `sizes[rowKey]` inconsistent
- miswriting the user's "side by side in one row" intent as a single cell such as `rows[rowKey] = [[left, right]]`
- writing `sizes[rowKey]` as a two-dimensional array such as `[[8, 16]]`
