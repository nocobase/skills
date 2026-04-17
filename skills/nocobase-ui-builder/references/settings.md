# Public settings

Read this file first when you already know you are creating a block / field / action / record action, and the user also requires frequent public attributes such as title, label, required, or button style. The goal is to inline public semantic `settings` directly into `add*`, rather than creating an empty node first and then mechanically adding a separate `configure`. Whether `catalog` is mandatory is governed by [normative-contract.md](./normative-contract.md).

Canonical front door is `nocobase-ctl flow-surfaces`. This file is for **low-level write APIs** such as `add-*`, `configure`, `update-settings`, `set-layout`, and `set-event-flows`. JSON examples below default to the CLI raw body unless a block is explicitly labeled as MCP fallback. For CLI/MCP envelope mapping, see [tool-shapes.md](./tool-shapes.md). It is not the authoring guide for the public whole-page `applyBlueprint` JSON blueprint.

## Contents

1. Core rules
2. Decision matrix
3. Legal shapes of `settings`
4. High-impact reminders
5. Event-flow replacement
6. Frequent templates
7. When not to force something into `settings`
8. Readback mental model

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
| switch an existing field wrapper to another public field component | `configure(changes)` on `wrapperUid` | use this first for requests such as "change the existing roles field into sub-table display", especially when the live wrapper contract exposes `fieldComponent` |
| path-level fine-grained patch | `update-settings` | the live environment only exposes a domain contract, without a public semantic entry |
| layout | `set-layout` | only when the user explicitly accepts whole-layout replacement and the full current layout has already been read back |
| event flows | `set-event-flows` | only when the user explicitly accepts full instance-level flow replacement and the full current flow has already been read back |

## High-Impact Reminders

- `set-layout` and `set-event-flows` are not ordinary patches. Both are high-impact full-replace APIs.
- Do not default to them just because "only one layout item" or "only one flow" is changing. If the user is not asking for whole replacement, prefer `compose/add*`, `configure`, or `update-settings` instead.
- Once you use them, read the full current state before writing, and validate against the full post-write state. Do not rely on local delta only.

## Event-flow Replacement

Use `set-event-flows` when the target already exists and the user explicitly accepts whole instance-level event-flow replacement.

Core rules:

- Preferred CLI family is `nocobase-ctl flow-surfaces set-event-flows`.
- Preferred body key is `flowRegistry`; `flows` is only a tolerated alias.
- Always read the full current target first, then preserve the existing `flowRegistry` object shape unless the user explicitly wants a full redesign.
- For `Execute JavaScript` steps, validate the code first through [js.md](./js.md) and [runjs-runtime.md](./runjs-runtime.md), then write the validated code back into the existing step's `params.code`.
- Do not invent event names, flow keys, step keys, or step payload shapes locally when the live readback has not shown them yet.
- If `on` is an object instead of a bare string, preserve its `eventName / phase / flowKey / stepKey` structure from readback.

CLI body shape:

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
    "fieldComponent": "DisplaySubTableFieldModel"
  }
}
```

Notes:

- For field-component switching, prefer targeting the field wrapper rather than the inner field.
- After writing, always read back both the wrapper and the inner field to confirm that the server rebuilt the field sub-model instead of leaving stale UI structure behind.

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

Common settings that are suitable for direct inline use:

- generic block: `title`, `displayTitle`, `height`, `heightMode`
- `table`: `quickEdit`, `treeTable`, `defaultExpandAllRows`, `dragSort`, `dragSortBy`
- form-like blocks: `labelWidth`, `labelWrap`, `layout`, `labelAlign`, `colon`

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
