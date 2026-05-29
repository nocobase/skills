# Local Edit Quick Route

Use this file as the default first stop for normal edits on an existing live Modern page.

Stay on this route when the request is "change one part of an existing page" rather than "rebuild the whole page".

## URL-derived start uid

When the user gives a NocoBase admin URL for a precise edit on an existing page, popup, or form, derive only the start uid from the URL before the first read:

- if the URL contains one or more `view/<uid>` segments, the last `view/<uid>` wins
- if the URL has no `view/<uid>`, fallback to the `admin/<pageSchemaUid>` segment and read it with page-level `get --page-schema-uid`
- this derived uid is only the start uid for the first `flow-surfaces get` or live readback, not the final content uid
- after choosing the start uid, continue the normal live expansion through popup / template / content routing
- do not stop early on an outer `details`, `table`, or action host just because that tree is the first one you read

## Common-case flow

1. Resolve the start target first from an admin URL or explicit uid, then read that surface with the backend `get` action.
2. Use `describe-surface` only when the richer public tree really helps.
3. Use `catalog` only when capability uncertainty is the blocker.
   For localized `comments` and `recordHistory` adds, `catalog` is mandatory because availability depends on the target surface, popup scene, associations, plugin state, and collection metadata. If the block or resource binding is absent, do not guess a payload.
4. Choose the smallest write family that matches the intent: `compose`, `add-*`, `configure`, `update-settings`, `move-*`, or `remove-*`.
5. Keep common public keys inline when possible: `title`, `label`, `required`, simple button `type`, and similar semantic `settings` do not need a deep settings pass first. Use `displayTitle` only on block families whose runtime configureOptions expose it; known unsupported cases include `chart` and `tree`.
   For AI employee / AI assistant actions, use `catalog`, then `add-action`, `add-record-action`, `configure`, or `update-settings` with public `type: "aiEmployee"` and `settings` / `changes`; read [ai-employee-actions.md](./ai-employee-actions.md). Do not write raw AI `props`, `stepParams`, `flowModels`, or database rows.
6. Use `set-layout` only for explicit whole-layout replacement after full live readback. For low-level `set-layout`, `rows` is `Record<string, string[][]>`, each row entry is one column cell of stacked live child `uid`s, `[[uidA], [uidB]]` means two same-row columns, `[[uidA, uidB]]` means one stacked column, and `sizes` is `Record<string, number[]>`. Do not reuse page/popup `{ rows: [[{ key, span }]] }` layout or block `key`s here.
7. For popup-capable localized writes, split opener-local config from popup-owned content: `clickToOpen`, outer `openView`, title, size, and mode stay on the opener; popup inner blocks/layout/template routing follow [popup.md](./popup.md) and [templates.md](./templates.md).
8. When no explicit `popup.template` is present on `compose` / `add-field` / `add-action` / `add-record-action`, keep `popup.tryTemplate=true` as the default execution fallback. If the first local popup should immediately become reusable, keep `popup.saveAsTemplate={ name, description }` alongside that path: a hit reuses the matched template directly, while a miss needs explicit local `popup.blocks` so the fallback popup can be saved. Emit `popup.tryTemplate=false` only for explicit no-template / no-reuse / local-only / current-only / copy / detach intent.
9. For localized creates, after the write, read back the persisted actions, popup/template binding, and click/open behavior before planning follow-up edits.
10. When the request says `树筛选 / 树状筛选 / tree filter / tree filter block`, prefer a `TreeBlockModel` block (`add-block` or `compose` with `type: "tree"`) bound to the requested collection. Do not first create `filterForm` unless the user also asks for a normal query form. For common tree settings, use semantic keys such as `title`, `searchable`, `includeDescendants`, `defaultExpandAll`, `titleField`, `fieldNames`, `pageSize`, `dataScope`, and `sorting`; avoid unsupported display-only keys such as `displayTitle`.
    - For a new localized tree that should connect to an existing target block, use `addBlock` with `settings.connectFields.targets[].targetId` or `targetBlockUid`.
    - For same-run localized `compose`, use `settings.connectFields.targets[].target` with the same-run block key.
    - For an existing tree, use `configure` with `changes.connectFields`; `targets: []` clears only that tree's connections.
    - For live `targetId` / `targetBlockUid` writes, let backend authoring resolve live topology and collection metadata; if the target context cannot be proven, it returns a stable aggregate validation error.
    - Same collection can omit `filterPaths`; cross-collection targets must include `filterPaths`, for example `["department.id"]`.
    - Do not repeat the same target in one tree `targets` array; keep one entry with the final `filterPaths`.
    - `titleField` is display-only; the selected filter value comes from the tree key / `filterTargetKey`, so do not connect bigint `id` values to string/select fields like `intelType`.
    - Do not write raw `filterManager` in localized public payloads.
11. When the request says “给表格 / 列表 / Grid / gridCard / 日历 / calendar / 看板区块 / kanban 增加筛选”, or explicitly adds search to a table / list / Grid / gridCard / calendar / kanban / card-like host, including “支持搜索 / 带搜索 / 可搜索 / searchable”, and does not explicitly mention a filter/search block or form, default to that existing data block's `filter` action. Do not create a `filterForm` shell unless the user explicitly asks for one. If the localized write creates a new direct non-template public `table` / `list` / `gridCard` / `calendar` / `kanban` block through `compose`, `add-block`, or `add-blocks`, omitted `defaultFilter` is materialized by backend authoring from live metadata with up to 4 scalar/filterable fields. Provide explicit block-level `defaultFilter` only when overriding those generated fields. Explicit empty, invalid, relation-field, unknown-path, or filters with fewer fields than the smaller of 3 and the collection's eligible direct interface-field count are rejected through backend aggregate `errors[]`; for relation filters use a child path such as `department.title`, not `department` itself. For every direct public data surface, partial `actions` complete to that host's defaults (`filter` / `refresh` / `addNew`, plus table `bulkDelete`). Ordinary table partial `recordActions` complete to `view` / `edit` / `delete`; tree table `recordActions` do not complete those defaults and should be omitted unless explicitly requested. If both block-level `defaultFilter` and filter action `settings.defaultFilter` exist, the action-level one wins. Page-noun wording such as “搜索页 / 搜索结果页 / 搜索门户” should not take this path by default, even if the same sentence also says “支持搜索”.
12. For update action field assignment, use only `settings.assignValues`:
    - `bulkUpdate` is a collection action under block `actions`
    - `updateRecord` is a record action under `recordActions`
    - `assignValues` must be a plain object keyed by fields in the host collection metadata; `{}` clears assignment values
    - do not use `add-fields`, raw `flowModels`, `AssignFormGridModel`, or `AssignFormItemModel`
13. For submit/update workflow bindings, use only `settings.triggerWorkflows` on new actions or `configure.changes.triggerWorkflows` on existing action nodes:
    - form submit and record `updateRecord` support it; `bulkUpdate` and filter-form submit do not
    - each row is `{ workflowKey, context? }`; `[]` clears bindings and `null` is invalid
    - do not write raw `flowModels` or internal `stepParams`
14. When localized work must create a `createForm`, `editForm`, `details`, or `filterForm` with a controlled inner field grid, prefer `compose` plus block-level `fieldsLayout`. It must place every keyed field exactly once, and each object cell `span` must be numeric. Omit `fieldsLayout` for ordinary `createForm`, `editForm`, and `details` creation so the backend default grid can make ordinary fields two per row and live `richText` / `vditor` plus `divider` rows full width. `addBlock` can also accept `fieldsLayout` with inline `fields` for a single new block, but prefer `compose` when the first write must coordinate field placement with sibling blocks or page layout.
15. When you author one localized `compose` / `add-block` / `add-blocks` / `configure` body, send the raw business object directly through `nb api flow-surfaces <action>`. The backend validates host-aware shape before write side effects and returns aggregate `errors[]`; repair the full list and retry the raw payload.
16. Open [tool-shapes.md](./tool-shapes.md) only when you are ready to form the exact raw nb body.

## Minimal routing table

| Intent | Default path |
| --- | --- |
| add/update content under an existing surface | `compose` / `add-*` / `configure` / `update-settings` |
| replace one existing full grid layout | `set-layout` |
| localized event-flow edit | `get-event-flow-meta` -> `add-event-flow` / `set-event-flow` / `remove-event-flow` |
| replace existing event flow registry | `set-event-flows` |
| reorder/remove tabs or popup tabs | `move-tab` / `remove-tab` / `move-popup-tab` / `remove-popup-tab` |
| reorder/remove nodes | `move-node` / `remove-node` |

## Default artifact-only output

For artifact-only localized edits, write only under:

```text
.artifacts/nocobase-ui-builder/<scenario-id>/
```

Leave exactly:

- `mutation-plan.json`
- `readback-checklist.md`

The JSON can stay schematic. It only needs the target locator, chosen write family, and the minimum readback target.

## Open next only if needed

- [runtime-playbook.md](./runtime-playbook.md) for the full family / locator model
- [capabilities.md](./capabilities.md) when the main question is block vs field vs action
- [settings.md](./settings.md) only when the change no longer fits the common public semantic keys above
- [ai-employee-actions.md](./ai-employee-actions.md) if the edit adds or reconfigures AI employee tasks
- [blocks/comments.md](./blocks/comments.md) or [blocks/record-history.md](./blocks/record-history.md) if the edit adds comments, discussion threads, record history, or audit history
- [popup.md](./popup.md) when the localized edit changes popup/openView/click-to-open behavior
- [template-quick.md](./template-quick.md) if the live target already carries a template reference
- [reaction-quick.md](./reaction-quick.md) if the real request is default values, linkage, computed fields, or show/hide / disable state

## Switch away when

- the request is really whole-page create / replace -> [whole-page-quick.md](./whole-page-quick.md)
- the request is really reaction work -> [reaction-quick.md](./reaction-quick.md)
