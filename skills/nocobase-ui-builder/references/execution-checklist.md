# Execution Checklist

Use this checklist by default. For global rules, see [normative-contract.md](./normative-contract.md).

## 1. Preflight

- Confirm MCP is reachable and authenticated.
- Confirm the task is really about Modern page (v2) UI.
- Decide whether the request is **whole-page create/replace** or **localized edit**.
- If the request needs real fields/relations/bindings, gather live schema facts before writing.
- If JS is involved, validate JS first.

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
5. If the request is ambiguous, high-impact, destructive, or the user explicitly asked to review first, show the DSL draft first.
6. Otherwise call `executeDsl`.
7. Verify via `get({ pageSchemaUid })` and targeted readback from [verification.md](./verification.md).

### Notes

- `create` mode does not take `target`.
- `replace` mode requires `target.pageSchemaUid`.
- `replace` updates only the explicit page-level fields present in `page`.
- Current server behavior maps DSL tabs to existing route-backed tab slots by index, rewrites each slot in order, removes trailing old tabs, and appends extra new tabs when needed.
- Tab / block keys are optional unless custom layout or `field.target` needs them.
- If layout is omitted, the server auto-generates a simple top-to-bottom layout.
- If `replace` produces multiple tabs while the current page still has `enableTabs = false`, set `page.enableTabs: true` explicitly.
- `replace` mode is for rebuilding one page, not for a tiny local edit.
- Nested popups still stay inside the same page DSL as inline popup definitions.
- Keep non-DSL control fields out of the payload; follow [normative-contract.md](./normative-contract.md).

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
5. Read back only the affected target/parent, unless hierarchy changed.

## 5. Schema / Capability Reads

- Use `collections:list` only to narrow candidates.
- Use `collections:get(appends=["fields"])` as the default field truth.
- Use `catalog({ target, sections: ["fields"] })` when current-target addability matters.
- If required schema is missing, stop and hand off to `nocobase-data-modeling`.

## 6. Stop / Handoff Conditions

Stop instead of guessing when:

- target is ambiguous
- the task is really ACL / workflow / data-modeling / browser validation
- the public page DSL cannot express the request and the low-level target is still unclear
- the live environment lacks a required capability
