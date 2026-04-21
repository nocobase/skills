# Reaction Authoring

Use this file for interaction logic:

- default values
- computed field values
- field required / disabled / visible state
- block show / hide
- action visible / enabled / disabled

Canonical front door is `nocobase-ctl flow-surfaces`. Use CLI `--help` to confirm the current subcommand surface, then return here for the payload rules. Start with [reaction-quick.md](./reaction-quick.md) when the common route is enough.

For localized CLI writes, pass the raw business object through `--body` / `--body-file`. Only in MCP fallback should that same object be wrapped under `requestBody`.

## 1. Quick Route

### Whole-page authoring

If the interaction logic belongs to the page you are building now:

- use `nocobase-ctl flow-surfaces apply-blueprint`
- write reactions in top-level `reaction.items[]`
- each item accepts `type`, `target`, `rules`, and optional `expectedFingerprint`
- target blocks/actions by stable same-run keys or public paths
- keep structure, popup, and reaction in one blueprint when possible
- do not switch to a separate live reaction phase unless a verified public whole-page contract gap forces it

### Localized edit on an existing live page

If the page already exists:

1. run `nocobase-ctl flow-surfaces get-reaction-meta`
2. choose the capability by `kind`
3. reuse its `fingerprint`
4. call the matching `nocobase-ctl flow-surfaces set-*`

Do not lock the target before step 1. The chosen target must expose the source path needed by the rule in the returned scene/capability. If it does not, move the target or restructure the page/popup first.

### Discovery priority

- first choice: `get-reaction-meta`
- second choice: `flow_surfaces_context` only when you still need raw `ctx.*` paths

## 2. Decision Guide

| user intent | reaction kind / write API |
| --- | --- |
| set a form default value | `fieldValue` -> `setFieldValueRules` |
| compute one or more form fields from other values | `fieldLinkage` -> `setFieldLinkageRules` |
| show / hide / require / disable form or details fields | `fieldLinkage` -> `setFieldLinkageRules` |
| show / hide a block | `blockLinkage` -> `setBlockLinkageRules` |
| disable / hide an action | `actionLinkage` -> `setActionLinkageRules` |

Notes:

- `fieldValue` v1 is form-only.
- For form `fieldValue` and `fieldLinkage`, target the outer form block uid rather than the inner grid uid.
- `rules: []` means full clear of that reaction slot.
- If a create/edit form scene exposes `fields` / `actions` / `node` but not `blocks`, keep form-scoped helper/reference content as `jsItem` or another field-like helper in that same scene. Current live `fieldLinkage` target fields are real collection fields, so do not assume `setFieldState` can target the JSItem; prefer a JSItem that self-renders based on `ctx.formValues`.

## 3. Discovery Flow

Use this body for localized discovery:

```json
{
  "target": { "uid": "employee-form-uid" }
}
```

Read `capabilities[]` for:

- `kind`
- `resolvedScene`
- `resolvedSlot`
- `fingerprint`
- `targetFields`
- `supportedActions`
- `conditionMeta`
- `valueExprMeta`

Use `conditionMeta.operatorsByPath` and `supportedActions` instead of guessing condition operators or action names.

## 4. Common Recipes

### 4.1 Set a default value on a form field

Use `fieldValue` when the intent is “this field defaults to X”.

Use `value.source = "literal"` for static defaults. Reserve `path` or `runjs` for derived defaults.

Blueprint fragment:

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
            "value": { "source": "literal", "value": "draft" }
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
  "target": { "uid": "employee-form-uid" },
  "expectedFingerprint": "<from getReactionMeta>",
  "rules": [
    {
      "key": "defaultStatus",
      "targetPath": "status",
      "mode": "default",
      "value": { "source": "literal", "value": "draft" }
    }
  ]
}
```

### 4.2 Compute fields from other values

Use `fieldLinkage` when the intent is “when A/B changes, recompute C/D”.

When the `value` payload uses RunJS, route the example choice first through [js-surfaces/value-return.md](./js-surfaces/value-return.md). When the action itself is `Execute JavaScript`, route first through [js-surfaces/linkage.md](./js-surfaces/linkage.md).

- simple copy -> `source: "path"`
- formulas or branching -> `source: "runjs"`
- keep one business intent in one rule
- one `assignField` action can update multiple target fields
- select the `fieldLinkage` capability by `kind` from `get-reaction-meta`; do not reuse a nearby `blockLinkage` fingerprint from the same target
- if the server returns `FLOW_SURFACE_REACTION_FINGERPRINT_CONFLICT`, refresh `get-reaction-meta` for the same target and retry with the refreshed `fieldLinkage` fingerprint

```json
{
  "target": { "uid": "employee-form-uid" },
  "expectedFingerprint": "<from getReactionMeta>",
  "rules": [
    {
      "key": "recomputeTotals",
      "when": {
        "logic": "$and",
        "items": [
          { "path": "formValues.amount", "operator": "$notEmpty" }
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
                "code": "return Number(ctx.formValues?.amount || 0);"
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
```

### 4.3 Toggle block visibility

Use `blockLinkage` when the target is the block itself:

```json
{
  "target": { "uid": "employees-table-uid" },
  "expectedFingerprint": "<from getReactionMeta>",
  "rules": [
    {
      "key": "hideTable",
      "when": {
        "logic": "$and",
        "items": [
          { "path": "params.query.hideTable", "operator": "$isTruly" }
        ]
      },
      "then": [
        { "type": "setBlockState", "state": "hidden" }
      ]
    }
  ]
}
```

### 4.4 Form-scoped helper item

When a form-value-driven helper/reference area must stay scoped to a create/edit form, check `catalog` on the outer form block first. If `catalog.fields[]` exposes `jsItem` and `catalog.blocks[]` is empty, add a JSItem to the form instead of creating an unrelated page-level block.

Verified CLI shape:

```bash
nocobase-ctl flow-surfaces add-field -e <env> -j \
  --target '{"uid":"users-create-form-uid"}' \
  --type jsItem \
  --settings '{"label":"角色治理提示","showLabel":false,"extra":"选择角色后显示角色治理说明","version":"v2","code":"const roles = ctx.formValues?.roles; const selected = Array.isArray(roles) ? roles.length > 0 : Boolean(roles); if (!selected) { ctx.render(null); return; } ctx.render(\"已选择角色，可查看角色治理提示。\");"}'
```

This counts as the helper toggle: hidden state is represented by `ctx.render(null)` while `roles` is empty, and visible state by rendering content after roles are selected. Do not write `setFieldLinkageRules` against the JSItem uid or `jsItem` pseudo path unless `get-reaction-meta.targetFields` explicitly lists that target.

### 4.5 Disable or hide an action

Use `actionLinkage` when the target is an action:

- first create or identify the concrete live action target
- run `get-reaction-meta` on that action and reuse the returned `fingerprint`
- do not write `actionLinkage` to a conceptual action that has not been created yet
- for table record delete guards, create the delete record action first if it is missing
- for form submit guards, create the submit form action first if it is missing

```json
{
  "target": { "uid": "submit-action-uid" },
  "expectedFingerprint": "<from getReactionMeta>",
  "rules": [
    {
      "key": "disableSubmitWhenArchived",
      "when": {
        "logic": "$and",
        "items": [
          { "path": "record.status", "operator": "$eq", "value": "archived" }
        ]
      },
      "then": [
        { "type": "setActionState", "state": "disabled" }
      ]
    }
  ]
}
```

Concrete record-delete guard path:

```bash
nocobase-ctl flow-surfaces add-record-action -e <env> -j \
  --target '{"uid":"roles-table-uid"}' \
  --type delete \
  --settings '{"title":"删除"}'

nocobase-ctl flow-surfaces get-reaction-meta -e <env> -j \
  --target '{"uid":"delete-action-uid"}'

nocobase-ctl flow-surfaces set-action-linkage-rules -e <env> -j \
  --target '{"uid":"delete-action-uid"}' \
  --expected-fingerprint "<fingerprint>" \
  --rules '[{"key":"disableProtectedRoleDelete","title":"Disable protected roles","when":{"logic":"$or","items":[{"path":"record.name","operator":"$eq","value":"root"},{"path":"record.name","operator":"$eq","value":"admin"},{"path":"record.name","operator":"$eq","value":"administrator"},{"path":"record.name","operator":"$eq","value":"member"}]},"then":[{"type":"setActionState","state":"disabled"}]}]'
```

Check `conditionMeta.operatorsByPath` first. Record-scoped delete actions should expose the clicked role under `record.*`, so prefer supported record paths such as `record.name`.

Concrete submit guard path:

```bash
nocobase-ctl flow-surfaces add-action -e <env> -j \
  --target '{"uid":"users-create-form-uid"}' \
  --type submit \
  --settings '{"title":"提交"}'

nocobase-ctl flow-surfaces get-reaction-meta -e <env> -j \
  --target '{"uid":"submit-action-uid"}'

nocobase-ctl flow-surfaces set-action-linkage-rules -e <env> -j \
  --target '{"uid":"submit-action-uid"}' \
  --expected-fingerprint "<fingerprint>" \
  --rules '[{"key":"disableSubmitUntilReady","title":"Disable submit until key fields ready","when":{"logic":"$or","items":[{"path":"formValues.username","operator":"$empty"},{"path":"formValues.roles","operator":"$eq","value":null}]},"then":[{"type":"setActionState","state":"disabled"}]}]'
```

### 4.6 Details / subForm hosts

For details or `subForm` linkage:

- still start from `get-reaction-meta`
- use the returned `resolvedScene` / `resolvedSlot`
- keep the write target on the public host uid the backend expects
- avoid guessing raw nested slot paths

## 5. Guardrails

- Use reaction APIs for default values, linkage, computed values, and state. Do not guess raw `configure` keys.
- Reuse the returned `fingerprint` on every `set-*` write.
- Keep whole-page reactions attached to stable local keys so the same write can reference them deterministically.
- If a visibility/enabled-state rule depends on form values, prefer a sibling block/action in the same page or popup scene. Do not assume a nested popup-local block can read a form path unless `get-reaction-meta` proves it.
- If a create/edit form scene does not expose `blocks`, do not force a helper/reference area into a standalone block just because the business wording says "area". Reshape it into a form-scoped helper item first.
- For action guards, do not guess the action target from wording alone. Confirm the live action target first, then write `setActionLinkageRules` with its returned `fingerprint`.
- Use `flow_surfaces_context` only when `get-reaction-meta` is insufficient.
- For RunJS values, validate through the skill's JS path instead of inventing ad-hoc code shapes.

## 6. When Not To Use Reaction

- static labels, titles, or layout-only changes
- plain block/field/action insertion with no runtime logic
- permission or workflow behavior that belongs to another skill
