# Public settings

Read this file first when you already know you are creating a block / field / action / record action, and the user also requires frequent public attributes such as title, label, required, or button style. The goal is to inline public semantic `settings` directly into `add*`, rather than creating an empty node first and then mechanically adding a separate `configure`. Whether `catalog` is mandatory is governed by [normative-contract.md](./normative-contract.md).

## Contents

1. Core rules
2. Decision matrix
3. Legal shapes of `settings`
4. High-impact reminders
5. Frequent templates
6. When not to force something into `settings`
7. Readback mental model

## Core Rules

1. If the current change needs live `configureOptions` / `settingsContract` to determine which public fields exist, read `catalog({ target })` first via [normative-contract.md](./normative-contract.md). The decision should consider both target-level `configureOptions` and item-level `configureOptions`.
2. `requestBody.settings` must only contain public semantic keys. Do not write raw `props / decoratorProps / stepParams / flowRegistry / wrapperProps / fieldProps`.
3. If the user's requirement can be fully expressed through `settings`, do `add* + settings` directly. Do not add an extra `configure`.
4. If only part of the fields can be inlined, do `add* + settings` first, then use `configure(changes)` to fill the remaining public fields.
5. Only fall back to `updateSettings` for path-level contracts. Layout and event flows still use dedicated APIs.
6. If live `catalog.configureOptions` has clearly exposed a key but this file does not list it, do not automatically degrade to `updateSettings`. Prefer `add* + settings` or `configure(changes)` first.

## Decision Matrix

| Requirement type | Default entry | When to use |
| --- | --- | --- |
| create node + frequent public attributes | `add* + settings` | the target fields have already been exposed as public semantics in the live environment; if confirmation is needed, read `catalog` first via normative contract |
| small update to an existing node | `configure(changes)` | still within public semantic fields, but the node does not need to be recreated |
| switch an existing field wrapper to another public field component | `configure(changes)` on `wrapperUid` | use this first for requests such as "change the existing roles field into sub-table display", especially when the live wrapper contract exposes `fieldComponent` |
| path-level fine-grained patch | `updateSettings` | the live environment only exposes a domain contract, without a public semantic entry |
| layout | `setLayout` | only when the user explicitly accepts whole-layout replacement and the full current layout has already been read back |
| event flows | `setEventFlows` | only when the user explicitly accepts full instance-level flow replacement and the full current flow has already been read back |

## High-Impact Reminders

- `setLayout` and `setEventFlows` are not ordinary patches. Both are high-impact full-replace APIs.
- Do not default to them just because "only one layout item" or "only one flow" is changing. If the user is not asking for whole replacement, prefer `compose/add*`, `configure`, or `updateSettings` instead.
- Once you use them, read the full current state before writing, and validate against the full post-write state. Do not rely on local delta only.

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
  "requestBody": {
    "target": { "uid": "details-item-wrapper-uid" },
    "changes": {
      "fieldComponent": "DisplaySubTableFieldModel"
    }
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

### `addBlock`

Create `createForm` and give it a title directly:

```json
{
  "requestBody": {
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
}
```

Common settings that are suitable for direct inline use:

- generic block: `title`, `displayTitle`, `height`, `heightMode`
- `table`: `quickEdit`, `treeTable`, `defaultExpandAllRows`, `dragSort`, `dragSortBy`
- form-like blocks: `labelWidth`, `labelWrap`, `layout`, `labelAlign`, `colon`

### `addField`

When creating a field bound to a real field, `fieldPath` is a required creation parameter. Label, required, and similar attributes belong to `settings`:

```json
{
  "requestBody": {
    "target": { "uid": "form-uid" },
    "fieldPath": "password",
    "settings": {
      "label": "Password",
      "required": true
    }
  }
}
```

Only the batch shape of `addFields` uses `fields: []`:

```json
{
  "requestBody": {
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

### `addAction`

Create a submit button and set its title and type directly:

```json
{
  "requestBody": {
    "target": { "uid": "form-uid" },
    "type": "submit",
    "settings": {
      "title": "Submit",
      "type": "primary"
    }
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

### `addRecordAction`

Create a record-level view action and give it a title directly:

```json
{
  "requestBody": {
    "target": { "uid": "table-uid" },
    "type": "view",
    "settings": {
      "title": "View"
    }
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
