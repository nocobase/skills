# Templates

Read this file when the task involves saving a reusable UI template, searching/selecting templates, applying a template during `add*` / `compose`, switching popup-template targets, converting a reference to copy mode, or reasoning about template `usageCount`.

For payload envelopes, see [tool-shapes.md](./tool-shapes.md). For popup-specific rules, see [popup.md](./popup.md). For general execution order, see [execution-checklist.md](./execution-checklist.md).

## What a Template Means

- A flow-surfaces template is a reusable FlowModel-backed subtree exposed through flow-surfaces APIs.
- Supported template `type` values are `block` and `popup`.
- `block` templates may also be consumed as `usage = "fields"` when the saved source is a supported form-like block and the caller only wants its grid fields.
- The backend keeps ownership checks, allowed-source checks, and usage accounting. Do not bypass those rules by writing raw template markers into model settings.

## Default Model Behavior

1. If the user wants reuse but has not named a specific template, call `listTemplates` first.
2. Use `search` plus the required `description` field to find the right candidate.
3. Prefer rows with `available = true`. If a row is unavailable, explain `disabledReason` instead of guessing around it.
4. Once the template is chosen, decide `mode`: `reference` or `copy`.
5. Only use documented template entry points (`saveTemplate`, `add*`, `compose`, `configure`, `convertTemplateToCopy`, `destroyTemplate`). Do not patch hidden template fields manually.

## Search and Selection

Use `listTemplates` when you need to discover applicable templates. Main filters:

- `type = "block" | "popup"`
- `usage = "block" | "fields"` for block templates
- `search` for name + description matching
- `target.uid`, `actionType`, and `actionScope` when the user needs popup templates for a specific opener context

Interpretation rules:

- `available = true` means the backend considers the template usable in the current context.
- `disabledReason` explains why it cannot be used in the current context. Surface that reason instead of retrying with guessed payloads.
- Treat `listTemplates` as the source of truth for template availability. Do not try to recreate the frontend filtering logic inside the skill; trust the backend-filtered `available / disabledReason` result.
- `description` is required and intentionally searchable. Encourage precise descriptions when saving templates.

## Read or Refine Template Metadata

- Use `getTemplate` when the user already knows a template uid and needs its latest metadata or `usageCount`.
- Use `updateTemplate` when the user wants to rename a template or improve its searchable `description` without changing the stored FlowModel tree.

## Canonical Request Shapes

`listTemplates` for popup-template discovery in a concrete opener context:

```json
{
  "requestBody": {
    "target": { "uid": "employee-table-block" },
    "type": "popup",
    "actionType": "view",
    "actionScope": "record",
    "search": "employee popup",
    "page": 1,
    "pageSize": 20
  }
}
```

For form fields templates, change the search filter to `type = "block"` plus `usage = "fields"`.

`saveTemplate`:

```json
{
  "requestBody": {
    "target": { "uid": "employee-create-form" },
    "name": "Employee create form",
    "description": "Reusable employee create form with common fields and popup behavior.",
    "saveMode": "duplicate"
  }
}
```

`updateTemplate` / `getTemplate` / `destroyTemplate` all center on the template uid. Minimal shapes:

```json
{ "requestBody": { "uid": "employee-form-template" } }
```

```json
{
  "requestBody": {
    "uid": "employee-form-template",
    "name": "Employee create form",
    "description": "Reusable employee create form with validated field order."
  }
}
```

`convertTemplateToCopy`:

```json
{
  "requestBody": {
    "target": { "uid": "employee-form-block" }
  }
}
```

`addBlock` with a block template:

```json
{
  "requestBody": {
    "target": { "uid": "page-grid-uid" },
    "template": {
      "uid": "employee-form-template",
      "mode": "reference",
      "usage": "block"
    }
  }
}
```

For form-field-only reuse from a form template, keep the same envelope and switch `usage` to `"fields"`. The same `template` shape is also used inside `addBlocks` items and compose block specs.

`addField` / `addFields` with a saved fields template:

```json
{
  "requestBody": {
    "target": { "uid": "employee-form-block" },
    "template": {
      "uid": "employee-form-template",
      "mode": "reference"
    }
  }
}
```

Use this path when importing only the saved form-grid fields into an existing form host / target form grid.

`addAction` with `popup.template`:

```json
{
  "requestBody": {
    "target": { "uid": "employee-table-block" },
    "type": "popup",
    "popup": {
      "template": {
        "uid": "employee-popup-template",
        "mode": "reference"
      }
    }
  }
}
```

The same inner `popup.template` shape is reused by `addRecordAction`, popup-capable `addField/addFields`, and compose action / field specs.

`configure(changes.openView.template)` to switch a popup template on an existing opener:

```json
{
  "requestBody": {
    "target": { "uid": "employee-view-action" },
    "changes": {
      "openView": {
        "template": {
          "uid": "employee-popup-template-v2",
          "mode": "reference"
        }
      }
    }
  }
}
```

Use this only for popup action / field openers whose live contract supports template switching. Do not generalize this to block or fields-template references.

## Save a Template

Use `saveTemplate` for all supported save cases. Do not invent separate save APIs such as "save block template" or "save popup template".

Required fields:

- `target.uid`
- `name`
- `description`

Optional behavior:

- `saveMode = "duplicate"` (default): create the template only
- `saveMode = "convert"`: create the template and convert the current source to a template reference when the source kind supports conversion

Backend constraints to respect:

- The backend decides whether the source is an allowed block source, a popup action opener, or a field `openView` opener.
- `description` is required because API callers and models rely on it for search and selection.
- If saving fails because the source is not allowed, surface the validation error; do not try to save the subtree through another low-level endpoint.

## Apply a Template During Creation

### Block templates

Use block templates with `addBlock`, `addBlocks`, or `compose`.

- Whole-block reuse: `template = { uid, mode, usage?: "block" }`
- Form-fields-only reuse from a form template: `template = { uid, mode, usage: "fields" }`

Semantics:

- `mode = "reference"` keeps a template reference on the created block and may increase `usageCount`.
- `mode = "copy"` creates a detached block immediately; the created block should not keep template reference metadata.

### Fields templates

Use field templates in two main ways:

- Create a fresh host block from a form template via `addBlock/addBlocks/compose` with `template.usage = "fields"`
- Import a saved fields template into an existing form host / target form grid via `addField` or `addFields` with top-level `template = { uid, mode }`

Semantics:

- `reference` keeps `fieldsTemplate` linkage on the host and increases usage while the reference exists
- `copy` imports the fields once and detaches immediately

### Popup templates

Use popup templates through the popup-capable creation entry points:

- `addAction` / `addRecordAction` via `popup.template`
- `addField` / `addFields` via `popup.template`
- `compose` action / field specs via `popup.template`

Use inline `popup.blocks/layout` only when the user wants local popup content rather than template reuse.

## Update an Existing Popup Template Reference

Popup templates are special: an existing action or field opener may switch to another popup template through `configure(changes.openView.template)`, subject to the live backend contract.

Use this when the user says things like:

- "把这个按钮的弹窗模板换成另一个"
- "让这个字段改用另一个 popup template"

Do not generalize this rule to block or fields-template references. Those should not be treated as freely retargetable after creation.

## Reference vs Copy

### `reference`

- Keeps a live link to the saved template
- Usually increases `usageCount`
- Block / fields references should not be retargeted by arbitrary config writes
- Referenced popup content is effectively read-only until you either detach it or switch popup template through the supported popup-config path

### `copy`

- Detaches immediately from the saved template
- Should not increase `usageCount`
- The created block / fields / popup may then be edited normally as local content

## Convert to Copy

Use `convertTemplateToCopy` when the current node is a template reference and the user wants to detach it.

Supported result `type` values:

- `block`
- `fields`
- `popup`

Default guidance:

- For block / fields references: this is the normal escape hatch before editing the reused content
- For popup references: use this when the user wants to edit popup inner blocks locally, or when an explicit detach is preferable to switching templates

After conversion:

- the node should no longer expose the template reference
- local copy identifiers such as popup/page/grid uids may now appear on the detached structure
- `usageCount` should decrease accordingly

## Delete and Usage Accounting

Use `destroyTemplate` only when the user explicitly wants to delete an unused template.

Rules:

- The backend rejects deletion while `usageCount > 0`
- Destroy/removal of referencing UI nodes may decrease `usageCount` automatically
- Do not promise successful deletion before checking the server response

When removing pages, tabs, popup tabs, blocks, fields, or popup openers that carry template references, expect usage accounting to change as part of normal backend cleanup.

## What Not to Do

- Do not write raw template uid/mode fields directly into low-level step params or model settings
- Do not use `openView.uid` as the default popup reuse mechanism
- Do not assume block, fields, and popup templates share the same retargeting rules after creation
- Do not mutate popup inner blocks of a referenced popup template directly; detach first unless the requested change is specifically switching to another popup template through the supported config path
- Do not skip `listTemplates` when template discovery is the real task
