# Templates

Read this file when the task involves saving a reusable UI template, searching/selecting templates, applying a template during `add*` / `compose`, switching popup-template targets, converting a reference to copy mode, or reasoning about template `usageCount`.

Canonical front door is `nocobase-ctl flow-surfaces`. JSON examples below default to the CLI raw body unless a block is explicitly labeled as MCP fallback. For CLI/MCP envelope mapping, see [tool-shapes.md](./tool-shapes.md). For popup-specific rules, see [popup.md](./popup.md). For general execution order, see [execution-checklist.md](./execution-checklist.md).

This file is the single normative template-selection source for `nocobase-ui-builder`. If another reference file summarizes template behavior and conflicts with this file, follow this file and shorten the other file instead of duplicating rules.

## Public page blueprint vs low-level template APIs

- If the user is authoring one whole page through public `applyBlueprint`, keep template usage inline inside the public page blueprint:
  - block template -> block `template`
  - popup template -> action/field `popup.template`
- Public `applyBlueprint` stays public and declarative. Keep template usage inline there, and do not translate low-level `openView` config shapes into the page blueprint.
- This file defines both template-selection semantics and the supported template lifecycle / low-level template entry points.

## What a Template Means

- A flow-surfaces template is a reusable FlowModel-backed subtree exposed through flow-surfaces APIs.
- Supported template `type` values are `block` and `popup`.
- `block` templates may also be consumed as `usage = "fields"` when the saved source is a supported form-like block and the caller only wants its grid fields.
- The backend keeps ownership checks, allowed-source checks, and usage accounting. Do not bypass those rules by writing raw template markers into model settings.

## Structure-repeat-first Selection

- Task understanding/routing still starts from user intent. This file only governs template planning after the current page/edit path and reusable scene are already understood.
- Decide whether the task contains a repeat-eligible reusable scene first. The template path is not the global default for every page element, but repeated structure in the same task is enough to enter the template path even when the user did not explicitly ask for reuse.
- Only switch into template discovery/selection when the request falls into one of the repeat-eligible scenes below, when the same task already contains two or more structurally matching scenes, or when one standard reusable scene already has strong enough context to be a good template candidate.
- For repeat-eligible popup / block / fields scenes, and for single standard reusable scenes with strong context, contextual `list-templates` probing is mandatory before binding one template or finalizing the inline fallback. Keyword-only search is discovery-only, not binding proof.
- `list-templates` is the only automatic-selection truth source. The skill must not recreate the frontend compatibility checks locally.
- Frontend/server compatibility dimensions such as resource, association, root `use`, and `filterByTk` are only for deciding which live context you must pass into `list-templates`; they are not a backup selector when the query context is incomplete.
- Whole-page `create` / `replace` is **not** exempt from template planning. When the draft contains a repeat-eligible scene, probe templates before locking in inline content.

## Repeat-eligible Scenes

Treat the task as entering the template path when it matches one of these scenes:

- a relation/display field should click and open a standard details popup
- business wording such as "all relation data should open detail popups", "relation displays inside the details block should also open popups", or "the popup should show that related record in a details block" counts as a strong cue for relation-details popup reuse when the same page contains both table/list-style relation displays and details-style relation displays
- a standard CRUD-style popup should be reused under a known opener, for example `view`, `edit`, `addNew`, or another confirmed popup-capable action/field
- a repeated form field layout should be reused under a host with compatible live collection/root-use context
- the same task contains two or more structurally matching popup / block / fields scenes
- the user explicitly asks to reuse, unify, or follow an existing template
- natural-language reuse cues such as "一样", "同样", "差不多", "沿用前面的思路", "保持一致", "别每次都重新排", or "不要每次都从零搭" also count as reuse intent when the surrounding popup / block / fields scene is already concrete enough
- one standard reusable popup / block / fields scene appears only once in the current task, but its opener/resource/association context is already strong enough that the skill should prefer template reuse or template seeding over silent inline fallback

Treat the task as inline/non-template by default in these scenes:

- highly customized or one-off popup/layout content
- obvious local customization or "start from that and modify it here" intent
- template search without enough live/planned scene context to describe the intended opener/resource shape
- a single standard scene whose context is still too weak to probe templates contextually

## Repeated-scene Signature

Use structural signatures rather than wording alone when deciding whether two scenes should share one template:

- `block`: compare block type, primary collection/resource/binding/association context, field order, record actions/actions, and behavior-changing settings. Ignore page-local titles, keys, and uids.
- `popup`: compare opener type, popup block tree, primary resource/binding/association context, field order, and actions/recordActions. Ignore outer page metadata.
- `fields`: compare host collection/root-use context, field order, renderer/popup/template behavior, and relevant field settings. Ignore host title and outer layout shell.
- For standard relation-details popups, a table-cell/display-field opener and a details/read-only-field opener on the same page should still count as the same repeated popup scene when the relation/association context and popup details content are otherwise the same. Do not let that lightweight opener-shell difference block template probing or popup template seeding.
- Only scenes with the same signature count as repeated. Similar wording alone is not enough when fields, actions, or data source semantics differ.

Multiple discovered/available templates do **not** by themselves make the task inline-only. If the scene is reusable, rank candidates first, directly bind one highest-probability winner when the ranking is clear, and if semantic ranking still ties, preserve backend order and keep the first compatible row. If the scene is repeated, or if it is a single standard reusable scene with strong context, and contextual probing still finds no usable template, bootstrap the first concrete scene and save it as a template after successful readback instead of dropping the reuse plan.

## Path Boundaries

- Localized existing-surface work with a live `target.uid` / opener is the normal place where automatic template selection may run.
- Whole-page `create` / `replace` should proactively probe templates for repeat-eligible scenes before finalizing inline popup/block/form-field content.
- A missing live `target.uid` does **not** by itself block whole-page template binding. Use the strongest available **planning context** instead.
- Planning context means the draft already knows enough about the intended reusable scene to build one contextual `list-templates` query, for example: target `type` / `usage`, intended `actionType` / `actionScope`, collection/resource/association/root-use semantics, and the business scene keywords.
- Do not bind `template` / `popup.template` from loose text search alone. Keyword-only search remains discovery-only. Binding still requires one contextual `list-templates` result that the backend marks usable for the planned scene.
- If both live context and planning context are too weak to describe the intended reusable scene, template search stays discovery-only and the write path should remain unresolved or inline/non-template by default.

## Popup Write Fallback

- `list-templates` remains the planning truth source. `popup.tryTemplate` is only the write-time fallback that lets the backend attempt direct popup-template reuse when planning already decided the scene is eligible but the request does not carry one explicit popup template binding.
- When no explicit `popup.template` is present, default to `popup.tryTemplate=true` for popup-capable `add-field` / `add-fields`, `add-action` / `add-actions`, `add-record-action` / `add-record-actions`, `compose` action / field popup specs, and whole-page `applyBlueprint` inline popup specs. Local popup blocks/layout may still remain as the miss fallback.
- When the user explicitly wants the new local popup itself to become a reusable template immediately, use `popup.saveAsTemplate={ name, description }` on those same create-time popup write paths instead of planning a second `save-template` call.
- When contextual probing found no usable popup template and the current write already includes the first repeated popup as explicit local `popup.blocks`, prefer `popup.saveAsTemplate={ name, description }` on that first popup instead of deferring template creation to a second step after readback. This is the default bootstrap path for same-page repeated popup scenes too, especially repeated relation/details popups.
- `popup.saveAsTemplate` requires explicit local `popup.blocks` and cannot be combined with `popup.template` or `popup.tryTemplate`.
- Backend matching stays server-owned:
  - non-relation popup scene -> match non-relation popup templates only
  - relation popup scene -> prefer the same relation / association-field popup template first, then fall back to a non-relation popup template
  - if multiple candidates are still usable, the backend selects the first returned row; do not recreate or override that ranking in the skill
- `popup.tryTemplate=true` does not replace contextual `list-templates`. Use contextual probing for planning, identity resolution, and user-visible decisions; use `popup.tryTemplate=true` only as the execution fallback when the write has no explicit `popup.template`.
- If `popup.tryTemplate=true` misses and the request also includes local popup blocks/layout, the local popup content still wins. If it misses and there is no local popup content, let the normal backend fallback path continue instead of inventing a popup locally.
- `popup.saveAsTemplate` only bootstraps that first local popup. Do not assume later sibling popups in the same request can already bind the freshly created template; keep later same-request siblings on `popup.tryTemplate=true`, local inline fallback, or a planned post-write localized rebind when one shared template reference must be visible immediately after the run.

## Task-level Multi-page Orchestration

- `applyBlueprint` still creates or replaces one page at a time. If the user asks for several pages, decompose the task into sequential page runs.
- Reuse across pages is still scene-based: popup templates, block templates, and `fields` usage. Do **not** treat an entire page as a template type.
- An earlier page in the same task may become a template seed only after its write and readback succeed and the reusable popup / block / fields scene is concrete enough to save.
- Use `save-template` on that concrete scene, not on the page as a whole.
- A same-task seed does **not** bypass contextual availability. Later pages must still call `list-templates` with the later page's live or planning context before binding.
- If no same-task seed or existing template is contextually usable yet and the task contains a repeated scene, the first successful concrete block/popup/fields scene becomes the bootstrap source: save it immediately after readback, and when supported prefer `save-template(saveMode="convert")` so the first repeated instance also becomes a template reference.
- For popup scenes only, if that first bootstrap source is already being created through a popup-capable write with explicit local `popup.blocks`, prefer the create-time shortcut `popup.saveAsTemplate={ name, description }` over a later standalone `save-template` call.
- If no same-task seed or existing template is contextually usable and the scene appears only once, stay inline/non-template only when the scene is one-off/custom or the planning context is still weak. For single standard reusable scenes with strong context, prefer bootstrap-after-first-write instead.

### Same-task live reuse loop

Use this concrete loop when page B should reuse a popup / block / fields scene created on page A in the same task:

1. create page A and finish the normal readback first
2. identify the concrete reusable source uid from that readback, for example a popup-capable `view` action uid
3. call `save-template` on that concrete source; when supported and the goal is one shared live template across all repeated instances, prefer `saveMode="convert"`
4. immediately call `get-template` on the returned template uid; if it cannot be read back, stop before planning reuse
5. when planning page B, run contextual `list-templates` again with page B's opener/resource scene; do not bind from the page-A seed alone
6. bind `popup.template` / `template` on page B only when that later-page result still shows the chosen uid as `available = true`
7. after page B writes in `reference` mode, re-read `get-template`; `usageCount` should usually increase and acts as a secondary confirmation

This loop was verified live against `nocobase-ctl flow-surfaces` for a users-record `view` popup saved on one page and later rebound on another page. Treat that as proof that same-task reuse must stay command-driven, not as permission to skip the contextual re-probe.

## Identity Resolution

- An explicit template `uid` resolves one exact candidate identity.
- An explicit template `name` resolves identity only when it matches exactly one candidate; if several templates match, present the candidates and ask the user to choose an exact uid.
- Identity resolution does **not** prove current-context compatibility. Any path that depends on a live opener/host/target context still needs contextual availability checking.

## Decision Table

Enter this table only when the task already matches a repeat-eligible reusable scene, or when the user explicitly named an existing template.

| request shape | template identity | live opener / target context | contextual usable candidates | result |
| --- | --- | --- | --- | --- |
| user explicitly named a non-unique template `name` | ambiguous | any | n/a | present matches and ask for an exact uid; do not bind |
| user explicitly named a template `uid`, or one unique template `name` | resolved | no live target, but planning context is still weak | n/a | discovery-only; identity is known, availability is not yet proven |
| whole-page or localized flow | resolved explicit template | yes live/planned context | explicit template row `available = true` | select that template, then choose `reference` or `copy` |
| whole-page or localized flow | resolved explicit template | yes live/planned context | explicit template row missing or `available = false` | do not bind; surface `disabledReason` or the compatibility gap |
| whole-page or localized flow | no explicit template, repeated scene detected | yes live/planned context | `0` | build the earliest repeated popup/block/fields scene as the bootstrap source, then `save-template`; prefer `saveMode="convert"` when supported |
| whole-page or localized flow | no explicit template, single standard reusable occurrence | yes live/planned context | `0` | bootstrap the first concrete popup/block/fields scene, then `save-template`; prefer `saveMode="convert"` when supported |
| whole-page or localized flow | no explicit template, single occurrence only but one-off/custom | yes live/planned context | `0` | inline/non-template |
| whole-page or localized flow | no explicit template | yes live/planned context | `1` | select that template, then choose `reference` or `copy` |
| whole-page or localized flow | no explicit template | yes live/planned context | `>1`, stable best candidate exists | auto-select the best candidate, then choose `reference` or `copy` |
| whole-page or localized flow | no explicit template | yes live/planned context | `>1`, semantic ranking still tied after ranking | preserve backend order and auto-select the first compatible row |

## Automatic Selection Rule

Use the decision table above as the normative router. When the chosen row still allows automatic binding, and no exact template has already been resolved, apply this exact candidate-selection order:

1. confirm the task matches a repeat-eligible reusable scene
2. gather the strongest context you can: real `target.uid` first, otherwise one strong planning context from the current whole-page draft
3. call `list-templates` with that context
4. filter to the intended `type` / `usage` / opener/resource context
5. keep only rows with `available = true`
6. rank the remaining candidates using the stable best-candidate rule below
7. automatic binding is allowed when one top candidate wins that ranking, or when the remaining semantic tie is resolved by backend order and the first compatible row

Interpretation rules:

- Do not treat `available = true` as a recommendation signal. It only means the backend considers the template technically usable in the current context.
- An explicit template `uid` / `name` does not bypass contextual availability when the path depends on a live opener/host/target context.
- If a resolved explicit template is missing from the current contextual result, or its row is `available = false`, do not bind it. Surface `disabledReason` when available; otherwise explain that compatibility could not be proven from the current live context.
- If the user explicitly requires that exact template, stop at the compatibility explanation instead of silently switching to inline content or another template.
- Without a live `target.uid`, search results may still drive whole-page binding when the planning context is strong enough and the backend returns a stable best available candidate.
- Without either a real live target or a strong planning context, search results are only discovery and must not drive automatic binding.
- If zero candidates are `available = true` and the task already contains a repeated popup / block / fields scene, bootstrap the first concrete repeated scene and save it as a template after successful readback instead of dropping the reuse plan.
- If zero candidates are `available = true` and the scene appears only once, continue without a template only when it is one-off/custom or the context is still weak. For a single standard reusable scene with strong context, bootstrap it after the first successful write and save the template immediately.
- If multiple candidates are `available = true`, do **not** stop early just because the count is greater than one. First apply the stable best-candidate ranking and directly bind the highest-probability winner when it is clear.
- If the top candidates still tie on semantic ranking, keep the backend returned order and use the first compatible row instead of inventing another heuristic.

## Stable Best-candidate Ranking

When more than one `available = true` candidate remains, rank them in this exact order:

1. explicit identity match (`uid` first, then one unique exact `name`)
2. exact `type` / `usage` match
3. exact opener match (`actionType` / `actionScope`)
4. exact relation / association-field match for the planned scene
5. better name/description match to the current business scene and entity wording
6. exact remaining structure match for the planned scene (`collection`, `resource`, `association`, `root use`, and equivalent backend-supported context filters)
7. higher `usageCount`
8. backend returned order as the final deterministic tie-break

If the available data still leaves the top candidates equal on semantic ranking after steps 1-7, use step 8 (backend returned order) and keep the first compatible row as the final deterministic winner.

## Default Model Behavior

1. If the user supplied a template `uid` or `name`, resolve identity first. A `name` must resolve uniquely, or you must ask for an exact uid.
2. If the final write path depends on opener/host/target context, run contextual `list-templates` or another equivalent live availability check even for explicitly named templates.
3. If no explicit template was provided and the request falls into a repeat-eligible scene, call `list-templates` first. This applies to whole-page drafts too.
4. Prefer rows with `available = true`, then rank them with the stable best-candidate rule. Auto-bind when one winner remains.
5. Once one concrete template is both resolved and contextually usable, decide `mode`. Default selected templates to `reference`; switch to `copy` only when the request clearly asks for local customization / detachment.
6. If no concrete template was selected because zero usable templates exist but the task already contains a repeated popup/block/fields scene, or it contains one single standard reusable scene with strong context, bootstrap the earliest concrete scene and save it as a template so later matching scenes can reuse it. For popup-capable writes that already carry explicit local `popup.blocks`, prefer create-time `popup.saveAsTemplate={ name, description }`; otherwise save it after successful readback. Prefer `saveMode="convert"` when supported so the first reusable instance also becomes a template reference.
7. Otherwise, if no concrete template was selected, or current-context availability is not proven, stay inline/non-template unless the user explicitly requires that template and is waiting on a compatibility explanation.
8. If the top candidates still tie on semantic ranking, keep the backend returned order and use the first compatible row as the final deterministic winner instead of falling back to inline content or asking.
9. Only use documented template entry points (`list-templates`, `get-template`, `save-template`, `update-template`, `destroy-template`, `convert-template-to-copy`, `add-*`, `compose`, `configure`). Do not patch hidden template fields manually.

## Search and Selection

Use `list-templates` when you need to discover applicable templates. Main filters:

- `type = "block" | "popup"`
- `usage = "block" | "fields"` for block templates
- `search` for name + description matching
- `target.uid` whenever a real live target/opener exists
- `actionType` and `actionScope` when the user needs popup templates for a specific opener context
- when whole-page planning has no live target yet, use the strongest scene filters that the live CLI/backend `list-templates` contract exposes for resource / association / root-use compatibility instead of downgrading the task to inline-only

Interpretation rules:

- `available = true` means the backend considers the template usable in the current context.
- `disabledReason` explains why it cannot be used in the current context. Surface that reason instead of retrying with guessed payloads.
- Treat `list-templates` as the source of truth for template availability. Do not try to recreate the frontend filtering logic inside the skill.
- An explicit template `uid` still needs contextual availability whenever the real write depends on live opener/host/target compatibility.
- An explicit template `name` must resolve uniquely before compatibility checking. If several templates match, present the candidates and ask for an exact uid.
- When popup template discovery is the real task, always send `type = "popup"`. When a live opener is known, also send `actionType` and `actionScope`.
- Without a live `target.uid`, whole-page planning should still probe templates with the strongest supported scene context from the draft. Those results may drive automatic binding when the ranking produces one stable best candidate.
- A search result that "looks right" is still not enough for automatic binding if the scene context is incomplete or the top candidates remain tied. Keyword-only search is discovery-only even when one result looks semantically correct.
- `description` is required and intentionally searchable. Encourage precise descriptions when saving/updating templates.

## Local Helper Enforcement

- Prefer `nb-template-decision plan-query` to derive one contextual `list-templates` request from scene context before the real probe.
- Prefer `nb-template-decision select` to normalize the probe result into `selected`, `discovery-only`, `inline-non-template`, or `needs-user-choice`.
- `select` should consume the `plan-query` `probe` object, not raw candidates alone. A missing or non-contextual probe must keep the result discovery-only (or fail contract validation), even when one candidate looks usable.
- For helper input, a bare `explicitTemplate` string resolves identity as `uid` first, then as one unique exact `name` when no uid matches.
- In helper output, `needs-user-choice` is for explicit template identity ambiguity only, not for ranking ties.
- The helper may expand search terms from collection / association / field / opener context, including lightweight singular variants such as `roles -> role`, but keyword-only search still stays discovery-only until the scene context is strong enough.
- The helper must not invent backend-only planning fields; keep the final `list-templates` request to supported keys such as `target`, `type`, `usage`, `actionType`, `actionScope`, `search`, `page`, and `pageSize`.
- Current runtime prewrite/readback helpers do not auto-run `plan-query -> list-templates -> select`; callers must invoke that helper flow explicitly when they want the hard gate enforced in local runtime automation.
- In skill execution, standard reusable single scenes should set the scene intent so this helper flow still runs even without a second occurrence in the same task.

## Auto-generated Name and Description

When the skill auto-creates a template because a repeated scene had no usable existing template:

- `name` should be a short readable label in the current conversation language. If the conversation is in Chinese, use a Chinese readable name; if it is in English, use an English readable name.
- Keep `name` human-facing and concise, for example `角色表格`, `角色详情弹窗`, or `User edit form fields`.
- Put most structural and search information in `description`, not in `name`.
- `description` should include the reusable scene, collection/resource/association context, key fields, key actions/recordActions, default mode, and an `auto-generated by nocobase-ui-builder` marker when that template was created automatically.
- For popup seeds, include the opener/resource or relation context in `name`/`description`, for example `角色详情弹窗` or `借阅记录-图书详情弹窗`, so later contextual `list-templates` search can rank it higher.
- Avoid timestamps or hashes in `name` unless they are the minimum needed to resolve a real name collision after signature comparison.

## Read or Refine Template Metadata

- Use `get-template` when the user already knows a template uid and needs its latest metadata or `usageCount`.
- Use `update-template` when the user wants to rename a template or improve its searchable `description` without changing the stored FlowModel tree.
- Prefer descriptions that include the reusable scene, opener type, live collection/root-use hint, and the intended default mode when that helps later search/selection.

## Mode Selection

Mode selection only happens after template selection. `copy` is not a fallback when no concrete template was selected.

Choose the mode only after a template is actually selected:

- use `reference` when the goal is standard reuse, consistency, or explicit cross-surface unification
- use `copy` when the user wants to start from a selected template but clearly expects local customization or detachment from the original
- use inline/non-template content when the scene appears only once, the context is discovery-only, no template is available, or the scene is obviously one-off/custom

Do not silently turn a clear local-customization request into `reference`.

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

`list-templates` for whole-page planning when no live `target.uid` exists yet:

```json
{
  "type": "popup",
  "actionType": "view",
  "actionScope": "record",
  "search": "employee popup",
  "page": 1,
  "pageSize": 20
}
```

When no live `target.uid` exists yet, omit `target.uid` and only use filters already exposed by the live CLI/backend contract. Do not invent extra planning-only fields; resource / association / root-use scene filters may be added only when that runtime surface explicitly supports them.

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

Naming guidance:

- Prefer a short readable `name` in the current conversation language.
- Keep business meaning in `name`; keep search detail in `description`.
- For automatically created templates, prefer names like `角色表格`, `角色详情弹窗`, or `User registration form`, then describe the exact fields/actions/context in `description`.

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

When the goal is "create this popup and immediately keep it as a reusable template seed", use `popup.saveAsTemplate={ name, description }` on those same create-time popup entry points and on whole-page `applyBlueprint` inline popup specs. The backend will save the local popup as a popup template and convert the created popup to that template reference immediately.

Use inline `popup.blocks/layout` only when the user wants local popup content rather than template reuse.

For public `applyBlueprint`, keep the same rule: use inline `popup` / `popup.template` only, never low-level popup-retarget config shapes.

When no explicit `popup.template` is present, prefer `popup.tryTemplate=true` on those popup-capable write paths instead of inventing a guessed template uid. Local popup content may remain as the miss fallback. Keep the final planning/preview explanation grounded in contextual `list-templates`, not in local compatibility guesses.

## Update an Existing Popup Template Reference

Popup templates are special: an existing action or field opener may switch to another popup template through `configure(changes.openView.template)`, subject to the live backend contract.

Use this when the user says things like:

- "把这个按钮的弹窗模板换成另一个"
- "让这个字段改用另一个 popup template"

Do not generalize this rule to block or fields-template references. Those should not be treated as freely retargetable after creation.

When the caller wants the backend to attempt automatic popup-template reuse on an existing opener without naming one exact template, `flowSurfaces apply` popup specs and low-level `configure(changes.openView.tryTemplate=true)` are the corresponding execution fallback paths. Keep planning/identity decisions on `list-templates`; use `openView.tryTemplate` only as the write-time fallback.

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
- Do not skip whole-page template probing just because there is no live `target.uid`
- Do not auto-bind a template from loose discovery results in whole-page `create` / `replace`; binding must still come from one contextual backend result plus the stable best-candidate rule
- Do not describe template compatibility as if the skill proved it locally; only the contextual `list-templates` result may do that
