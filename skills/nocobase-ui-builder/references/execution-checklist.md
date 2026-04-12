# Execution Checklist

Use this checklist by default. For global rules, see [normative-contract.md](./normative-contract.md).

## 1. Preflight

- Confirm MCP is reachable and authenticated.
- Confirm the task is really about Modern page (v2) UI.
- Decide whether the request is **whole-page create/replace** or **localized edit**.
- If the request needs real fields/relations/bindings, gather live schema facts before writing.
- If JS is involved, validate JS first.
- If the request needs block / form fields, derive the candidate field list from `collections:get(appends=["fields"])` and drop any field whose `interface` is empty / null before authoring blueprint.
- If the request mentions default values, linkage, computed values, show/hide, required/disabled, or action state, decide explicitly whether this is a whole-page reaction task or a localized reaction task before choosing structural APIs.
- If a target menu group is named by title, inspect the live menu tree before authoring. When one or more visible same-title groups already exist, do **not** create another same-title group for disambiguation; prefer exact `routeId` reuse, otherwise choose one existing group deterministically from the live tree and disclose that routeId in the prewrite preview.
- Before any flow-surfaces write or requestBody-based read, confirm the tool-call envelope:
  - `flow_surfaces_get` -> top-level locator fields
  - most other `flow_surfaces_*` actions in this skill path -> `requestBody: { ... }`
- Never invent `"root"` as `target.uid` / `locator.uid`; only use live uids from `get` / `describeSurface` / create responses.

## 2. Choose Intent

| intent | default path | minimum readback |
| --- | --- | --- |
| `inspect` | menu tree for menu questions; otherwise `get`; use `describeSurface` only when its richer tree helps analysis | read-only answer |
| `draft-page-blueprint` | gather facts -> author simplified page blueprint -> ASCII prewrite preview and stop without writing | no write |
| `apply-page-blueprint` | simplified page blueprint -> `applyBlueprint` -> `get` readback | `get({ pageSchemaUid })` |
| `apply-page-blueprint` + reaction | simplified page blueprint + top-level `reaction.items[]` -> `applyBlueprint` -> `get` readback | `get({ pageSchemaUid })` + target reaction slot checks |
| `edit-existing-surface` | `get` / `describeSurface` / `catalog` as needed -> low-level APIs -> readback | parent/target readback |
| `edit-existing-surface` + reaction | `get` if target unknown -> `getReactionMeta` -> matching `set*Rules` -> readback | target readback + write result `resolvedScene` / `fingerprint` |
| `create-menu-group` | direct `createMenu(type="group")` | return value or menu tree |
| `move-menu` | menu tree if needed -> `updateMenu(parentMenuRouteId=...)` | menu tree |
| `reorder` | `moveTab` / `movePopupTab` / `moveNode` | parent/page/popup readback |
| `delete-ui` | `destroyPage` / `removeTab` / `removePopupTab` / `removeNode` after blast-radius read | destructive readback |

## 3. Whole-page Create / Replace Path

Use this path when the user is describing one page as a whole.

### Default use

- create one new Modern page from business intent
- replace / rebuild one existing page as a whole

### Do not use `applyBlueprint` for

- add one block / field / action
- move one node
- rename one tab
- change one popup / tab setting
- remove one node / tab / popup tab

1. Read [page-intent.md](./page-intent.md), [page-blueprint.md](./page-blueprint.md), and [ascii-preview.md](./ascii-preview.md).
2. Discover real collections/fields/relations if the page is data-bound.
3. Choose a page archetype from [page-archetypes.md](./page-archetypes.md) only as a starting pattern.
4. Draft or assemble one **page blueprint** document.
5. If the same page also needs interaction logic, add top-level `reaction.items[]` in the same blueprint instead of splitting structure and reactions into separate whole-page writes.
6. For a normal single-page request, default to exactly **one tab** unless the user explicitly asked for multiple route-backed tabs. Side-by-side blocks, relation tables, and deep popup chains stay inside that tab. Do not carry empty / placeholder tabs in the draft.
7. Shrink the draft to the minimal executable structure before first write: remove placeholder `Summary` / `Later` / `备用` tabs and explanatory `markdown` / note / banner blocks unless the user explicitly asked for them.
8. Before the **first** `applyBlueprint`, run the authoring self-check:
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
   - if any item fails, rewrite the blueprint before the first write; do not use backend errors as the first validator
9. Before the **first** `applyBlueprint` on any whole-page task, show one ASCII wireframe rendered from that same blueprint. This preview is mandatory even when execution will continue immediately afterward. Keep it concise: short intent summary + one wireframe, popup expansion depth exactly **1**, JSON hidden unless the user explicitly asks for it or a technical review still needs it.
10. If the request is ambiguous, high-impact, destructive, or the user explicitly asked to review first, stop after that preview for confirmation. Otherwise continue immediately to `applyBlueprint`.
11. When you call `applyBlueprint`:
   - Open [tool-shapes.md](./tool-shapes.md) and copy the **Tool-call envelope** shape first.
   - Pass the blueprint as `requestBody: { ... }`; never send `requestBody` as a JSON string and never add an outer `{ values: ... }` wrapper.
   - Never copy a raw JSON example from `page-blueprint.md` straight into the MCP call without wrapping it under `requestBody`.
   - If you see `params/requestBody must be object` or `...must match exactly one schema in oneOf`, first re-check the MCP envelope before changing inner blueprint fields.
12. Verify via `get({ pageSchemaUid })` and targeted readback from [verification.md](./verification.md).

### Notes

- `create` mode does not take `target`; `replace` mode requires `target.pageSchemaUid`.
- When an existing menu group is already known, prefer `navigation.group.routeId`; use `navigation.group.title` only for new-group creation or title-only unique same-title reuse.
- If visible same-title groups already exist, do **not** create another same-title group just to avoid ambiguity; reuse one existing group instead. Prefer an exact known `routeId`, otherwise choose one deterministically from the live menu tree and state that chosen routeId in the prewrite preview.
- `navigation.group.routeId` is exact targeting only; do not mix it with group metadata (`icon`, `tooltip`, `hideInMenu`). If an existing group's metadata must change, use low-level `updateMenu` separately.
- `replace` updates only the explicit page-level fields present in `page`.
- Current server behavior maps blueprint tabs to existing route-backed tab slots by index, rewrites each slot in order, removes trailing old tabs, and appends extra new tabs when needed.
- For a normal single-page request, keep `tabs.length = 1` unless the user explicitly asked for multiple route-backed tabs.
- Do not add placeholder `Summary` / `Later` / `备用` tabs or explanatory `markdown` / note / banner blocks just to explain future work or organize your thinking.
- Default blueprint `fields[]` entries to simple strings. Only upgrade a field to an object when `popup`, `target`, `renderer`, or field-specific `type` is actually required.
- For whole-page `applyBlueprint` authoring, default to **ASCII-first** prewrite output: short intent summary, one ASCII wireframe, and assumptions only when needed.
- The ASCII preview is the default prewrite review surface; the blueprint remains the execution truth, and the preview must still appear before the first write even when execution continues immediately afterward.
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
- Keep non-blueprint control fields out of the payload; follow [normative-contract.md](./normative-contract.md).
- If a tool returns `params/requestBody must be object`, stop and fix the MCP call envelope first; do not keep mutating the inner blueprint blindly.
- In testing / multi-agent runs, do not perform destructive cleanup unless the user explicitly asked for deletion.

## 4. Localized Existing-surface Edit Path

Use this path when the user asks to add/move/remove/update only part of an existing surface.

1. Use `get` to locate the current page/tab/popup/node.
2. Use `describeSurface` only when the richer public tree helps analysis.
3. Use `catalog` only when target capability is uncertain.
4. If the request is reaction-related, call `getReactionMeta` before any write and do not guess raw configure keys or valid action/state names.
5. Use the smallest low-level write that preserves semantics:
   - `compose` for structured block/field/action insertion under a container
   - `configure` for simple semantic changes
   - `updateSettings` for settings-domain writes
   - `setFieldValueRules` / `setFieldLinkageRules` / `setBlockLinkageRules` / `setActionLinkageRules` for reaction writes
   - `addTab` / `updateTab` / `moveTab` / `removeTab`
   - `addPopupTab` / `updatePopupTab` / `movePopupTab` / `removePopupTab`
   - `moveNode` / `removeNode`
   - `updateMenu` / `createMenu` / `createPage`
   - if the chosen tool uses `requestBody`, wrap the business payload under `requestBody` instead of sending the inner object directly
   - if the chosen tool needs `target.uid` / `locator.uid`, source that uid from live readback rather than inventing `"root"`
6. Read back only the affected target/parent, unless hierarchy changed.

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

- target is ambiguous
- the task is really ACL / workflow / data-modeling / browser validation
- the public page blueprint cannot express the request and the low-level target is still unclear
- the live environment lacks a required capability
