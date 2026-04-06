# Aliases

Read this file when the user only gives natural-language expressions and you still cannot uniquely map them to a target family or capability. This file only handles semantic narrowing for highly ambiguous terms. For API selection, see [runtime-playbook.md](./runtime-playbook.md). For request shapes, see [tool-shapes.md](./tool-shapes.md). For record popups and the `currentRecord` guard, see [popup.md](./popup.md).

## `Grid`

- When the user says `Grid`, `Grid block`, or `Grid` in a "block / area" context, map it to `gridCard` by default.
- Only switch into layout semantics when the user explicitly means layout, columns, rows, or arrangement.
- Once the user explicitly names a block type, such as table block, details block, or Grid block, the explicit block name wins.

## Page / Page Entry

| User expression | Default narrowing path | When you must stop and confirm | Possible landing points |
| --- | --- | --- | --- |
| page | If there is already a locator/uid, handle it as an existing `page` first. If the user explicitly says "create page" and the context includes menus, default to the menu-first path. | When both "create a page" and "modify an existing page" remain plausible | `menu-item` / `page` |
| page entry, menu, navigation item | First decide whether it means a `menu-group`, `menu-item`, or an already initialized `page` | When it might actually mean an external link, mobile navigation, or another workbench navigation structure | `menu-group` / `menu-item` / `page` |

## Title / Icon

- Default guess order: look at visible-slot clues first, then object name, and only then the default entry semantics of a route-backed page.
- When the user mentions `left side`, `menu`, `navigation`, `menu title`, `menu icon`, or `group title`, narrow to `menu-group` / `menu-item` first.
- When the user mentions `tab`, `label`, or `tab title`, narrow to `outer-tab` / `popup-tab` first.
- When the user mentions `page top title`, `header title`, or `content-area title`, narrow to `page` first.
- When the user mentions `page top icon`, `header icon`, or `header icon`, do not promise visible effect immediately. First inspect whether the page-header render chain actually consumes `icon`.
- If the user only says `page title` or `page icon` without a position clue, and the target is a route-backed page, default to the page entry path, which means `menu-item -> updateMenu`. Do not default directly to `outer-tab -> updateTab`.
- If the user only says "add an icon to the page title", do not jump straight to `updateTab`. If it is clearly about the page-header icon, inspect the render chain first. If there is no position clue, default to the page-entry icon and state in commentary that this is the default guess.
- If the same sentence contains conflicting visible-slot clues, such as both `left menu` and `tab title`, stop default guessing and narrow the target first.

## `tab`

- In page-route context, prefer `outer-tab`.
- In popup-subtree context, prefer `popup-tab`.
- If the user only says "tab" without page/popup context, narrow it first through `get(...).tree.use` or the uid source. If it is still unclear, stop guessing.

## Click to Open / Open Details

- In field context, prefer `openView`.
- In record-button or row-action context, prefer `recordActions.view` / `recordActions.edit` plus a record popup.
- If the source could be either a field or an action and is still unclear, stop and narrow the trigger source first. Do not generate a write request yet.

## Current Record

- `current record / this record / this row` should first be narrowed to record scope. In popup view/edit scenarios, prefer a record popup.
- Only continue with `details(currentRecord)` or `editForm(currentRecord)` when live `catalog.blocks[].resourceBindings` explicitly exposes `currentRecord`.
- Do not treat `currentRecord` as a locator, a `target.uid`, or an implicit state on an existing page block instance.

## Reset / Clear

- In search / filter / condition context, prefer `filterForm.reset`.
- If it might also mean clearing form content, clearing layout, or clearing data, stop and narrow the semantics first.

## Conservative Moves

- Aliases only decide object semantics or capability. They do not decide the concrete API, payload shape, or readback path.
- If menu-related input gives only a title, you must do menu-tree discovery first. Only a uniquely matched `group` may proceed to writing.
- As soon as the action would cross families or action scopes, narrow the target first. Do not generate a write request directly.
- For prompt regression examples, see [runtime-playbook.md](./runtime-playbook.md).
