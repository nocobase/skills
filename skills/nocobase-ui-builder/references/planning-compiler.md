# Planning Compiler

Read this file after a structural intent is already confirmed: either the user confirmed a `pageBlueprint`, or the user explicitly asked for a structural UI change on an existing Modern page surface. This file is the decision-complete compiler contract for confirmed structure changes: how intent maps into `plan.steps[]`, how step order is fixed, how popup steps are emitted, and what stays out of scope for default compiler output. Request envelopes live in [tool-shapes.md](./tool-shapes.md). Runtime verification lives in [verification.md](./verification.md). Popup runtime/readback rules live in [popup.md](./popup.md). Fixed-shape menu lifecycle changes such as `updateMenu` stay outside this compiler and continue to use their direct lifecycle path.

## 1. Compiler Input Modes

### Bootstrap mode

Use bootstrap mode when the compiler input has no existing editable surface yet:

- create a menu group
- create a new page/menu chain
- create the initial page/tab structure of a new Modern page

Compiler entry shape:

- `validatePlan({ plan })`
- `executePlan({ plan })`

Rules:

- do not send `surface`
- do not send `expectedFingerprint`
- use step-to-step references through `{ "step": "...", "path": "..." }`

### Existing-surface mode

Use existing-surface mode when the compiler input edits an existing page / tab / popup / content surface:

- `describeSurface(locator)`
- `validatePlan({ surface, expectedFingerprint, plan })`
- `executePlan({ surface, expectedFingerprint, plan })`

Rules:

- `surface.locator` should match the locator already used to anchor the surface
- `expectedFingerprint` should come from `describeSurface`

## 2. Compiler-Wide Rules

- Compile only the confirmed subset of the request. Do not silently widen scope.
- Cross-step references must use caller input shape `{ "step": "...", "path": "..." }`.
- Do not hand-write raw `{ "ref": "..." }` or `$ref`.
- `selectors.target/source` belong to the plan-step layer.
- One semantic step should have one clear owner target. Do not hide extra writes inside unrelated steps.
- Compiler output must be deterministic for the same confirmed intent.
- Reuse blueprint ids when they are stable; otherwise generate readable step ids through the policy below.
- `update-page` requires a real existing-surface locator. It must not silently downgrade into bootstrap `create-page`.

## 3. Blueprint Node -> Plan Step Mapping

This table is the authoritative mapping for default compiler output.

| Blueprint node / confirmed structure | Compiler output | Mode | Notes |
| --- | --- | --- | --- |
| bootstrap `group` | `createMenu(type="group")` | bootstrap | direct `createMenu(type="group")` is the low-level fallback when the user only wants one isolated group |
| bootstrap `menu-item` | `createMenu(type="item")` | bootstrap | `parentMenuRouteId` should come from a prior step when the group is created in the same plan |
| bootstrap `page` | `createPage` | bootstrap | `menuRouteId` should come from the menu-item step result |
| outer tab | `addTab` / `updateTab` / `moveTab` / `removeTab` | existing-surface | choose lifecycle step by confirmed intent |
| popup tab | `addPopupTab` / `updatePopupTab` / `movePopupTab` / `removePopupTab` | existing-surface | choose lifecycle step by confirmed intent |
| page-level semantic block with inline children | `compose` | existing-surface | default for a new block plus its fields/actions/recordActions/layout hints |
| standalone block on an existing container | `addBlock` | existing-surface | use when the block is intentionally isolated |
| field node under an existing container | `addField` | existing-surface | use when no new block is being introduced |
| action node under an existing container | `addAction` | existing-surface | non-record action |
| record action node under an existing container | `addRecordAction` | existing-surface | record-capable owner target only |
| existing node reorder | `moveNode` | existing-surface | use when reordering sibling nodes under the same parent/subKey |
| popup node with backend-default CRUD completion | opener step only | existing-surface | `addNew/view/edit` with no explicit `popup.blocks` and no explicit `popup.template` |
| popup node with explicit popup content | opener step carrying the confirmed popup content by default; emit later popup-content step(s) only when popup-targeted facts are required | existing-surface | preserve the confirmed popup semantics; do not split into later popup-content writes unless they are actually needed |
| popup node with popup template | opener step carrying `popup.template`, or opener step + later `configure` | existing-surface | choose by whether the opener already exists |
| popup node with `completion = "shell-only"` | opener step only | existing-surface | do not emit popup-content steps |
| small public configure-style change | `configure` | existing-surface | use `updateSettings` only when `configure` cannot express the confirmed change |
| raw settings / chart / JS / event-flow change | `updateSettings` / `setEventFlows` | existing-surface | choose by the public contract actually needed |
| full layout replacement | `setLayout` | existing-surface | keep full-replace semantics explicit |
| template detach intent | `convertTemplateToCopy` | existing-surface | only when a referenced popup/block/template must become local copy |
| destructive subtree intent | `destroyPage` / `removeTab` / `removePopupTab` / `removeNode` | existing-surface | keep blast-radius-sensitive steps explicit |

Default child-emission rule:

- Rows labeled `existing-surface` mean the step needs an already available target, which may come either from an existing locator or from a previous bootstrap step result in the same plan.
- If a new block is already being emitted through `compose`, its inline `fields/actions/recordActions` should stay inside the same `compose` step by default.
- Split child nodes into separate `addField/addAction/addRecordAction` steps only when the container already exists, ordering/guards require it, or the user explicitly wants a fine-grained mutation.

## 4. Compilation Order

Unless the confirmed intent explicitly requires another topological dependency, compile in this order:

1. bootstrap roots: menu group, menu item, page bootstrap chain
2. outer tabs
3. page-level blocks in layout order; if layout order is absent, use declaration order
4. fields / actions / recordActions that belong to an existing container, in declaration order
5. popup opener steps
6. popup content steps, only when the popup cannot stay on the opener step and instead requires later popup-targeted writes
7. supported interaction wiring such as `configure`, `updateSettings`, `setEventFlows`, and `setLayout`

Additional ordering rules:

- A popup-content step must depend on the opener step that returns `popupPageUid/popupTabUid/popupGridUid`.
- Popup-tab lifecycle steps must run only after the target `popupPage` already exists; if later steps target the created popup tab or its popup-content, emit `addPopupTab/updatePopupTab` before those downstream steps.
- When bootstrap page creation and initial content creation belong to the same plan, `createPage` must come before any step that targets the returned `gridUid/pageUid/tabSchemaUid`.
- Destructive steps should stay after the reads and targeting facts that justify them; do not schedule later writes that depend on nodes being removed.

## 5. Step ID Policy

Prefer stable, readable ids. Reuse explicit blueprint ids when they already satisfy that rule. Otherwise generate ids with the following patterns:

- bootstrap group/menu/page: human-readable ids such as `workspace`, `employeesMenu`, `employeesPage`
- block: `<blockId>`
- field: `<containerId>__field__<normalizedFieldPath>`
- action: `<containerId>__action__<actionIdOrType>`
- record action: `<containerId>__recordAction__<actionIdOrType>`
- popup opener: `<popupId>__opener`
- popup content: `<popupId>__content` or `<popupId>__content__<blockId>` when multiple popup-content steps are emitted
- interaction wiring: `<targetId>__configure`, `<targetId>__settings`, `<targetId>__flows`, `<targetId>__layout`

Normalization rules:

- `normalizedFieldPath` should replace separators such as `.`, `[`, and `]` with safe separators, then collapse duplicates.
- `actionIdOrType` should prefer an explicit blueprint/action id; otherwise use the public action type.
- Do not generate opaque numeric-only ids when a readable id can be derived from the confirmed structure.

## 6. Selector / Locator Policy

- Use `selectors.target/source.locator` when the step points to an already existing surface or node.
- Use `{ "step": "...", "path": "..." }` when the step points to a result created earlier in the same plan.
- Prefer `locator.uid` for node-like existing targets. Use `pageSchemaUid/tabSchemaUid/routeId` only when the target is genuinely being anchored through those root locators.
- Bootstrap `createMenu` / `createPage` steps do not use selectors; they carry their linkage through `values` plus `{ step, path }` references only.
- When `createPage` consumes a menu-item created earlier in the same plan, `values.menuRouteId` should come from the previous step result, not from a guessed route id.
- `target.mode = "update-page"` must carry a real existing-surface locator. The compiler must not silently rewrite it into bootstrap creation.
- `updateMenu` remains a direct lifecycle path. Do not emit it as default compiler output.

## 7. `compose` vs `add*`

### Prefer `compose`

Use `compose` when the confirmed change is a semantic block-level addition, especially when the same user intent naturally carries any of the following together:

- block + fields
- block + actions / recordActions
- block + popup opener / popup subtree
- block + inline layout

Typical examples:

- add a new table with its columns and row actions
- add a details block with fields
- add a form block with fields and submit
- add a markdown help block together with layout placement

### Prefer `addBlock`

Use `addBlock` when the user intent is only to place one standalone block and nothing else in the same structural step:

- add an empty markdown block
- add an empty iframe block
- add a placeholder action panel first

### Prefer `addField`

Use `addField` when:

- the container already exists
- the user intent is a precise field append
- the write does not need to introduce a whole new block

### Prefer `addAction` / `addRecordAction`

Use them when:

- the owner container already exists
- the user intent is a precise button / row action append
- the write does not need a whole new block-level composition

### Batch `addBlocks/addFields/addActions/addRecordActions`

- These are not the default compiler output.
- Only use them when the plan path cannot express the required batch precisely enough, or when the user explicitly wants low-level batch control on a concrete target.

## 8. Popup Compilation Semantics

### Backend-default CRUD popup completion

Emit only the opener step when all of the following are true:

- the opener type is `addNew`, `view`, or `edit`
- there is no explicit `popup.blocks`
- there is no explicit `popup.template`
- the confirmed intent accepts backend-default CRUD completion

In this case, the compiler should not emit extra popup-content composition by default.

### Explicit popup content or guard-sensitive popup

When the opener is being created now and the confirmed popup content is already known, keep that popup content on the opener step by default. This is an execution-time boundary, not a planner-facing feature: the compiler only needs to know whether later popup-targeted writes are required.

Emit staged popup steps only when any of the following is true:

- the popup decision depends on popup-content `resourceBindings` or scene guards
- the confirmed change needs later popup-targeted writes that require `popupPageUid/popupTabUid/popupGridUid`
- the opener already exists and the confirmed change is adding or replacing popup content after the opener step

Rules:

- Explicit `popup.blocks` alone does not force staged popup-content steps.
- If the confirmed popup content can be expressed directly on the opener payload, prefer that path.
- Only reuse popup uids from the opener result when a later popup-targeted step is actually needed.

Compiler output shape when staged popup steps are required:

1. opener step first
2. popup-content step(s) that reuse `popupPageUid/popupTabUid/popupGridUid` from the opener result
3. optional later `configure/updateSettings/setEventFlows` steps when the confirmed popup also carries those requirements

### Popup template routing

- If the opener is being created now and the confirmed popup is template-driven, prefer putting `popup.template` on the opener step.
- If the opener already exists and the backend contract allows template switching, emit a later `configure(changes.openView.template)` step instead.

### Shell-only popup

- Emit shell-only output only when the confirmed blueprint explicitly says `completion = "shell-only"` and the `Popup Shell Fallback Contract` allows it.
- Do not silently downgrade a requested usable popup into shell-only output.

## 9. Template Routing

### Template management: not part of compiler output

These are template management APIs, not default structure-execution steps:

- `listTemplates`
- `getTemplate`
- `saveTemplate`
- `updateTemplate`
- `destroyTemplate`

### Template execution: may appear inside compiler output

The compiler may still emit template-aware structure execution through:

- `compose` / `add*` payloads that carry `template`
- popup openers that carry `popup.template`
- `configure` changes that switch a popup template
- `convertTemplateToCopy`

Rule:

- separate "manage a template record" from "execute structure using a template"

## 10. Compiler Coverage / Out of Scope

### Default compiler-eligible plan actions

Current high-level coverage includes:

- `createMenu`
- `createPage`
- `compose`
- `configure`
- `updateSettings`
- `setEventFlows`
- `setLayout`
- `addTab`
- `updateTab`
- `moveTab`
- `removeTab`
- `addPopupTab`
- `updatePopupTab`
- `movePopupTab`
- `removePopupTab`
- `addBlock`
- `addField`
- `addAction`
- `addRecordAction`
- `moveNode`
- `removeNode`
- `convertTemplateToCopy`
- `destroyPage`

### High-risk plan actions

These still belong to the high-level path, but require explicit blast-radius awareness:

- `setLayout`
- `setEventFlows`
- `destroyPage`
- `removeTab`
- `removePopupTab`
- `removeNode`

### Out of scope for default compiler output

These are not default compiler output:

- `updateMenu`
- `addBlocks`
- `addFields`
- `addActions`
- `addRecordActions`
- `apply`
- `mutate`
- template management APIs

Fallback is allowed only when:

- current plan coverage cannot express the change safely and without losing the confirmed semantics
- or the user explicitly asks for low-level control on a concrete target
