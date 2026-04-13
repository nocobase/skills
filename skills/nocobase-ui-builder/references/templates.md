# Templates

Read this file when the task involves saving a reusable UI template, searching/selecting templates, applying a template during `add*` / `compose`, switching popup-template targets, converting a reference to copy mode, or reasoning about template `usageCount`.

Canonical front door is `nocobase-ctl flow-surfaces`. JSON examples below default to the CLI raw body unless a block is explicitly labeled as MCP fallback. For CLI/MCP envelope mapping, see [tool-shapes.md](./tool-shapes.md). For popup-specific rules, see [popup.md](./popup.md). For general execution order, see [execution-checklist.md](./execution-checklist.md).

## Public page blueprint vs low-level template APIs

- If the user is authoring one whole page through public `applyBlueprint`, keep template usage inline inside the public page blueprint:
  - block template -> block `template`
  - popup template -> action/field `popup.template`
- Public `applyBlueprint` stays public and declarative. Keep template usage inline there, and do not translate low-level `openView` config shapes into the page blueprint.
- This file is mainly about template lifecycle and low-level template entry points after the routing decision is already clear.

## What a Template Means

- A flow-surfaces template is a reusable FlowModel-backed subtree exposed through flow-surfaces APIs.
- Supported template `type` values are `block` and `popup`.
- `block` templates may also be consumed as `usage = "fields"` when the saved source is a supported form-like block and the caller only wants its grid fields.
- The backend keeps ownership checks, allowed-source checks, and usage accounting. Do not bypass those rules by writing raw template markers into model settings.

## Default Model Behavior

1. If the user wants reuse but has not named a specific template, call `list-templates` first.
2. Use `search` plus the required `description` field to find the right candidate.
3. Prefer rows with `available = true`. If a row is unavailable, explain `disabledReason` instead of guessing around it.
4. Once the template is chosen, decide `mode`: `reference` or `copy`.
5. Only use documented template entry points (`list-templates`, `get-template`, `save-template`, `update-template`, `destroy-template`, `convert-template-to-copy`, `add-*`, `compose`, `configure`). Do not patch hidden template fields manually.

## Search and Selection

Use `list-templates` when you need to discover applicable templates. Main filters:

- `type = "block" | "popup"`
- `usage = "block" | "fields"` for block templates
- `search` for name + description matching
- `target.uid`, `actionType`, and `actionScope` when the user needs popup templates for a specific opener context

Interpretation rules:

- `available = true` means the backend considers the template usable in the current context.
- `disabledReason` explains why it cannot be used in the current context. Surface that reason instead of retrying with guessed payloads.
- Treat `list-templates` as the source of truth for template availability. Do not try to recreate the frontend filtering logic inside the skill; trust the backend-filtered `available / disabledReason` result.
- `description` is required and intentionally searchable. Encourage precise descriptions when saving templates.

## Read or Refine Template Metadata

- Use `get-template` when the user already knows a template uid and needs its latest metadata or `usageCount`.
- Use `update-template` when the user wants to rename a template or improve its searchable `description` without changing the stored FlowModel tree.

## CLI-first Request Shapes

`list-templates` for popup-template discovery in a concrete opener context:

```json
{
  "target": { "uid": "employee-table-block" },
  "type": "popup",
  "actionType": "view",
  "actionScope": "record",
  "search": "employee popup",
  "page": 1,
  "pageSize": 20
}
```

For form fields templates, change the search filter to `type = "block"` plus `usage = "fields"`.

`save-template`:

```json
{
  "target": { "uid": "employee-create-form" },
  "name": "Employee create form",
  "description": "Reusable employee create form with common fields and popup behavior.",
  "saveMode": "duplicate"
}
```

`update-template` / `get-template` / `destroy-template` all center on the template uid. Minimal CLI bodies:

```json
{ "uid": "employee-form-template" }
```

```json
{
  "uid": "employee-form-template",
  "name": "Employee create form",
  "description": "Reusable employee create form with validated field order."
}
```

`convert-template-to-copy`:

```json
{
  "target": { "uid": "employee-form-block" }
}
```

`add-block` with a block template:

```json
{
  "target": { "uid": "page-grid-uid" },
  "template": {
    "uid": "employee-form-template",
    "mode": "reference",
    "usage": "block"
  }
}
```

For form-field-only reuse from a form template, keep the same envelope and switch `usage` to `"fields"`. The same `template` shape is also used inside `add-blocks` items and compose block specs.

`add-field` / `add-fields` with a saved fields template:

```json
{
  "target": { "uid": "employee-form-block" },
  "template": {
    "uid": "employee-form-template",
    "mode": "reference"
  }
}
```

Use this path when importing only the saved form-grid fields into an existing form host / target form grid.

`add-action` with `popup.template`:

```json
{
  "target": { "uid": "employee-table-block" },
  "type": "popup",
  "popup": {
    "template": {
      "uid": "employee-popup-template",
      "mode": "reference"
    }
  }
}
```

MCP fallback uses the same business object wrapped under `requestBody`. For example:

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

The same inner `popup.template` shape is reused by `add-record-action`, popup-capable `add-field` / `add-fields`, and compose action / field specs.

`configure(changes.openView.template)` to switch a popup template on an existing opener:

```json
{
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
```

Use this only for popup action / field openers whose live contract supports template switching. Do not generalize this to block or fields-template references.

## Save a Template

Use `save-template` for all supported save cases. Do not invent separate save APIs such as "save block template" or "save popup template".

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

Use block templates with `add-block`, `add-blocks`, or `compose`.

- Whole-block reuse: `template = { uid, mode, usage?: "block" }`
- Form-fields-only reuse from a form template: `template = { uid, mode, usage: "fields" }`

Semantics:

- `mode = "reference"` keeps a template reference on the created block and may increase `usageCount`.
- `mode = "copy"` creates a detached block immediately; the created block should not keep template reference metadata.

### Fields templates

Use field templates in two main ways:

- Create a fresh host block from a form template via `add-block` / `add-blocks` / `compose` with `template.usage = "fields"`
- Import a saved fields template into an existing form host / target form grid via `add-field` or `add-fields` with top-level `template = { uid, mode }`

Semantics:

- `reference` keeps `fieldsTemplate` linkage on the host and increases usage while the reference exists
- `copy` imports the fields once and detaches immediately

### Popup templates

Use popup templates through the popup-capable creation entry points:

- `add-action` / `add-record-action` via `popup.template`
- `add-field` / `add-fields` via `popup.template`
- `compose` action / field specs via `popup.template`

Use inline `popup.blocks/layout` only when the user wants local popup content rather than template reuse.

For public `applyBlueprint`, keep the same rule: use inline `popup` / `popup.template` only, never low-level popup-retarget config shapes.

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

Use `convert-template-to-copy` when the current node is a template reference and the user wants to detach it.

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

Use `destroy-template` only when the user explicitly wants to delete an unused template.

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
- Do not skip `list-templates` when template discovery is the real task
