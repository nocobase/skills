# Public settings

Read this file first when you already know you are creating a block / field / action / record action, and the user also requires frequent public attributes such as title, label, required, or button style. The goal is to inline public semantic `settings` directly into `add*`, rather than creating an empty node first and then mechanically adding a separate `configure`. Whether `catalog` is mandatory is governed by [normative-contract.md](./normative-contract.md).

Canonical front door is `nb api flow-surfaces`. This file is for **low-level write APIs** such as `add-*`, `configure`, `update-settings`, `set-layout`, and `set-event-flows`. JSON examples below use the nb raw body. For body details, see [tool-shapes.md](./tool-shapes.md). It is not the authoring guide for the public whole-page `applyBlueprint` JSON blueprint.

## Contents

1. Core rules
2. Decision matrix
3. Legal shapes of `settings`
4. High-impact reminders
5. Layout replacement
6. Event-flow replacement
7. Frequent templates
8. When not to force something into `settings`
9. Readback mental model

## Core Rules

1. If the current change needs live `configureOptions` / `settingsContract` to determine which public fields exist, read `catalog({ target })` first via [normative-contract.md](./normative-contract.md). The decision should consider both target-level `configureOptions` and item-level `configureOptions`.
2. CLI `settings` must only contain public semantic keys. Do not write raw `props / decoratorProps / stepParams / flowRegistry / wrapperProps / fieldProps`.
3. Do not copy low-level `settings/configure` shapes back into the public page blueprint. Public `applyBlueprint` uses its own structure-first JSON contract.
4. If the user's requirement can be fully expressed through `settings`, do `add* + settings` directly. Do not add an extra `configure`.
5. If only part of the fields can be inlined, do `add* + settings` first, then use `configure(changes)` to fill the remaining public fields.
6. Only fall back to `update-settings` for path-level contracts. Layout and event flows still use dedicated APIs.
7. If live `catalog.configureOptions` has clearly exposed a key but this file does not list it, do not automatically degrade to `update-settings`. Prefer `add* + settings` or `configure(changes)` first.

## Decision Matrix

| Requirement type | Default entry | When to use |
| --- | --- | --- |
| create node + frequent public attributes | `add* + settings` | the target fields have already been exposed as public semantics in the live environment; if confirmation is needed, read `catalog` first via normative contract |
| small update to an existing node | `configure(changes)` | still within public semantic fields, but the node does not need to be recreated |
| switch an existing relation field presentation | `configure(changes)` on `wrapperUid` | use flat `fieldType` with optional `fields` / `titleField`; for `picker`, `fields` configures the selector table columns; use `popupSubTable` for 弹窗子表格 and `subTable` only for inline/editable subtable; do not send internal model keys |
| path-level fine-grained patch | `update-settings` | the live environment only exposes a domain contract, without a public semantic entry |
| layout | `set-layout` | only when the user explicitly accepts whole-layout replacement and the full current layout has already been read back |
| event flows | `set-event-flows` | only when the user explicitly accepts full instance-level flow replacement and the full current flow has already been read back |

## High-Impact Reminders

- `set-layout` and `set-event-flows` are not ordinary patches. Both are high-impact full-replace APIs.
- Do not default to them just because "only one layout item" or "only one flow" is changing. If the user is not asking for whole replacement, prefer `compose/add*`, `configure`, or `update-settings` instead.
- Once you use them, read the full current state before writing, and validate against the full post-write state. Do not rely on local delta only.

## Layout Replacement

Use `set-layout` when the target grid already exists and the user explicitly accepts full layout replacement.

Core rules:

- Preferred CLI family is `nb api flow-surfaces set-layout`.
- Low-level `set-layout` is **not** the public page/popup/fields layout contract. Do not reuse `{ rows: [[{ key, span }]] }` here.
- `target.uid` must be the live grid uid from readback, not a page/popup block `key`.
- `rows` is `Record<string, string[][]>`: each row value is an array of column cells, and each cell is an array of stacked live child `uid`s.
- `sizes` is `Record<string, number[]>`: each row's sizes array must stay aligned with that row's column-cell count, and `rows` / `sizes` must use the same row keys.
- `rowOrder` is optional; if provided, it must list every `rows` key exactly once.
- `[[details-uid], [roles-table-uid]]` with `[12, 12]` means one row with two columns.
- `[[details-uid, roles-table-uid]]` with `[24]` means one column with two vertically stacked blocks.
- Before the real write, pass the raw `set-layout` body through the local preflight/guard when available so one-dimensional `rows`, nested `sizes`, row/size count mismatches, and `rowOrder` mismatches fail locally instead of surfacing as a misleading runtime layout.
- Keep [tool-shapes.md](./tool-shapes.md) as the canonical full transport example. This section keeps only the minimum mental model and anti-examples.

Minimal same-row two-column example:

```json
{
  "target": { "uid": "popup-grid-uid" },
  "rows": {
    "row1": [
      ["details-uid"],
      ["roles-table-uid"]
    ]
  },
  "sizes": {
    "row1": [12, 12]
  },
  "rowOrder": ["row1"]
}
```

Representative wrong shape:

```json
{
  "target": { "uid": "popup-grid-uid" },
  "rows": {
    "row1": ["details-uid", "roles-table-uid"]
  },
  "sizes": {
    "row1": [12, 12]
  }
}
```

For the full transport shape and additional anti-examples, see [tool-shapes.md](./tool-shapes.md).

## Event-flow Replacement

Use `set-event-flows` when the target already exists and the user explicitly accepts whole instance-level event-flow replacement.

Core rules:

- Preferred CLI family is `nb api flow-surfaces set-event-flows`.
- Preferred body key is `flowRegistry`; `flows` is only a tolerated alias.
- Always read the full current target first, then preserve the existing `flowRegistry` object shape unless the user explicitly wants a full redesign.
- For `Execute JavaScript` steps, validate the code first through [js.md](./js.md), [js-surfaces/event-flow.md](./js-surfaces/event-flow.md), and [runjs-runtime.md](./runjs-runtime.md), then write the validated code back into the existing step's `params.code`.
- Do not invent event names, flow keys, step keys, or step payload shapes locally when the live readback has not shown them yet.
- If `on` is an object instead of a bare string, preserve its `eventName / phase / flowKey / stepKey` structure from readback.

nb body shape:

```json
{
  "target": { "uid": "submit-action-uid" },
  "flowRegistry": {
    "submitFlow": {
      "key": "submitFlow",
      "on": "click",
      "steps": {
        "runJsStep": {
          "params": {
            "code": "ctx.message.success(ctx.t('Saved'));\nawait ctx.resource?.refresh?.();"
          }
        }
      }
    }
  }
}
```

Notes:

- `submitFlow` and `runJsStep` above are placeholders for the live keys you first read back from the target.
- When binding relative to a built-in flow or built-in step, `on` may need the object form:

```json
{
  "on": {
    "eventName": "submit",
    "phase": "beforeStep",
    "flowKey": "formSettings",
    "stepKey": "refresh"
  }
}
```

- If the current target has no event-flow definitions yet, first create or inspect one through the live product/runtime path, then reuse that readback shape instead of guessing a brand-new step schema from prose alone.

## Legal Shapes of `settings`

`settings` and `configure(changes)` share the same public semantic layer. They should not leak internal tree structure.

Valid examples:

```json
{
  "settings": {
    "title": "Create User",
    "displayTitle": true
  }
}
```

```json
{
  "settings": {
    "label": "Password",
    "required": true
  }
}
```

```json
{
  "settings": {
    "title": "Submit",
    "type": "primary"
  }
}
```

```json
{
  "target": { "uid": "details-item-wrapper-uid" },
  "changes": {
    "fieldType": "popupSubTable",
    "fields": ["title", "name"]
  }
}
```

Notes:

- For relation field presentation switching, prefer targeting the field wrapper rather than the inner field.
- `popupSubTable` means 弹窗子表格 / popup editing. `subTable` means 编辑子表格 / inline editing.
- After writing, always read back both the wrapper and the inner field to confirm that the server rebuilt the field sub-model instead of leaving stale UI structure behind.
- For `picker` and `popupSubTable`, `fields` also configures the select-popup table under inner field `subModels["grid-block"]`. Persisted readback should show exactly one selector table item using `TableSelectModel`; if it shows ordinary `TableBlockModel`, treat that as a live repair gap because row selection will not receive the popup's `rowSelectionProps`.

Invalid:

```json
{
  "settings": {
    "props": {
      "title": "Create User"
    }
  }
}
```

```json
{
  "settings": {
    "stepParams": {
      "buttonSettings": {
        "general": {
          "title": "Submit"
        }
      }
    }
  }
}
```

```json
{
  "settings": {
    "rows": {
      "row1": ["a", "b"]
    },
    "flowRegistry": {}
  }
}
```

## Frequent Templates

### `add-block`

Create `createForm` and give it a title directly:

```json
{
  "target": { "uid": "grid-uid" },
  "type": "createForm",
  "resourceInit": {
    "dataSourceKey": "main",
    "collectionName": "users"
  },
  "settings": {
    "title": "Create User",
    "displayTitle": true
  }
}
```

When `add-block` creates a direct non-template public `table` / `list` / `gridCard` / `calendar` / `kanban`, keep a non-empty `defaultFilter` at the top level of that block-create envelope. Prefer 3 to 4 common business fields when metadata supports them; if fewer than 3 suitable candidates exist, cover every available candidate instead. Do not move it into `settings.defaultFilter`; template-backed imports do not accept block-level `defaultFilter` or `defaultActionSettings`.

When `add-block` creates a public `calendar`, keep collection binding in `resourceInit`, keep main-block field bindings in block `settings`, and do not try to inline popup content fields onto the main block. Hidden quick-create / event popups live under `settings.quickCreatePopup` and `settings.eventPopup`.

When `add-block` creates a public `kanban`, keep collection binding in `resourceInit`, keep card content on top-level `fields[]`, and keep grouped form/details content in `settings.quickCreatePopup` / `settings.cardPopup` instead of main-block `fieldGroups` / `recordActions`.

```json
{
  "target": { "uid": "grid-uid" },
  "type": "table",
  "resourceInit": {
    "dataSourceKey": "main",
    "collectionName": "users"
  },
  "defaultFilter": {
    "logic": "$and",
    "items": [
      { "path": "nickname", "operator": "$includes", "value": "" },
      { "path": "email", "operator": "$includes", "value": "" },
      { "path": "status", "operator": "$eq", "value": "" }
    ]
  },
  "settings": {
    "title": "Users"
  }
}
```

Common settings that are suitable for direct inline use:

- generic card-like block: `title`, `displayTitle`, `height`, `heightMode`
- `table`: `quickEdit`, `treeTable`, `defaultExpandAllRows`, `dragSort`, `dragSortBy`
- `calendar`: `titleField`, `colorField`, `startField`, `endField`, `defaultView`, `quickCreateEvent`, `showLunar`, `weekStart`, `dataScope`, `linkageRules`, `quickCreatePopup`, `eventPopup`
- `kanban`: `groupField`, `quickCreateEnabled`, `quickCreatePopup`, `enableCardClick`, `cardPopup`, `dataScope`, `linkageRules`
- form-like blocks: `labelWidth`, `labelWrap`, `layout`, `labelAlign`, `colon`

Do not copy `displayTitle` into block families whose runtime configureOptions do not expose it. Known unsupported cases include `chart` and `tree`; chart blocks accept `title`, `height`, `heightMode`, `query`, `visual`, and `events` instead.

Height settings:

- If you set a numeric `height`, pair it with `heightMode: "specifyValue"` so the frontend uses the value.
- The local prepare-write and localized preflight helpers auto-add `heightMode: "specifyValue"` when `height` is present and `heightMode` is omitted.
- Do not override explicit `heightMode: "defaultHeight"` or `"fullHeight"` just because a stale payload also contains `height`.

Calendar reminders:

- `settings.startField` and `settings.endField` must bind date-capable non-association fields.
- `settings.titleField` and `settings.colorField` must bind existing non-association display fields.
- Public main calendar blocks do not accept `fields`, `fieldGroups`, or `recordActions`; event forms/details belong in the quick-create and event-view popup hosts.
- Whole-page `create` prepare-write auto-adds missing direct non-template calendar hidden popup settings as `{ tryTemplate: true }`. Keep helper-only popup materialization, metadata discovery, defaults completeness, and strict binding validation in [helper-contracts.md](./helper-contracts.md).

Kanban reminders:

- Public main kanban blocks may use `fields[]`, but do not accept `fieldGroups`, `fieldsLayout`, or `recordActions`.
- Quick-create content belongs in `settings.quickCreatePopup`; card click/view content belongs in `settings.cardPopup`.
- Whole-page `create` prepare-write auto-adds missing direct non-template kanban hidden popup settings as `{ tryTemplate: true }`, defaults missing `quickCreateEnabled` / `enableCardClick` to `true`, and preserves explicit overrides. Keep helper-only metadata/defaults behavior and explicit `groupField` validation in [helper-contracts.md](./helper-contracts.md).

### `add-field`

When creating a field bound to a real field, `fieldPath` is a required creation parameter. Label, required, and similar attributes belong to `settings`:

```json
{
  "target": { "uid": "form-uid" },
  "fieldPath": "password",
  "settings": {
    "label": "Password",
    "required": true
  }
}
```

Only the batch shape of `add-fields` uses `fields: []`:

```json
{
  "target": { "uid": "form-uid" },
  "fields": [
    {
      "fieldPath": "password",
      "settings": {
        "label": "Password",
        "required": true
      }
    }
  ]
}
```

If you are creating a synthetic standalone field such as `jsColumn` / `jsItem`, omitting the real `fieldPath` is allowed. Whether it is allowed still depends on live `catalog`.

Common field settings suitable for direct inline use:

- `label`
- `showLabel`
- `required`
- `disabled`
- `tooltip`
- `extra`

### `add-action`

Create a submit button and set its title and type directly:

```json
{
  "target": { "uid": "form-uid" },
  "type": "submit",
  "settings": {
    "title": "Submit",
    "type": "primary"
  }
}
```

When the action can open a popup, keep popup/template routing beside `settings`, not inside it:

```json
{
  "target": { "uid": "users-table-uid" },
  "type": "addNew",
  "settings": {
    "title": "Create user",
    "icon": "PlusOutlined",
    "type": "primary"
  },
  "popup": {
    "tryTemplate": true
  }
}
```

Common action settings suitable for direct inline use:

- `title`
- `tooltip`
- `icon`
- `type`
- `color`
- `danger`
- `confirm`
- `editMode`
- `updateMode`
- `duplicateMode`
- `collapsedRows`
- `defaultCollapsed`
- `emailFieldNames`
- `defaultSelectAllRecords`

Notes:

- `popup`, `popup.template`, `popup.tryTemplate`, and `popup.saveAsTemplate` are sibling write fields, not `settings` keys.
- For popup-capable localized writes without an explicit `popup.template`, default to `popup.tryTemplate=true`, including cases that also carry `popup.saveAsTemplate`.
- If the first local popup should immediately become reusable, use `popup.saveAsTemplate={ name, description }` together with explicit local `popup.blocks`; it cannot be combined with `popup.template`, and with `popup.tryTemplate=true` it acts on the local miss fallback rather than blocking template reuse.

### `add-record-action`

Create a record-level view action and give it a title directly:

```json
{
  "target": { "uid": "table-uid" },
  "type": "view",
  "settings": {
    "title": "View"
  }
}
```

If the goal is a standard details popup on a shown title/name field, prefer field/openView configuration over a duplicated `view` record action. When a real record action is still needed, popup routing stays outside `settings`:

```json
{
  "target": { "uid": "users-table-uid" },
  "type": "edit",
  "settings": {
    "title": "Edit",
    "icon": "EditOutlined",
    "type": "primary"
  },
  "popup": {
    "tryTemplate": true
  }
}
```

`addChild` uses the same `add-record-action + settings` shape, but it is only valid when the live target `catalog.recordActions` exposes it for a tree collection table with `treeTable` enabled:

```json
{
  "target": { "uid": "tree-table-uid" },
  "type": "addChild",
  "settings": {
    "title": "Add child"
  }
}
```

### Update action field assignment

Use public `settings.assignValues` only. Do not create/update `AssignFormGridModel` / `AssignFormItemModel`, do not write raw `flowModels`, and do not try to configure this with `add-fields`.

`bulkUpdate` is a collection action, so it belongs under block `actions` or `add-action`:

```json
{
  "target": { "uid": "users-table-uid" },
  "type": "bulkUpdate",
  "settings": {
    "assignValues": {
      "priority": "high",
      "isTracking": true
    }
  }
}
```

`updateRecord` is a record action, so it belongs under `recordActions` or `add-record-action`:

```json
{
  "target": { "uid": "users-table-uid" },
  "type": "updateRecord",
  "settings": {
    "assignValues": {
      "status": "active"
    }
  }
}
```

For existing update actions, `configure` uses the same key:

```json
{
  "target": { "uid": "update-action-uid" },
  "changes": {
    "assignValues": {}
  }
}
```

`assignValues` must be a plain object keyed by fields in the host collection metadata. `{}` is valid and clears the persisted assignment.

Readback rule for localized creates:

- `table` / `list` / `gridCard` / `calendar` / `kanban` may already come back with merged `filter` + `addNew` + `refresh`.
- `details` may already come back with merged `edit`.
- After `add-block`, `compose`, `add-action`, or `add-record-action`, inspect the persisted action list and popup/template binding before adding "missing" actions or extra popup writes.

## When Not to Force Something into `settings`

- live `catalog.configureOptions` does not expose the field
- it is layout data such as `rows / sizes / rowOrder`
- it is event flow or `flowRegistry`
- it is an explicit path-level domain patch
- it is popup subtree content rather than a public attribute of the current node

## Readback Mental Model

The write layer only cares about public semantics. The readback layer may inspect how the server mirrored them into internal structure.

Common phenomena:

- `required` may be mirrored into both `props` and `stepParams`
- button `title/type` may be mirrored into both `props` and `stepParams.buttonSettings.general`
- outer block display config may be mirrored into `props`, `decoratorProps`, or another runtime domain

Do not reverse those internal readback structures into the input template for the next creation.
