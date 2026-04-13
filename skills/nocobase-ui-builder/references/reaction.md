# Reaction Authoring

Use this file when the user asks for interaction logic such as:

- default values
- computed field values
- field required / disabled / visible state
- block show / hide
- action visible / enabled / disabled

This file is intentionally progressive: start from the quick route, then open only the recipe you need.

Use this file as the detailed reaction reference. Other skill references should mainly route here rather than restating all payload rules.

## 1. Quick Route

### Whole-page authoring

If the interaction logic belongs to the same page you are building now:

- use top-level `applyBlueprint.requestBody.reaction.items[]`
- each reaction item only accepts `type`, `target`, `rules`, and optional `expectedFingerprint`
- target the block/action by the same-run local key / bind key
- give every referenced tab / block / action an explicit stable `key` path in the same blueprint
- in whole-page `replace`, those explicit keys only need to be stable within the current write; prefer role-suffixed or page-scoped names such as `mainTab`, `usersTableBlock`, `createFormBlock`, `submitAction`, and `maintainAction` over bare generic keys like `main`, `usersTable`, or `submit`
- for `setActionLinkageRules`, prefer a keyed action object instead of a generated fallback key such as `submit_1`
- keep structure and reaction in one blueprint when possible

### Localized edit on an existing live page

If you need to add or change interaction logic on an existing surface:

1. `getReactionMeta`
2. choose the capability by `kind`
3. reuse its `fingerprint`
4. call the matching `set*Rules`

### Discovery priority

- first choice: `getReactionMeta`
- second choice: `flow_surfaces_context` only when you still need raw ctx variable paths beyond the returned metadata

## 2. Decision Guide

| user intent | reaction kind / write API |
| --- | --- |
| set a form default value | `fieldValue` -> `setFieldValueRules` |
| compute one or more form fields from other values | `fieldLinkage` -> `setFieldLinkageRules` |
| show / hide / require / disable form or details fields | `fieldLinkage` -> `setFieldLinkageRules` |
| show / hide a block | `blockLinkage` -> `setBlockLinkageRules` |
| disable / hide an action | `actionLinkage` -> `setActionLinkageRules` |

Notes:

- `fieldValue` v1 is form-only (`createForm` / `editForm` scenes).
- For form `fieldValue` and form `fieldLinkage`, the public target is still the **form block** key/uid, not the inner grid uid.
- `rules: []` means full clear of that reaction slot.

## 3. Discovery Flow

Localized reaction edits should follow this shape:

```json
{
  "requestBody": {
    "target": { "uid": "employee-form-uid" }
  }
}
```

Read `capabilities[]`:

- `kind`
- `resolvedScene`
- `resolvedSlot`
- `fingerprint`
- `targetFields`
- `supportedActions`
- `conditionMeta`
- `valueExprMeta`

Use `conditionMeta.operatorsByPath` and `supportedActions` instead of guessing condition operators or action names.

Use `flow_surfaces_context` only when you still need deeper raw paths such as:

- `params.query.*`
- `record.*`
- nested popup/item context not obvious from `getReactionMeta`

## 4. Common Recipes

### 4.1 Set default value on a form field

Use `fieldValue` when the intent is "this form field should default to X".

Whole-page blueprint fragment:

```json
{
  "reaction": {
    "items": [
      {
        "type": "setFieldValueRules",
        "target": "main.employeeForm",
        "rules": [
          {
            "key": "defaultStatus",
            "targetPath": "status",
            "mode": "default",
            "value": {
              "source": "literal",
              "value": "draft"
            }
          }
        ]
      }
    ]
  }
}
```

Localized write:

```json
{
  "requestBody": {
    "target": { "uid": "employee-form-uid" }
  }
}
```

then:

```json
{
  "requestBody": {
    "target": { "uid": "employee-form-uid" },
    "expectedFingerprint": "<from getReactionMeta>",
    "rules": [
      {
        "key": "defaultStatus",
        "targetPath": "status",
        "mode": "default",
        "value": {
          "source": "literal",
          "value": "draft"
        }
      }
    ]
  }
}
```

Verification:

- write result returns `resolvedScene: "form"`
- readback stores rules under the form grid slot, not the outer form step root

### 4.2 Compute two form fields from other values

Use `fieldLinkage` when the intent is "when A/B changes, compute C/D".

Preferred pattern:

- simple copy -> `source: "path"`
- formula / branching / multi-target -> `source: "runjs"`

Whole-page blueprint fragment:

```json
{
  "reaction": {
    "items": [
      {
        "type": "setFieldLinkageRules",
        "target": "main.employeeForm",
        "rules": [
          {
            "key": "recomputeTotals",
            "when": {
              "logic": "$and",
              "items": [
                {
                  "path": "formValues.amount",
                  "operator": "$notEmpty"
                }
              ]
            },
            "then": [
              {
                "type": "assignField",
                "items": [
                  {
                    "targetPath": "subtotal",
                    "value": {
                      "source": "runjs",
                      "version": "v2",
                      "code": "const amount = Number(ctx.formValues?.amount || 0); return amount;"
                    }
                  },
                  {
                    "targetPath": "total",
                    "value": {
                      "source": "runjs",
                      "version": "v2",
                      "code": "const amount = Number(ctx.formValues?.amount || 0); const taxRate = Number(ctx.formValues?.taxRate || 0); return amount + amount * taxRate;"
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

Why this pattern:

- one linkage rule groups one business intent
- one `assignField` action can update multiple target fields
- `runjs` handles formulas better than trying to encode everything as raw path copies

### 4.3 Toggle block visibility

Use `blockLinkage` when the target is the block itself rather than an inner field.

Whole-page blueprint fragment:

```json
{
  "reaction": {
    "items": [
      {
        "type": "setBlockLinkageRules",
        "target": "main.employeesTable",
        "rules": [
          {
            "key": "hideTable",
            "when": {
              "logic": "$and",
              "items": [
                {
                  "path": "params.query.hideTable",
                  "operator": "$isTruly"
                }
              ]
            },
            "then": [
              {
                "type": "setBlockState",
                "state": "hidden"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

Typical condition sources:

- `params.query.*`
- `record.*`
- scene-specific form values exposed by the resolved capability

When a whole-page block/action linkage needs sibling form values:

- do not assume the target block/action `when.items[].path` can always use `formValues.*`
- for cross-block form-driven visibility/state, prefer `then: [{ type: \"runjs\" ... }]` or the backend-normalized `linkageRunjs` path that reads `ctx.formValues` directly inside the action payload
- keep `when` empty if the live condition context does not expose that form path
- use `$notEmpty`, not `$isNotEmpty`

### 4.4 Disable or hide an action

Use `actionLinkage` for button state:

```json
{
  "requestBody": {
    "target": { "uid": "refresh-action-uid" },
    "expectedFingerprint": "<from getReactionMeta>",
    "rules": [
      {
        "key": "disableRefresh",
        "when": {
          "logic": "$and",
          "items": [
            {
              "path": "params.query.readonly",
              "operator": "$isTruly"
            }
          ]
        },
        "then": [
          {
            "type": "setActionState",
            "state": "disabled"
          }
        ]
      }
    ]
  }
}
```

### 4.5 Localized field linkage on details / subForm hosts

`fieldLinkage` is not form-only. For localized edits on `details` or `subForm`, still start with `getReactionMeta`, then target the **host block uid**, not one inner field uid.

Typical localized flow:

```json
{
  "requestBody": {
    "target": { "uid": "employee-details-uid" }
  }
}
```

then:

```json
{
  "requestBody": {
    "target": { "uid": "employee-details-uid" },
    "expectedFingerprint": "<from getReactionMeta>",
    "rules": [
      {
        "key": "hideArchivedReason",
        "when": {
          "logic": "$and",
          "items": [
            {
              "path": "record.status",
              "operator": "$eq",
              "value": "archived"
            }
          ]
        },
        "then": [
          {
            "type": "setFieldState",
            "fieldPaths": ["archivedReason"],
            "state": "hidden"
          }
        ]
      }
    ]
  }
}
```

Use the same host-oriented pattern for `subForm`:

- target the subForm host uid
- read `supportedActions`, `targetFields`, and `conditionMeta` from `getReactionMeta`
- do not guess one inner field uid as the write target

## 5. Guardrails

- Always start localized reaction work with `getReactionMeta`.
- Reuse `expectedFingerprint` from the exact capability you are updating.
- Do not guess `resolvedScene`, `resolvedSlot`, `supportedActions`, or valid condition operators.
- For whole-page `applyBlueprint`, reaction targets must be same-run local keys / bind keys, not live uids.
- For whole-page `applyBlueprint`, each reaction item only accepts `type`, `target`, `rules`, and optional `expectedFingerprint`; do not add extra keys such as item-level `key`.
- For whole-page `applyBlueprint`, the local prepare-write gate should reject unsupported item types, non-array `rules`, duplicate `(type, target)` slots, missing / unknown targets, and targets that rely on generated fallback keys instead of explicit stable keys.
- For localized edits, reaction targets must be real live uids.
- For form `fieldValue` / `fieldLinkage`, do not target the inner grid uid manually.
- `rules: []` is a full clear, not a partial patch.
- When conditions need deeper runtime facts than `getReactionMeta` exposes, use `flow_surfaces_context` as a supplement, not as the default discovery step.

## 6. When Not To Use Reaction

Do not use reaction when the request is only:

- static form layout
- pageSize / sorting / fixed display settings
- basic semantic `configure` changes with no conditional behavior

Those stay on normal `configure` / `updateSettings` / structural blueprint paths.
