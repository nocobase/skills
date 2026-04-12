# Execution Checklist

Use this checklist by default. For global rules, see [normative-contract.md](./normative-contract.md).

## 1. Preflight

- Confirm MCP is reachable and authenticated.
- Confirm the task is really about Modern page (v2) UI.
- Decide whether the request is **whole-page create/replace** or **localized edit**.
- If the request needs real fields/relations/bindings, gather live schema facts before writing.
- If JS is involved, validate JS first.
- Before any flow-surfaces write or requestBody-based read, confirm the tool-call envelope:
  - `flow_surfaces_get` -> top-level locator fields
  - most other `flow_surfaces_*` actions in this skill path -> `requestBody: { ... }`
- Never invent `"root"` as `target.uid` / `locator.uid`; only use live uids from `get` / `describeSurface` / create responses.

## 2. Choose Intent

| intent | default path | minimum readback |
| --- | --- | --- |
| `inspect` | menu tree for menu questions; otherwise `get`; use `describeSurface` only when its richer tree helps analysis | read-only answer |
| `draft-page-dsl` | gather facts -> author simplified page DSL -> stop for confirmation | no write |
| `execute-page-dsl` | simplified page DSL -> `executeDsl` -> `get` readback | `get({ pageSchemaUid })` |
| `edit-existing-surface` | `get` / `describeSurface` / `catalog` as needed -> low-level APIs -> readback | parent/target readback |
| `create-menu-group` | direct `createMenu(type="group")` | return value or menu tree |
| `move-menu` | menu tree if needed -> `updateMenu(parentMenuRouteId=...)` | menu tree |
| `reorder` | `moveTab` / `movePopupTab` / `moveNode` | parent/page/popup readback |
| `delete-ui` | `destroyPage` / `removeTab` / `removePopupTab` / `removeNode` after blast-radius read | destructive readback |

## 3. Whole-page Create / Replace Path

Use this path when the user is describing one page as a whole.

### Default use

- create one new Modern page from business intent
- replace / rebuild one existing page as a whole

### Do not use `executeDsl` for

- add one block / field / action
- move one node
- rename one tab
- change one popup / tab setting
- remove one node / tab / popup tab

1. Read [page-intent.md](./page-intent.md) and [ui-dsl.md](./ui-dsl.md).
2. Discover real collections/fields/relations if the page is data-bound.
3. Choose a page archetype from [page-archetypes.md](./page-archetypes.md) only as a starting pattern.
4. Draft or assemble one **page DSL** document.
5. For a normal single-page request, default to exactly **one tab** unless the user explicitly asked for multiple route-backed tabs. Side-by-side blocks, relation tables, and deep popup chains stay inside that tab. Do not carry empty / placeholder tabs in the draft.
6. Before the **first** `executeDsl`, run the authoring self-check:
   - tabs count matches the request
   - if this is a normal single-page request, `tabs.length` is exactly `1`
   - every `tab.blocks` is a non-empty array
   - there is no empty / placeholder tab
   - no block object contains `layout`
   - every `tab.layout` / `popup.layout` is an object; if you are unsure, omit `layout`
   - block `key` values are unique within the document
   - every custom `edit` popup contains exactly one `editForm`
   - if any item fails, rewrite the DSL before the first write; do not use backend errors as the first validator
7. If the request is ambiguous, high-impact, destructive, or the user explicitly asked to review first, show the DSL draft first.
8. Otherwise call `executeDsl`.
   - Open [tool-shapes.md](./tool-shapes.md) and copy the **Tool-call envelope** shape first.
   - Pass the DSL as `requestBody: { ... }`; never send `requestBody` as a JSON string and never add an outer `{ values: ... }` wrapper.
   - Never copy a raw JSON example from `ui-dsl.md` straight into the MCP call without wrapping it under `requestBody`.
   - If you see `params/requestBody must be object` or `...must match exactly one schema in oneOf`, first re-check the MCP envelope before changing inner DSL fields.
9. Verify via `get({ pageSchemaUid })` and targeted readback from [verification.md](./verification.md).

### Notes

- `create` mode does not take `target`; `replace` mode requires `target.pageSchemaUid`.
- When an existing menu group is already known, prefer `navigation.group.routeId`; use `navigation.group.title` only for new-group creation or title-only unique same-title reuse.
- `navigation.group.routeId` is exact targeting only; do not mix it with group metadata (`icon`, `tooltip`, `hideInMenu`). If an existing group's metadata must change, use low-level `updateMenu` separately.
- `replace` updates only the explicit page-level fields present in `page`.
- Current server behavior maps DSL tabs to existing route-backed tab slots by index, rewrites each slot in order, removes trailing old tabs, and appends extra new tabs when needed.
- For a normal single-page request, keep `tabs.length = 1` unless the user explicitly asked for multiple route-backed tabs.
- Tab / block keys are optional unless custom layout or `field.target` needs them.
- `field.target` is only a string block key; do not send object selectors.
- At block root use `collection`; inside nested `resource` use `collectionName`.
- Put `layout` only on `tabs[]` or inline `popup`; do not put `layout` on a block object.
- For popup relation tables, prefer `resource.binding = "associatedRecords"` with `resource.associationField = "<relationField>"`.
- The convenience shorthand `currentRecord | associatedRecords + associationPathName` only works for a single relation field name; for anything more complex, author the canonical shape directly.
- On record-capable blocks, author `view` / `edit` / `updateRecord` / `delete` under `recordActions`, not `actions`.
- When the user says clicking a shown record / relation record should open details, prefer a field-level popup / clickable-field path instead of inventing a new button; only use an action / recordAction button when the request explicitly asks for one.
- Public executeDsl blocks do **not** support generic `form`; use `editForm` or `createForm`.
- For a standard `edit` popup, backend default completion is acceptable; when the user wants custom popup structure or sibling blocks, author explicit `popup.blocks` / `popup.layout`.
- A custom `edit` popup must contain exactly one `editForm` block. If that `editForm` omits `resource`, executeDsl will inherit the opener's current-record context.
- If the requirement only says "click to open" and you are not fully sure about layout, omit `layout` rather than guessing a string or block-level `layout`.
- For existing display/association fields that should open popups on click, use low-level `configure` / `clickToOpen` semantics rather than guessing popup structure first.
- Layout cells are only block key strings or `{ key, span }`; do not use `uid`, `ref`, or `$ref`. If layout is omitted, the server auto-generates a simple top-to-bottom layout.
- If `replace` produces multiple tabs while the current page still has `enableTabs = false`, set `page.enableTabs: true` explicitly.
- `replace` mode is for rebuilding one page, not for a tiny local edit. Nested popups still stay inside the same page DSL as inline popup definitions.
- Keep non-DSL control fields out of the payload; follow [normative-contract.md](./normative-contract.md).
- If a tool returns `params/requestBody must be object`, stop and fix the MCP call envelope first; do not keep mutating the inner DSL blindly.
- In testing / multi-agent runs, do not perform destructive cleanup unless the user explicitly asked for deletion.

## 4. Localized Existing-surface Edit Path

Use this path when the user asks to add/move/remove/update only part of an existing surface.

1. Use `get` to locate the current page/tab/popup/node.
2. Use `describeSurface` only when the richer public tree helps analysis.
3. Use `catalog` only when target capability is uncertain.
4. Use the smallest low-level write that preserves semantics:
   - `compose` for structured block/field/action insertion under a container
   - `configure` for simple semantic changes
   - `updateSettings` for settings-domain writes
   - `addTab` / `updateTab` / `moveTab` / `removeTab`
   - `addPopupTab` / `updatePopupTab` / `movePopupTab` / `removePopupTab`
   - `moveNode` / `removeNode`
   - `updateMenu` / `createMenu` / `createPage`
   - if the chosen tool uses `requestBody`, wrap the business payload under `requestBody` instead of sending the inner object directly
   - if the chosen tool needs `target.uid` / `locator.uid`, source that uid from live readback rather than inventing `"root"`
5. Read back only the affected target/parent, unless hierarchy changed.

## 5. Schema / Capability Reads

- Use `collections:list` only to narrow candidates.
- Use `collections:get(appends=["fields"])` as the default field truth.
- Do **not** use `collections.fields:list` for page authoring / field discovery; it is compact browse only, not authoring truth.
- Use `collections.fields:get` only for known single-field follow-up if one field still needs confirmation.
- If a field shows `interface: null` / empty in `collections:get(appends=["fields"])`, do not place it into DSL `fields[]`.
- Use `catalog({ target, sections: ["fields"] })` when current-target addability matters.
- If required schema is missing, stop and hand off to `nocobase-data-modeling`.

## 6. Stop / Handoff Conditions

Stop instead of guessing when:

- target is ambiguous
- the task is really ACL / workflow / data-modeling / browser validation
- the public page DSL cannot express the request and the low-level target is still unclear
- the live environment lacks a required capability
