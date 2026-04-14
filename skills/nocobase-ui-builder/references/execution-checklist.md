# Execution Checklist

Canonical front door is `nocobase-ctl flow-surfaces`. Use CLI first, and treat MCP only as the fallback transport after the CLI path has been repaired and still cannot expose the required runtime command family.

Use this checklist by default. For global rules, see [normative-contract.md](./normative-contract.md).

## 1. Preflight

- Confirm `nocobase-ctl` is available.
- Run `nocobase-ctl --help` and `nocobase-ctl env --help`.
- If the current env is missing or incomplete, repair it first:
  - `nocobase-ctl env add --name <name> --base-url <http://host:port/api> --token <token>`
  - `nocobase-ctl env use <name>`
  - `nocobase-ctl env update`
- After the env is ready, run `nocobase-ctl flow-surfaces --help`.
- Before first use of a specific subcommand, run `nocobase-ctl flow-surfaces <subcommand> --help`.
- Confirm the task is really about Modern page (v2) UI.
- Decide whether the request is **whole-page create/replace** or **localized edit**.
- If one user request spans several pages, decompose it into ordered page runs first. `applyBlueprint` still stays one page at a time.
- If the request needs real fields/relations/bindings, gather live schema facts before writing.
- If JS is involved, validate JS first.
- If the request needs block / form fields, derive the candidate field list from `collections:get(appends=["fields"])` and drop any field whose `interface` is empty / null before authoring blueprint.
- If template reuse may be relevant, read [templates.md](./templates.md) before choosing inline vs template authoring. Treat it as the only template-selection rule source; this checklist keeps only the execution boundary.
- Whole-page `create` / `replace` should not skip this step. Probe reusable popup/block/fields scenes before finalizing inline structure.
- If a later page should reuse a scene from an earlier page in the same task, the earlier page must first finish and read back successfully; only then may you `save-template` the concrete popup/block/fields scene for later reuse. Later pages still need contextual `list-templates`.
- For same-task `reference` reuse, add two lightweight checks around that handoff: `get-template` must succeed immediately after `save-template`, and after the later-page bind a follow-up `get-template` should usually show higher `usageCount`.
- If the request mentions default values, linkage, computed values, show/hide, required/disabled, or action state, decide explicitly whether this is a whole-page reaction task or a localized reaction task before choosing structural APIs.
- If a target menu group is named by title, inspect the live menu tree before authoring. When one or more visible same-title groups already exist, do **not** create another same-title group for disambiguation; prefer exact `routeId` reuse, otherwise choose one existing group deterministically from the live tree and disclose that routeId in the prewrite preview.
- The deterministic same-title group tie-break is: first prefer a same-title group already containing the target page title; otherwise choose the visible top-level same-title group with the smallest `sort`, tie-break by the smallest route id.
- Before any write or body-based read, confirm the transport shape:
  - CLI `get` -> top-level locator flags, no JSON body
  - CLI body-based commands -> raw JSON business object through `--body` / `--body-file`
  - MCP fallback -> the same business object may need to be wrapped under `requestBody`
- Never invent `"root"` as `target.uid` / `locator.uid`; only use live uids from `get` / `describeSurface` / create responses.

## 2. Choose Intent

| intent | default path | minimum readback |
| --- | --- | --- |
| `inspect` | menu tree for menu questions; otherwise `nocobase-ctl flow-surfaces get`; use `describe-surface` only when its richer tree helps analysis | read-only answer |
| `draft-page-blueprint` | gather facts -> author simplified page blueprint -> ASCII prewrite preview and stop without writing | no write |
| `apply-page-blueprint` | simplified page blueprint -> `nocobase-ctl flow-surfaces apply-blueprint` -> `get` readback | `get({ pageSchemaUid })` |
| `apply-page-blueprint` + reaction | simplified page blueprint + top-level `reaction.items[]` -> `nocobase-ctl flow-surfaces apply-blueprint` -> `get` readback | `get({ pageSchemaUid })` + target reaction slot checks |
| `edit-existing-surface` | `get` / `describe-surface` / `catalog` as needed -> matching low-level `flow-surfaces` command -> readback | parent/target readback |
| `edit-existing-surface` + reaction | `get` if target unknown -> `get-reaction-meta` -> matching `set-*` rules -> readback | target readback + write result `resolvedScene` / `fingerprint` |
| `create-menu-group` | direct `create-menu` | return value or menu tree |
| `move-menu` | menu tree if needed -> `update-menu` | menu tree |
| `reorder` | `move-tab` / `move-popup-tab` / `move-node` | parent/page/popup readback |
| `delete-ui` | `destroy-page` / `remove-tab` / `remove-popup-tab` / `remove-node` after blast-radius read | destructive readback |

## 3. Whole-page Create / Replace Path

Use this path when the user is describing one page as a whole.

### Default use

- create one new Modern page from business intent
- replace / rebuild one existing page as a whole
- when one business request spans multiple pages, execute this path one page at a time

### Do not use `applyBlueprint` for

- add one block / field / action
- move one node
- rename one tab
- change one popup / tab setting
- remove one node / tab / popup tab

1. If this task spans multiple pages, freeze the current page boundary first. Draft, preview, write, and read back one page before starting the next page.
2. Read [page-intent.md](./page-intent.md), [page-blueprint.md](./page-blueprint.md), and [ascii-preview.md](./ascii-preview.md).
3. Discover real collections/fields/relations if the page is data-bound.
4. Choose a page archetype from [page-archetypes.md](./page-archetypes.md) only as a starting pattern.
5. Draft or assemble one **page blueprint** document.
6. If the same page also needs interaction logic, add top-level `reaction.items[]` in the same blueprint instead of splitting structure and reactions into separate whole-page writes.
7. If template reuse looks attractive, probe templates before finalizing inline content. When there is no live host/opener yet, use the strongest planned opener/resource scene context rather than downgrading the task to discovery-only immediately. Binding rules stay in [templates.md](./templates.md).
8. For a normal single-page request, default to exactly **one tab** unless the user explicitly asked for multiple route-backed tabs. Side-by-side blocks, relation tables, and deep popup chains stay inside that tab. Do not carry empty / placeholder tabs in the draft.
9. Shrink the draft to the minimal executable structure before first write: remove placeholder `Summary` / `Later` / `备用` tabs and explanatory `markdown` / note / banner blocks unless the user explicitly asked for them.
10. Before the **first** `applyBlueprint`, run the local prepare-write gate (`node ./runtime/bin/nb-page-preview.mjs --stdin-json --prepare-write` or helper `prepareApplyBlueprintRequest(...)`) and then run the authoring self-check:
   - tabs count matches the request
   - if this is a normal single-page request, `tabs.length` is exactly `1`
   - every `tab.blocks` is a non-empty array
   - there is no empty / placeholder tab
   - there is no placeholder `markdown` / note / banner block
   - no block object contains `layout`
   - every `tab.layout` / `popup.layout` is an object; if you are unsure, omit `layout`
   - block `key` values are unique within the document
   - every field named in any blueprint `fields[]` is backed by live `collections:get(appends=["fields"])` truth with a non-empty `interface`
   - every field entry in blueprint `fields[]` stays a simple string unless `popup` / `target` / `renderer` / field-specific `type` is actually required
   - every custom `edit` popup contains exactly one `editForm`
   - if `reaction.items[]` exists, each reaction target is a same-run local key / bind key, not a live uid
   - each reaction item object only uses `type`, `target`, `rules`, and optional `expectedFingerprint`; do not carry an item-level `key`
   - any tab / block / action referenced by `reaction.items[]` has an explicit stable key path in the authoring JSON; do not rely on generated fallback keys such as `submit_1`
   - in `replace`, those explicit keys only need to be stable within the current write; prefer role-suffixed or page-scoped names such as `mainTab`, `usersTableBlock`, `createFormBlock`, `submitAction`, and `maintainAction` over bare generic keys like `main`, `usersTable`, or `submit`
   - the gate must catch structure mistakes such as extra outer tabs, stringified body content, illegal tab keys, block-level `layout`, invalid `tab.layout` / `popup.layout`, and broken custom `edit` popups before the first write
   - if any item fails, rewrite the blueprint before the first write; do not use backend errors as the first validator
11. Before the **first** `applyBlueprint` on any whole-page task, show one ASCII wireframe rendered from that same blueprint. Prefer the same local prepare-write gate because it emits that preview and the normalized CLI body together. This preview is mandatory even when execution will continue immediately afterward. Keep it concise: short intent summary + one wireframe, popup expansion depth exactly **1**, JSON hidden unless the user explicitly asks for it or a technical review still needs it.
12. If the request is ambiguous, high-impact, destructive, or the user explicitly asked to review first, stop after that preview for confirmation. Otherwise continue immediately to `applyBlueprint`.
13. When you call `applyBlueprint`:
   - Open [tool-shapes.md](./tool-shapes.md) and copy the **CLI request body** shape first.
   - In CLI-first execution, pass the blueprint itself as raw JSON via `--body` / `--body-file`.
   - Only in MCP fallback should that same blueprint be wrapped as `requestBody: { ... }`.
   - Never stringify the blueprint and never add an outer `{ values: ... }` wrapper.
   - If the CLI reports request-body validation errors, first re-check the chosen command and raw body shape. If MCP fallback reports `params/requestBody must be object` or `...must match exactly one schema in oneOf`, first re-check the fallback envelope before changing inner blueprint fields.
14. Verify via `get({ pageSchemaUid })` and targeted readback from [verification.md](./verification.md).
15. In a multi-page task, only after successful readback may the current page contribute a reusable popup / block / fields scene via `save-template`; the next page must still re-enter the template selection flow from [templates.md](./templates.md).

### Notes

- `create` mode does not take `target`; `replace` mode requires `target.pageSchemaUid`.
- When an existing menu group is already known, prefer `navigation.group.routeId`; use `navigation.group.title` only for new-group creation or title-only unique same-title reuse.
- If visible same-title groups already exist, do **not** create another same-title group just to avoid ambiguity; reuse one existing group instead. Prefer an exact known `routeId`; otherwise use this deterministic rule and state that chosen routeId in the prewrite preview: first prefer a same-title group already containing the target page title, then fall back to the visible top-level same-title group with the smallest `sort`, tie-break by the smallest route id.
- `navigation.group.routeId` is exact targeting only; do not mix it with group metadata (`icon`, `tooltip`, `hideInMenu`). If an existing group's metadata must change, use low-level `update-menu` separately.
- `replace` updates only the explicit page-level fields present in `page`.
- Current server behavior maps blueprint tabs to existing route-backed tab slots by index, rewrites each slot in order, removes trailing old tabs, and appends extra new tabs when needed.
- For a normal single-page request, keep `tabs.length = 1` unless the user explicitly asked for multiple route-backed tabs.
- A natural-language business request may only describe blocks, relations, and operations. Infer the smallest executable structure; do not expand it into a rigid pseudo-spec unless the request or live facts force that detail.
- Do not add placeholder `Summary` / `Later` / `备用` tabs or explanatory `markdown` / note / banner blocks just to explain future work or organize your thinking.
- Default blueprint `fields[]` entries to simple strings. Only upgrade a field to an object when `popup`, `target`, `renderer`, or field-specific `type` is actually required.
- For whole-page `applyBlueprint` authoring, default to **ASCII-first** prewrite output: short intent summary, one ASCII wireframe, and assumptions only when needed.
- The ASCII preview is the default prewrite review surface; the blueprint remains the execution truth, and the preview must still appear before the first write even when execution continues immediately afterward.
- When the local prepare-write gate fails, fix the blueprint locally first instead of using backend `applyBlueprint` errors as the primary validator.
- Default popup expansion depth in the prewrite preview is exactly **1**; deeper popup chains should stay visible only as `nested popup omitted`.
- Tab / block keys are optional unless custom layout or `field.target` needs them.
- `field.target` is only a string block key; do not send object selectors.
- At block root use `collection`; inside nested `resource` use `collectionName`.
- Put `layout` only on `tabs[]` or inline `popup`; do not put `layout` on a block object.
- For popup relation tables, prefer `resource.binding = "associatedRecords"` with `resource.associationField = "<relationField>"`.
- The convenience shorthand `currentRecord | associatedRecords + associationPathName` only works for a single relation field name; for anything more complex, author the canonical shape directly.
- On record-capable blocks, author `view` / `edit` / `updateRecord` / `delete` under `recordActions`, not `actions`.
- When the user says clicking a shown record / relation record should open details, prefer a field-level popup / clickable-field path instead of inventing a new button; only use an action / recordAction button when the request explicitly asks for one.
- Public applyBlueprint blocks do **not** support generic `form`; use `editForm` or `createForm`.
- For a standard `edit` popup, backend default completion is acceptable; when the user wants custom popup structure or sibling blocks, author explicit `popup.blocks` / `popup.layout`.
- A custom `edit` popup must contain exactly one `editForm` block. If that `editForm` omits `resource`, applyBlueprint will inherit the opener's current-record context.
- If the requirement only says "click to open" and you are not fully sure about layout, omit `layout` rather than guessing a string or block-level `layout`.
- For existing display/association fields that should open popups on click, use low-level `configure` / `clickToOpen` semantics rather than guessing popup structure first.
- Layout cells are only block key strings or `{ key, span }`; do not use `uid`, `ref`, or `$ref`. If layout is omitted, the server auto-generates a simple top-to-bottom layout.
- If `replace` produces multiple tabs while the current page still has `enableTabs = false`, set `page.enableTabs: true` explicitly.
- `replace` mode is for rebuilding one page, not for a tiny local edit. Nested popups still stay inside the same page blueprint as inline popup definitions.
- See [templates.md](./templates.md) for the only normative template-selection rules. This checklist only summarizes when that decision must happen before writing.
- Keep non-blueprint control fields out of the payload; follow [normative-contract.md](./normative-contract.md).
- In testing / multi-agent runs, do not perform destructive cleanup unless the user explicitly asked for deletion.

## 4. Localized Existing-surface Edit Path

Use this path when the user asks to add/move/remove/update only part of an existing surface.

1. Use `get` to locate the current page/tab/popup/node.
2. Use `describe-surface` only when the richer public tree helps analysis.
3. Use `catalog` only when target capability is uncertain.
4. If the request is reaction-related, call `get-reaction-meta` before any write and do not guess raw configure keys or valid action/state names.
5. When the task is a standard reusable popup / relation-click / fields-template scene, follow [templates.md](./templates.md) before committing to inline popup or duplicated field content. In whole-page planning, missing live target uid is not a blocker if the planned scene context is already strong enough.
6. Use the smallest low-level write that preserves semantics:
   - `compose` for structured block/field/action insertion under a container
   - `configure` for simple semantic changes
   - `update-settings` for settings-domain writes
   - `set-field-value-rules` / `set-field-linkage-rules` / `set-block-linkage-rules` / `set-action-linkage-rules` for reaction writes
   - use `$notEmpty`, not `$isNotEmpty`
   - `add-tab` / `update-tab` / `move-tab` / `remove-tab`
   - `add-popup-tab` / `update-popup-tab` / `move-popup-tab` / `remove-popup-tab`
   - `move-node` / `remove-node`
   - `update-menu` / `create-menu` / `create-page`
   - in CLI-first execution, pass the raw business object through `--body` / `--body-file`
   - only in MCP fallback wrap that same business object under `requestBody`
   - if the chosen tool needs `target.uid` / `locator.uid`, source that uid from live readback rather than inventing `"root"`
7. Read back only the affected target/parent, unless hierarchy changed.

For detailed reaction payload shapes and host-target caveats, defer to [reaction.md](./reaction.md).

## 5. Schema / Capability Reads

- Use `collections:list` only to narrow candidates.
- Use `collections:get(appends=["fields"])` as the default field truth.
- Do **not** use `collections.fields:list` for page authoring / field discovery; it is compact browse only, not authoring truth.
- Use `collections.fields:get` only for known single-field follow-up if one field still needs confirmation.
- If a field shows `interface: null` / empty in `collections:get(appends=["fields"])`, do not place it into blueprint `fields[]`.
- Treat this as a hard addability rule, not a soft heuristic: schema existence alone is insufficient for UI authoring.
- This applies to `details` / `table` / `editForm` / `createForm` fields and to nested popup blocks as well.
- Use `catalog({ target, sections: ["fields"] })` when current-target addability matters.
- If required schema is missing, stop and hand off to `nocobase-data-modeling`.

## 6. Stop / Handoff Conditions

Stop instead of guessing when:

- the CLI is unavailable and MCP fallback is also unavailable
- target is ambiguous
- the task is really ACL / workflow / data-modeling / browser validation
- the public page blueprint cannot express the request and the low-level target is still unclear
- the live environment lacks a required capability
