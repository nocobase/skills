# Templates

Read this file when template routing is already confirmed: reusable popup / block / fields scenes, applying a template during `add*` / `compose`, editing content under an existing template reference, switching popup-template targets, converting a reference to `copy`, or checking `usageCount`.

Start with [template-quick.md](./template-quick.md) when you are still deciding whether template routing is in scope. Come here once that route is clear.

Agent-facing front door is `node skills/nocobase-ui-builder/runtime/bin/nb-flow-surfaces.mjs`. Backend transport contract remains `nb api flow-surfaces`. JSON examples below use the backend nb raw body that the wrapper eventually sends. Do not wrap that object again. For body details see [tool-shapes.md](./tool-shapes.md). For popup rules see [popup.md](./popup.md). For execution order see [execution-checklist.md](./execution-checklist.md).

This file is the single normative source for template selection and localized existing-reference edit routing. If another doc starts restating the template rules, shorten the other doc and point back here.

## Public page blueprint vs low-level template APIs

- Public `applyBlueprint` keeps template usage inline:
  - block template -> block `template`
  - popup template -> action/field `popup.template`
- Keep page blueprints declarative. Do not translate low-level `openView` config shapes into the public blueprint.
- Templates are scene-level reuse, not an entire page template type.

## What a Template Means

- A flow-surfaces template is a reusable FlowModel-backed subtree.
- Supported template `type` values are `block` and `popup`.
- `block` templates may also be consumed as `usage = "fields"` when only form-grid fields should be reused.
- Backend ownership checks, allowed-source checks, and usage accounting stay authoritative. Do not write raw template markers into model settings.

## Repeat-eligible Scenes

Repeat-eligible scenes must go through contextual `list-templates` probing before binding a template or finalizing a reusable/template-backed fallback. This hard gate is mandatory. Keyword-only search is discovery-only, not binding proof.

Enter template routing when the task includes one of these scenes:

- a relation/display field should click and open a standard details popup
- the same task contains two or more structurally matching popup / block / fields scenes
- a standard CRUD popup should be reused under a known opener such as `view`, `edit`, or `addNew`
- a repeated form field layout should be reused under a compatible host collection / root-use context
- the user explicitly asks to reuse, unify, or follow an existing template
- natural-language reuse cues such as “一样”, “同样”, “沿用前面的思路”, “保持一致”, or “不要每次都从零搭”
- one standard reusable scene appears only once, but its opener / resource / association context is already strong enough that silent inline fallback would be wasteful

Stay inline/non-template by default when the scene is one-off, obviously local-customized, or still too weak for contextual probing. Fresh whole-page `create` work with explicit local popup / block content, no existing template reference, and no reuse / save-template ask should stay inline and should not enter template routing just because the popup chain is structurally rich.

## Path Boundaries

- Whole-page `create` / `replace` is not exempt when template routing is actually in scope. If the draft contains a repeat-eligible scene and you are deciding whether to bind / reuse / standardize a template-backed scene, probe templates before locking that route. Fresh one-off `create` pages with explicit local popup / block content, no existing template reference, and no reuse / save-template ask stay inline by default.
- A missing live `target.uid` does not block whole-page planning. Use the strongest planning context the runtime actually supports.
- Do not bind `template` / `popup.template` from loose text search alone. Loose text search alone is discovery-only.
- If neither live context nor planning context can describe the intended scene, stay discovery-only or inline/non-template.

## Decision Table

| request shape | identity | context | usable candidates | result |
| --- | --- | --- | --- | --- |
| explicit non-unique template `name` | ambiguous | any | n/a | present matches and ask for exact uid |
| explicit template `uid` or unique exact `name` | resolved | weak / discovery-only | n/a | identity known, availability still unproven |
| explicit template | resolved | strong live/planned context | explicit row `available = true` | bind it, then choose `reference` or `copy` |
| explicit template | resolved | strong live/planned context | row missing or `available = false` | do not bind; surface `disabledReason` or the compatibility gap |
| no explicit template, repeat-eligible scene | none | strong live/planned context | `0` | bootstrap earliest concrete scene, then `save-template`; prefer `saveMode="convert"` when supported |
| no explicit template, single standard reusable scene | none | strong live/planned context | `0` | bootstrap the first concrete scene, then `save-template`; prefer `saveMode="convert"` when supported |
| no explicit template, one-off/custom scene | none | strong live/planned context | `0` | stay inline/non-template |
| no explicit template | none | strong live/planned context | `1` | bind it automatically |
| no explicit template | none | strong live/planned context | `>1` | rank, then bind the best candidate; if ranking still ties, keep backend order and use the first compatible row |

## Automatic Selection Rule

1. Confirm the task really is a repeat-eligible scene.
2. Gather the strongest available context: live `target.uid` first, otherwise one strong planning context from the current draft.
3. Call `list-templates`.
4. Keep only the intended `type` / `usage` / opener/resource scene and rows with `available = true`.
5. Rank candidates in this order:
   1. explicit identity match
   2. exact `type` / `usage`
   3. exact opener match (`actionType` / `actionScope`)
   4. exact relation / association-field match
   5. better `name` / `description` match to the current business scene
   6. exact remaining structure match (`collection`, `resource`, `association`, `root use`)
   7. higher `usageCount`
   8. backend returned order
6. If no row is usable but the scene is repeat-eligible, bootstrap the first concrete scene and save it.

Rules that never change:

- `list-templates` is the truth source for automatic selection. Do not recreate frontend compatibility checks locally.
- A resolved explicit template still needs contextual availability whenever the write depends on opener / host / target compatibility.
- If the user explicitly requires that exact template and the current contextual result cannot prove it, stop at the compatibility explanation instead of silently switching templates.
- Without strong scene context, keep results discovery-only even when one keyword search hit “looks right”.

## Popup Write Fallback

- `popup.tryTemplate=true` is a write-time fallback, not a planning shortcut.
- When no explicit `popup.template` is present, default to `popup.tryTemplate=true` on popup-capable `add-field` / `add-fields`, `add-action` / `add-actions`, `add-record-action` / `add-record-actions`, `compose` popup specs, and whole-page `applyBlueprint` inline popup specs.
- If `popup.tryTemplate=true` misses and local popup content exists, that local popup content is the fallback.
- If `popup.tryTemplate=true` misses and there is no local popup content, let backend fallback continue. Do not invent a popup locally.
- `popup.saveAsTemplate={ name, description }` is the bootstrap path when the new local popup itself should become a reusable popup template immediately.
- `popup.saveAsTemplate` cannot be combined with `popup.template`.
- `popup.saveAsTemplate` may coexist with `popup.tryTemplate=true`: a hit reuses the matched template directly, while a miss needs explicit local `popup.blocks` so the fallback popup can be saved as a template.
- For repeated popup scenes with no usable template yet, prefer `popup.saveAsTemplate={ name, description }` on the first explicit local popup instead of delaying template creation to a second step.
- In this skill's whole-page prepare-write flow, explicit local inline popups with `popup.blocks` may auto-receive generated `popup.saveAsTemplate={ name, description }`; keep `popup.tryTemplate=true` unless the blueprint explicitly sets `popup.tryTemplate=false`.

## Auto-generated Name and Description

When the skill auto-creates a template:

- keep `name` short, readable, and in the current conversation language
- keep most structural/search detail in `description`, not `name`
- `description` should include reusable scene, collection/resource/association context, and key popup content / trigger clues that help later contextual search
- for popup seeds, include opener/resource or relation context so later contextual search can rank it higher
- avoid timestamps or hashes unless a real name collision forces them
- for whole-page prepare-write auto-generated popup seeds, derive `name` / `description` from the popup title or trigger first, then host block + popup local blocks as fallback context

## Read or Refine Template Metadata

- Use `get-template` to inspect the latest metadata or `usageCount`.
- Use `update-template` to refine `name` / `description` without changing the saved FlowModel tree.
- Keep `description` precise because it is intentionally searchable.

## Mode Selection

Choose mode only after one concrete template is selected:

- `reference`: standard reuse, consistency, or explicit shared maintenance
- `copy`: explicit local customization, detachment, or “start from this but keep it local”
- inline/non-template: one-off scene, discovery-only context, or no usable template

Do not use `copy` as a fallback when no concrete template was selected.

## Existing-reference Edit Routing

This section covers localized edits on live surfaces that already expose a template reference. It is separate from new template selection.

Default principles:

- If the user is editing template-owned content under an existing template reference, default to the template source.
- Page-scoped wording such as “这个页面里的字段”, “把这个页面的 X 去掉”, or a direct page URL does not mean local-only behavior. It is not local-only intent by itself.
- Keep current host / opener / `openView` wrapper settings local unless the user explicitly asks to change the shared template instead.
- Only use `convert-template-to-copy` for explicit local-only behavior, detachment, or copy mode.
- Do not use `copy` as a safety fallback. Stop and clarify instead of auto-detaching when scope is still unresolved.
- The helper flow for discovery/binding does **not** decide localized existing-reference edit routing.

template-owned content:

- popup inner blocks, fields, layout, details items, and actions
- structure / layout / fields / actions inside a referenced block template
- imported form-grid fields inside a referenced fields template

Host-local defaults:

- opener title, drawer/modal mode, size, and outer `openView` wrapper config
- `clickToOpen` and similar current-instance trigger behavior
- parent-page placement, sibling order, and surrounding layout outside the referenced subtree

Use this routing table before writing:

| user intent on an existing reference | result | default write target |
| --- | --- | --- |
| edit template-owned popup / block / fields content | `edit-template-source` | resolve the template through `get-template`, then edit the template `targetUid` subtree |
| edit current-instance opener/host config only | `edit-host-local-config` | write on the current live opener / host target |
| switch an existing popup opener to another popup template | `switch-template-reference` | `configure(changes.openView.template)` on the current opener |
| explicit “只改当前这个” / “不要影响别处” / `copy` / detach intent | `detach-to-copy` | `convert-template-to-copy`, then edit the detached local content |

## Backend Request Shapes

`list-templates` for popup discovery:

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

Whole-page planning without a live `target.uid` uses the same shape minus `target`. Keep only filters that the runtime actually supports.

`save-template`:

```json
{
  "target": { "uid": "employee-create-form" },
  "name": "Employee create form",
  "description": "Reusable employee create form with common fields and popup behavior.",
  "saveMode": "duplicate"
}
```

`get-template` / `destroy-template`:

```json
{ "uid": "employee-form-template" }
```

`update-template`:

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

Fields-only reuse from a form template switches `usage` to `"fields"`. Popup-capable creation uses `popup.template`, for example:

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

`configure(changes.openView.template)` switches an existing popup opener to another popup template:

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

## Save, Apply, and Switch

- Use `save-template` for all supported save cases. Required fields are `target.uid`, `name`, and `description`.
- `saveMode="duplicate"` creates only the template.
- `saveMode="convert"` creates the template and converts the current source to a reference when the source kind supports it.
- Block templates are used through `add-block`, `add-blocks`, or `compose`.
- Fields templates reuse the same saved block template with `usage = "fields"` or via top-level `template` on `add-field` / `add-fields`.
- Popup templates are used through popup-capable creation entry points via `popup.template`.
- Existing popup openers may switch templates through `configure(changes.openView.template)`. Do not generalize that rule to block or fields references.

## Reference vs Copy

- `reference` keeps the live link to the saved template and usually increases `usageCount`.
- `copy` detaches immediately and should not increase `usageCount`.
- Referenced popup / block / fields content is not anonymous local inline content. Edit the template source, switch the popup template through the supported path, or detach only for explicit local-only intent.

## Delete and Usage Accounting

- Use `destroy-template` only when the user explicitly wants to delete an unused template.
- The backend rejects deletion while `usageCount > 0`.
- Removing referencing UI nodes may decrease `usageCount` automatically.
- Do not promise successful deletion before checking the server response.

## What Not to Do

- Do not write raw template uid/mode fields directly into low-level step params or model settings.
- Do not use `openView.uid` as the default popup reuse mechanism.
- Do not assume block, fields, and popup templates share the same post-creation retargeting rules.
- Do not skip `list-templates` when template discovery is the real task.
- Do not skip whole-page probing just because there is no live `target.uid`.
- Do not auto-bind from keyword-only discovery results.
- Do not describe template compatibility as if the skill proved it locally; only contextual `list-templates` results can do that.
