# Public settings

Read this file first when you already know you are creating a block / field / action / record action, and the user also requires frequent public attributes such as title, label, required, or button style. The goal is to inline public semantic `settings` directly into `add*`, rather than creating an empty node first and then mechanically adding a separate `configure`. Whether `catalog` is mandatory is governed by [normative-contract.md](./normative-contract.md).

Agent-facing front door is `nb api flow-surfaces <action>`. This file is for **low-level write APIs** such as `add-*`, `configure`, `update-settings`, `set-layout`, `get-event-flow-meta`, `add-event-flow`, `set-event-flow`, `remove-event-flow`, and `set-event-flows`. JSON examples below use the raw business object passed through `--body` / `--body-file`. For body details, see [tool-shapes.md](./tool-shapes.md). It is not the authoring guide for the public whole-page `applyBlueprint` JSON blueprint.

## Contents

1. Core rules
2. Decision matrix
3. Legal shapes of `settings`
4. High-impact reminders
5. Layout replacement
6. Event-flow discovery and writes
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
| localized event flow edit | `get-event-flow-meta` -> `add-event-flow` / `set-event-flow` / `remove-event-flow` | default path for adding, updating, or deleting one flow while preserving neighbors |
| event-flow replacement | `set-event-flows` | only when the user explicitly accepts full instance-level flow replacement and the full current flow has already been read back |

## High-Impact Reminders

- `set-layout` and `set-event-flows` are not ordinary patches. Both are high-impact full-replace APIs.
- Do not default to them just because "only one layout item" or "only one flow" is changing. If the user is not asking for whole replacement, prefer `compose/add*`, `configure`, `update-settings`, or the fine-grained event-flow APIs instead.
- Once you use them, read the full current state before writing, and validate against the full post-write state. Do not rely on local delta only.

### JSBlock Settings

Localized `jsBlock` create / compose writes use only the inline public shape:

```json
{
  "type": "jsBlock",
  "settings": {
    "title": "KPI Cards",
    "version": "v2",
    "code": "ctx.render(<div>Hello</div>);"
  }
}
```

The inline `settings.code` is required for new localized JSBlocks; do not create title-only JSBlocks and rely on default template code.

Localized `configure` for an existing JSBlock uses direct `changes.code` and `changes.version`:

```json
{
  "target": { "uid": "existing-js-block-uid" },
  "changes": {
    "title": "KPI Cards",
    "version": "v2",
    "code": "ctx.render(<div>Hello</div>);"
  }
}
```

Do not use block top-level `code`, block top-level `version`, `script`, or internal readback fields such as `stepParams`, `props`, `decoratorProps`, or `flowRegistry` in localized `compose` / `add-block` bodies. In `configure`, do not use `changes.settings`, `changes.script`, or internal persisted fields; use direct `changes.code` / `changes.version`. `script` is reserved for whole-page `applyBlueprint` with `assets.scripts`.

## Layout Replacement

Use `set-layout` when the target grid already exists and the user explicitly accepts full layout replacement.

Core rules:

- Preferred agent entry is `nb api flow-surfaces set-layout`.
- Low-level `set-layout` is **not** the public page/popup/fields layout contract. Do not reuse `{ rows: [[{ key, span }]] }` here.
- `target.uid` must be the live grid uid from readback, not a page/popup block `key`.
- `rows` is `Record<string, string[][]>`: each row value is an array of column cells, and each cell is an array of stacked live child `uid`s.
- `sizes` is `Record<string, number[]>`: each row's sizes array must stay aligned with that row's column-cell count, and `rows` / `sizes` must use the same row keys.
- `rowOrder` is optional; if provided, it must list every `rows` key exactly once.
- `[[details-uid], [roles-table-uid]]` with `[12, 12]` means one row with two columns.
- `[[details-uid, roles-table-uid]]` with `[24]` means one column with two vertically stacked blocks.
- Before persistence, backend service-level layout validation (`contractGuard.validateLayout`) rejects one-dimensional `rows`, nested `sizes`, row/size count mismatches, and `rowOrder` mismatches; `set-layout` is not part of the aggregate authoring validation entrypoints.
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

## Event-flow Discovery And Writes

Default localized event-flow route:

1. Read `get-event-flow-meta` for the target uid.
2. Use returned `events`, `phases`, `stepActions`, `vars`, current `flowRegistry`, and `fingerprint`.
3. For one new flow, use `add-event-flow`. MVP creation defaults to and only supports `beforeAllFlows`.
4. For one exact replacement, use `set-event-flow`.
5. For one deletion, use `remove-event-flow`.

Minimal `add-event-flow` body:

```json
{
  "target": { "uid": "employee-form-uid" },
  "key": "submitGuard",
  "eventName": "submit",
  "steps": {
    "runGuard": {
      "use": "runjs",
      "defaultParams": {
        "code": "ctx.message.success(ctx.t('Saved'));"
      }
    }
  },
  "condition": {
    "logic": "$and",
    "items": []
  },
  "expectedFingerprint": "fingerprint-from-get-event-flow-meta"
}
```

Notes:

- `condition` persists to `on.defaultParams.condition`.
- New `Execute JavaScript` steps use `use: "runjs"` and `defaultParams.code`.
- Use `expectedFingerprint` from `get-event-flow-meta` when you are guarding against concurrent edits.
- `add-event-flow` is for new `beforeAllFlows` flows. For `beforeStep`, `afterStep`, `beforeFlow`, `afterFlow`, or preserving an unusual existing shape, use `set-event-flow` with the full single flow object read from or designed against meta.

## Event-flow Replacement

Use `set-event-flows` when the target already exists and the user explicitly accepts whole instance-level event-flow replacement.

Core rules:

- Preferred agent entry is `nb api flow-surfaces set-event-flows`.
- Preferred body key is `flowRegistry`; `flows` is only a tolerated alias.
- Prefer `get-event-flow-meta` plus `add-event-flow` / `set-event-flow` / `remove-event-flow` for localized edits.
- Always read the full current target first, then preserve the existing `flowRegistry` object shape unless the user explicitly wants a full redesign.
- Frontend-created event-flow steps use `use` for the action name and `defaultParams` for that action's settings. Do not author new event-flow steps with `name` / `params`.
- For `Execute JavaScript` steps, prepare the code through [js.md](./js.md) and [js-surfaces/event-flow.md](./js-surfaces/event-flow.md), then write it back into the existing step's `defaultParams.code`.
- Do not invent event names, flow keys, step keys, or step payload shapes locally when the live readback has not shown them yet.
- If `on` is an object instead of a bare string, preserve its `eventName / phase / flowKey / stepKey / defaultParams` structure from readback. Event trigger conditions live under `on.defaultParams.condition`.

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
          "use": "runjs",
          "defaultParams": {
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
- Frontend save/readback may include each step's `key`, `flowKey`, and `sort`; preserve them when present.
- When binding relative to a built-in flow or built-in step, `on` may need the object form:

```json
{
  "on": {
    "eventName": "submit",
    "phase": "beforeStep",
    "flowKey": "formSettings",
    "stepKey": "refresh",
    "defaultParams": {
      "condition": {
        "logic": "$and",
        "items": []
      }
    }
  }
}
```

- If the current target has no event-flow definitions yet, first create or inspect one through the live product/runtime path, then reuse that readback shape instead of guessing a brand-new `flowRegistry` from prose alone.

Common dynamic step actions for interpreting readback and preserving existing step settings:

- `runjs`: `defaultParams.code`
- `refreshTargetBlocks`: `defaultParams.targets`
- `navigateToURL`: `defaultParams.value.url`, `defaultParams.value.searchParams`, `defaultParams.value.openInNewWindow`
- `showMessage`: `defaultParams.value.type`, `defaultParams.value.content`, `defaultParams.value.duration`
- `showNotification`: `defaultParams.value.type`, `defaultParams.value.title`, `defaultParams.value.description`, `defaultParams.value.duration`, `defaultParams.value.placement`
- `setTargetDataScope`: `defaultParams.targetBlockUid`, `defaultParams.filter`
- `customVariable`: `defaultParams.variables`

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

When `add-block` creates a direct non-template public `table` / `list` / `gridCard` / `calendar` / `kanban`, `defaultFilter` may be omitted; backend authoring materializes one from live metadata with up to 4 scalar/filterable fields. Keep an explicit override top-level on the block-create envelope, not in `settings.defaultFilter`, and make it concrete, metadata-valid, and backed by at least the smaller of 3 and the collection's eligible direct interface-field count. Relation filters must use a child path such as `department.title`, not the relation field itself. Template-backed imports do not accept block-level `defaultFilter` or `defaultActionSettings`.

When `add-block` creates a public `calendar`, keep collection binding in `resourceInit`, keep main-block field bindings in block `settings`, and do not try to inline popup content fields onto the main block. Hidden quick-create / event popups live under `settings.quickCreatePopup` and `settings.eventPopup`.

When `add-block` creates a public `kanban`, keep collection binding in `resourceInit`, keep card content on top-level `fields[]`, and keep grouped form/details content in `settings.quickCreatePopup` / `settings.cardPopup` instead of main-block `fieldGroups` / `recordActions`. The 2-field main-card cap is specific to direct non-template whole-page `applyBlueprint`; low-level `add-block` / `compose` keeps the existing Kanban field behavior.

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
- `kanban`: `groupField`, `dragEnabled`, `dragSortBy`, `quickCreateEnabled`, `quickCreatePopup`, `enableCardClick`, `cardPopup`, `dataScope`, `linkageRules`
- form-like blocks: `labelWidth`, `labelWrap`, `layout`, `labelAlign`, `colon`

Do not copy `displayTitle` into block families whose runtime configureOptions do not expose it. Known unsupported cases include `chart` and `tree`; chart blocks accept `title`, `height`, `heightMode`, `query`, `visual`, and `events` instead.

Height settings:

- If you set a numeric `height`, pair it with `heightMode: "specifyValue"` so the frontend uses the value.
- Backend authoring normalizes compatible height settings; local helpers are optional planning aids only.
- Do not override explicit `heightMode: "defaultHeight"` or `"fullHeight"` just because a stale payload also contains `height`.

Calendar reminders:

- `settings.startField` and `settings.endField` must bind date-capable non-association fields.
- `settings.titleField` and `settings.colorField` must bind existing non-association display fields.
- Public main calendar blocks do not accept `fields`, `fieldGroups`, or `recordActions`; event forms/details belong in the quick-create and event-view popup hosts.
- Backend authoring may materialize missing direct non-template calendar hidden popup settings as `{ tryTemplate: true }`. See [helper-contracts.md](./helper-contracts.md) for backend-owned defaulting and validation boundaries.

Kanban reminders:

- Public main kanban blocks may use `fields[]`, but do not accept `fieldGroups`, `fieldsLayout`, or `recordActions`.
- Direct non-template whole-page `applyBlueprint` kanban main blocks are capped at 2 card `fields[]`; omitted fields are auto-selected from live metadata, while explicit overflow returns `kanban-main-fields-too-many`. This cap does not apply to low-level `add-block` / `compose`.
- Whole-page `applyBlueprint` kanban defaults `dragEnabled=true`. Provide `dragSortBy` only when it is a sort field scoped to the current/effective `groupField`; otherwise omit it and let the backend create a hidden sort field for writable main datasource collections. Set `dragEnabled=false` only when the page intentionally disables drag sorting.
- Quick-create content belongs in `settings.quickCreatePopup`; card click/view content belongs in `settings.cardPopup`.
- Backend authoring may materialize missing direct non-template kanban hidden popup settings as `{ tryTemplate: true }`, default missing `quickCreateEnabled` / `enableCardClick` to `true`, and preserve explicit overrides. See [helper-contracts.md](./helper-contracts.md) for backend-owned defaulting and validation boundaries.

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

When live collection metadata exposes a field `description`, use it as the first source for these form-field settings. For arbitrary languages, the agent/LLM should extract intent into structured public settings and field-linkage rules; carry that intent as `descriptionBehavior.{settings,linkage}` when metadata needs an intermediate shape. Deterministic runtime extraction is only a conservative fallback and should not grow into language-specific keyword coverage. Convert only clear static hints directly: required wording maps to `required`, low-risk length / range / regex / count constraints map to `rules` or `maxCount`, and explanatory text maps to `tooltip` / `extra`. Conditional same-form behavior belongs to field linkage rules rather than ad-hoc settings. If the description refers to fields by UI title/label instead of field name, resolve those labels from live metadata before writing the linkage. Resolve condition values through live option `value` / localized `label` metadata when possible. The automatic description-derived reaction path may target any keyed form block inside the same local popup chain when the popup has local `blocks`; backend-generated add/edit popups receive the same rules through `defaults.collections.<collection>.formBehavior.addNew/edit.fieldLinkageRules`. Every described generated add/edit candidate field must then be accounted for either by structured `formBehavior` coverage or by sibling `formBehaviorDescriptionReview.fields.<field> = { decision, reasonCode? }`: `implemented` requires coverage, and conditional required/disabled/hidden descriptions require linkage coverage specifically, not just `extra` helper text. `noUiBehavior` / `unsupported` require a valid reason. Do not use old `fields[]`, `hasTried`, `formBehavior: {}`, or no-op `null`.

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
- `iconOnly`
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
- If the user asks for a `图标按钮` / `icon button` / `仅图标` action and does not specify visible button text, set `settings.icon` and `settings.iconOnly: true`, and omit `settings.title` instead of inferring a title from the action purpose. If the user explicitly gives button text / label / title, keep it as `settings.title`.
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

Icon-only record actions omit `title` when no button text was requested:

```json
{
  "target": { "uid": "users-table-uid" },
  "type": "edit",
  "settings": {
    "icon": "EditOutlined",
    "iconOnly": true
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

### Submit/update workflow bindings

Use public `settings.triggerWorkflows` for new submit/update actions, or `configure.changes.triggerWorkflows` for existing action nodes. Do not write raw `flowModels` or internal `stepParams` for this binding.

Supported targets:

- form submit actions under `createForm` / `editForm` / form action containers
- record `updateRecord` actions under `recordActions` or `add-record-action`

`bulkUpdate`, filter-form submit, and standalone `triggerWorkflow` actions do not use this field. Each row is `{ "workflowKey": "<key>", "context": "<optional path>" }`. `workflowKey` must be a non-empty string, `context` is optional string, `[]` clears bindings, and `null` is invalid. Do not require workflow metadata during authoring; validate only shape and target.

```json
{
  "type": "submit",
  "settings": {
    "triggerWorkflows": [
      { "workflowKey": "employee_created" }
    ]
  }
}
```

```json
{
  "type": "updateRecord",
  "settings": {
    "assignValues": {
      "status": "active"
    },
    "triggerWorkflows": [
      { "workflowKey": "employee_status_changed", "context": "department" }
    ]
  }
}
```

```json
{
  "target": { "uid": "submit-action-uid" },
  "changes": {
    "triggerWorkflows": []
  }
}
```

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
