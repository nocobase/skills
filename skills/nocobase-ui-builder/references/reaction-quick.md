# Reaction Quick Route

Use this file first when the user wants:

- default values
- computed fields
- show / hide / require / disable field state
- block visibility
- action visibility or enabled / disabled state

For artifact-only localized reaction drafting, stay on this file. Do not enumerate the skill directory, scan the workspace, or open [reaction.md](./reaction.md) just to rediscover the common route.

## Common-case flow

### Whole-page create / replace happening now

- if the interaction logic belongs to the page you are building now, keep it in the same blueprint with top-level `reaction.items[]`
- target same-run public paths, not live uids
- default to no `expectedFingerprint` in first-pass whole-page blueprints
- first-pass whole-page `reaction.items[]` uses no live `get-reaction-meta`, no live uid, and no live fingerprint; there is no persisted scene to probe until after `applyBlueprint` succeeds
- use the same explicit block/action keys that the structure uses, for example:
  - `main.recordCreateForm`
  - `main.recordsTable.refreshAction`
  - `main.rolesTable.protectedDeleteAction`
- if a create/edit form submit action must be enabled / disabled in that same first-pass blueprint, do not leave the form action as plain `"submit"`. Upgrade it to one keyed action object such as `{ "key": "submitAction", "type": "submit" }`, then target `main.recordCreateForm.submitAction`
- open [reaction.md](./reaction.md) only when you need the full payload recipes

Whole-page-first rule:

- do not split a newly created page into a separate live reaction phase just because the page has more blocks, more popups, or more reaction families
- if a whole-page `applyBlueprint` fails before first success, repair the blueprint from the error, rerun `prepare-write` and preview, and retry blueprint-only up to 5 rounds; do not switch to localized `get-reaction-meta` + `set*Rules` during those pre-success retries; after 5 failed rounds, report the latest blueprint / preview / error evidence
- after one successful whole-page `applyBlueprint`, use localized `get-reaction-meta` + `set*Rules` repair only for an explicit residual local/live gap, and keep that repair narrowly scoped

### Existing live page

1. `nb api flow-surfaces get-reaction-meta`
2. choose the returned capability by `kind`
3. reuse its `fingerprint`
4. call the matching `set-*` rules command

When extracting fingerprints from CLI JSON, do not pipe the meta through `rg` and then copy the nearest fingerprint. A single target can expose `fieldValue`, `blockLinkage`, and `fieldLinkage` at once, and their fingerprints are not interchangeable. Select by `kind`:

```bash
nb api flow-surfaces get-reaction-meta -e <env> -j \
  --target '{"uid":"<target-uid>"}' > /tmp/reaction-meta.json

jq -r '.data.capabilities[] | select(.kind=="fieldLinkage") | .fingerprint' /tmp/reaction-meta.json
jq '.data.capabilities[] | select(.kind=="fieldLinkage") | {targetFields, supportedActions, conditionMeta}' /tmp/reaction-meta.json
```

If a write returns `FLOW_SURFACE_REACTION_FINGERPRINT_CONFLICT`, immediately refresh `get-reaction-meta` for the same target and retry once with the same `kind` capability. Do not swap in a different kind's fingerprint.

Only choose the final live target after `get-reaction-meta` proves the source path you need is available in that scene. If the returned capability cannot see the required path, move the target or restructure the page/popup first. Do not write a guessed rule to an unsupported host.

## Whole-page recipes

For whole-page `reaction.items[]`, keep the public rule types aligned with the structure you are creating:

| Intent | Type |
| --- | --- |
| default form value | `setFieldValueRules` |
| computed form fields | `setFieldLinkageRules` |
| field show/hide/require/disable | `setFieldLinkageRules` |
| block show/hide | `setBlockLinkageRules` |
| action hide/disable | `setActionLinkageRules` |

### Default value in first-pass blueprint

```json
{
  "reaction": {
    "items": [
      {
        "type": "setFieldValueRules",
        "target": "main.recordCreateForm",
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

### Computed field autofill in first-pass blueprint

```json
{
  "reaction": {
    "items": [
      {
        "type": "setFieldLinkageRules",
        "target": "main.recordCreateForm",
        "rules": [
          {
            "key": "deriveSlugFromTitle",
            "when": {
              "logic": "$and",
              "items": [
                { "path": "formValues.title", "operator": "$notEmpty" },
                { "path": "formValues.slug", "operator": "$empty" }
              ]
            },
            "then": [
              {
                "type": "assignField",
                "items": [
                  {
                    "targetPath": "slug",
                    "value": {
                      "source": "runjs",
                      "version": "v2",
                      "code": "const title = String(ctx.formValues?.title || '').trim();\nif (!title) return null;\n\nreturn title\n  .toLowerCase()\n  .replace(/[^a-z0-9]+/g, '-')\n  .replace(/^-+|-+$/g, '');"
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

### Action guard in first-pass blueprint

Give the guarded action an explicit key first, then target it through the same-run public path.

```json
{
  "tabs": [
    {
      "key": "main",
      "blocks": [
        {
          "key": "recordsTable",
          "type": "table",
          "collection": "records",
          "recordActions": [
            {
              "key": "protectedDeleteAction",
              "type": "delete",
              "title": "Delete"
            }
          ]
        }
      ]
    }
  ],
  "reaction": {
    "items": [
      {
        "type": "setActionLinkageRules",
        "target": "main.recordsTable.protectedDeleteAction",
        "rules": [
          {
            "key": "disableProtectedDelete",
            "when": {
              "logic": "$or",
              "items": [
                { "path": "record.name", "operator": "$eq", "value": "root" },
                { "path": "record.name", "operator": "$eq", "value": "admin" }
              ]
            },
            "then": [
              { "type": "setActionState", "state": "disabled" }
            ]
          }
        ]
      }
    ]
  }
}
```

The same rule applies to form submit guards. If a `createForm` / `editForm` submit button must be disabled until fields are ready, key that submit action in the first blueprint and target it directly through `reaction.items[]` instead of waiting for a second-phase `add-action`.

## Live edit recipes

For computed form fields such as "derive `name` from `title`" or "derive `nickname` from `username` / email", use the `fieldLinkage` capability and an `assignField` action with `value.source = "runjs"`:

Keep value-return RunJS readable in the eventual NocoBase editor. Multi-statement snippets must keep newline characters in the JSON `code` string; do not compress local variables, guards, and return logic into one physical line.

```json
{
  "target": { "uid": "<create-form-uid>" },
  "expectedFingerprint": "<fieldLinkage fingerprint>",
  "rules": [
    {
      "key": "deriveName",
      "when": {
        "logic": "$and",
        "items": [
          { "path": "formValues.title", "operator": "$notEmpty" },
          { "path": "formValues.name", "operator": "$empty" }
        ]
      },
      "then": [
        {
          "type": "assignField",
          "items": [
            {
              "targetPath": "name",
              "value": {
                "source": "runjs",
                "version": "v2",
                "code": "const title = String(ctx.formValues?.title || '').trim();\nif (!title) return null;\n\nreturn title\n  .toLowerCase()\n  .replace(/[^a-z0-9]+/g, '_')\n  .replace(/^_+|_+$/g, '');"
              }
            }
          ]
        }
      ]
    }
  ]
}
```

For a form-scoped helper item, use this exact decision order:

1. run `get-reaction-meta` on the source form
2. inspect the live scene or catalog sections for the intended helper host
3. if that create/edit form scene exposes `fields` / `actions` / `node` but not `blocks`, model the helper as a `jsItem` or other field-like helper in the same form scene
4. in that no-`blocks` case, add the helper with `flow-surfaces add-field --type jsItem` and make the JSItem render nothing until the source form value is present; do not try `setFieldState` against the JSItem because current live `fieldLinkage` target fields only include real collection fields
5. when that JSItem render-null pattern is the intended helper toggle, treat the helper as configured in your readback/evidence summary; do not mark the outcome false only because no separate advanced reaction write targeted the JSItem
6. only when a real target block exposes `blockLinkage` and can read the needed `formValues.*` path from that same live scene, write `set-block-linkage-rules`

Verified CLI shape for a form-scoped helper item:

```bash
nb api flow-surfaces add-field -e <env> -j \
  --target '{"uid":"<create-form-uid>"}' \
  --type jsItem \
  --settings '{"label":"Helper","showLabel":false,"version":"v2","code":"const roles = ctx.formValues?.roles;\nconst selected = Array.isArray(roles)\n  ? roles.length > 0\n  : Boolean(roles);\n\nif (!selected) {\n  ctx.render(null);\n  return;\n}\n\nctx.render(\"Helper content is now visible.\");"}'
```

For a protected delete guard on an existing live page, first make sure the table has a concrete delete record action, then run `get-reaction-meta` on that returned action uid and write `set-action-linkage-rules`.

## Minimal artifact bundle

For a common artifact-only localized reaction task, create:

- `.artifacts/nocobase-ui-builder/<scenario-id>/reaction-plan.json`
- `.artifacts/nocobase-ui-builder/<scenario-id>/readback-checklist.md`
- `reaction-plan.json`
- `readback-checklist.md`

The JSON can stay schematic. It only needs to make the matched `get-reaction-meta` + `set*Rules` path explicit; it does not need full final rule syntax unless the user asked for that detail.

For artifact-only localized reaction drafts, do not invent a live `uid` or fingerprint. The artifact is a plan for the future live write, so make the probe and the dependent writes explicit:

```json
{
  "route": "localized-reaction",
  "metaProbe": {
    "operation": "get-reaction-meta",
    "target": "main.recordCreateForm",
    "requiredKinds": ["fieldValue", "fieldLinkage"],
    "requiredSourcePaths": ["formValues.status"]
  },
  "writes": [
    { "operation": "setFieldValueRules", "dependsOnKind": "fieldValue" },
    { "operation": "setFieldLinkageRules", "dependsOnKind": "fieldLinkage" }
  ]
}
```

## Open next only if needed

- [reaction.md](./reaction.md) for full rule payloads, uncommon operators, or multi-rule compositions that are not obvious from this quick route
- [whole-page-recipes.md](./whole-page-recipes.md) if you need a larger first-pass blueprint pattern with paired blocks, nested popups, and top-level reactions
- [runtime-playbook.md](./runtime-playbook.md) if the target family or live locator is still unclear
- [template-quick.md](./template-quick.md) if the localized edit hits an existing template reference first

## Guardrails

- for whole-page create / replace, prefer top-level `reaction.items[]` over a second live reaction phase
- for existing live pages, start from `get-reaction-meta`, not `context`
- do not guess supported actions or condition operators
- if a form-driven block/action toggle needs the current form values, prefer a sibling block/action in the same scene; do not default to a nested popup block when that host cannot expose the needed path
- if a create/edit form scene has no `blocks` capability, do not force a form-scoped helper into a standalone block; keep it as `jsItem` or another field-like helper and use `fieldLinkage`
- for action guards on existing live pages, first create or identify the concrete live action target, then run `get-reaction-meta` on that action before writing `actionLinkage`
- for common artifact-only drafting, do not scan the current workspace or existing `.artifacts` before writing the two output files
- for common `fieldValue` / `fieldLinkage` work, do not open [reaction.md](./reaction.md) unless this quick route still leaves a real payload uncertainty
- do not open upstream-js snapshot docs for ordinary localized reaction artifacts; those are for JS API questions, not for a schematic reaction plan
- use `context` only when raw variable paths are still missing after `get-reaction-meta`
