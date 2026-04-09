# Popup

Read this file when you need to work on popup, `openView`, record popups, the `currentRecord` guard, or association-resource binding inside popup. For popup family and uid sources, see [runtime-playbook.md](./runtime-playbook.md). For request shapes, see [tool-shapes.md](./tool-shapes.md). For post-write verification, see [verification.md](./verification.md). Whether `shell-only popup` is allowed, and when `catalog` must be read first, is governed by [normative-contract.md](./normative-contract.md).

## Core Rules

- `recordActions.view/edit/popup` only creates the popup shell by default. It does not automatically generate `details`, `editForm`, or `submit`.
- For the canonical shape of popup-capable payloads and `popup.mode`, see [tool-shapes.md](./tool-shapes.md). For a new inline popup subtree, default to `replace`.
- Popup templates are saved and searched through the flow-surfaces template APIs, not by reusing raw `openView.uid`. For save/search/detach rules, see [templates.md](./templates.md).
- When popup `resourceBindings` are part of the decision, always follow the `guard-first popup flow`: create the opener first, reuse the returned popup uid, then read the `catalog` of `popup-content`.
- Getting `popupPageUid` / `popupTabUid` / `popupGridUid` only means the popup subtree was established. It does not mean the popup content is complete.
- As soon as a write API returns `popupPageUid` / `popupTabUid` / `popupGridUid`, always reuse those uids directly for the next step. Do not guess `hostUid` / `gridUid` again.
- Whether the current result may stop at `shell-only popup` is governed by the `Popup Shell Fallback Contract` in [normative-contract.md](./normative-contract.md). Do not redefine the cross-topic threshold here.
- When the user asks to "view current record / edit current record / this record / this row", only continue by creating `details(currentRecord)` or `editForm(currentRecord) + submit` under `popup-content` when live `catalog.blocks[].resourceBindings` explicitly exposes `currentRecord`.
- If the popup catalog does not expose `currentRecord`, stop guessing. Do not invent record binding on a normal popup.
- `currentRecord` is a resource-binding semantic for blocks inside popup. It is not a reused instance of an existing page block.
- For collection blocks inside popup, the public semantic binding follows live `catalog.blocks[].resourceBindings`. Common values include `currentCollection`, `currentRecord`, `associatedRecords`, and `otherRecords`.
- The `select`, `subForm`, and `bulkEditForm` scenes currently do not support creating popup collection blocks. If one of these scenes is active, do not continue with `compose/addBlock(table/details/list/gridCard/createForm/editForm/filterForm)`.
- Inside popup, block `resource` must always be written in object wire shape, not string shorthand. Use `{ "binding": "currentRecord" }` for `details/editForm(currentRecord)`. Use `{ "binding": "associatedRecords", "associationField": "<field>" }` for an association collection block inside popup.
- Association collection blocks inside popup should prefer semantic `resource.binding="associatedRecords"` by default. After writing, confirm that `resourceSettings.init.associationName` is still the full association name containing `.`, and that `sourceId` still exists. If readback degrades into a bare field name such as `roles`, or `sourceId` is missing, treat it as failure and stop. Do not accept silent persistence.
- `openView.uid` is not the default write mechanism in this skill. Without strong evidence, do not proactively use it for popup reuse.
- For popup template reuse, prefer `popup.template` on `addAction/addRecordAction/addField/addFields`, or `configure(changes.openView.template)` when the opener already exists and the backend contract allows template switching. Full reference/copy and detach rules live in [templates.md](./templates.md).
- The upstream contract explicitly forbids taking the uid from one opener and reusing it on another opener. In particular, do not write the popup uid from one entry into another entry's `openView.uid`.
- If the user explicitly requests reuse of an existing popup, only evaluate that path when live facts have already proven that the uid is valid, exists, and does not point to a page/tab/popup-subtree node. Otherwise stop by default. Do not guess.
- For association fields, `openView.collectionName` should preserve target-collection semantics by default. Do not rewrite an association popup into the source collection just to fake "current row details".
- When an association field enables `clickToOpen/openView`, `openView` cannot collapse down to only the target `collectionName`. After writing, confirm that `associationName` is still present. For to-many association fields, if readback leaves only plain target-collection semantics like `collectionName='roles'`, the popup has lost association context.
- If you intentionally configure a non-association-field popup on an association field, do not automatically preserve the old `associationName`. When `collectionName/dataSourceKey` clearly switches to another record semantics, readback should no longer carry the old association name. If you still want to open the same target collection but require a plain popup, explicitly pass `associationName: null`.
- If an association-field popup creates `details(currentRecord)`, `editForm(currentRecord)`, or nested record-action popups inside it, post-write verification must continue to confirm that `resourceSettings.init` keeps both the full `associationName` and `sourceId`. Missing either one means subsequent popups will treat the association record as a plain target-table record.

## Default Popup Write Flow

1. First decide whether this run hits `guard-first popup flow`. If it does, create the opener or popup shell first and obtain the popup uid. If it does not, you may complete the subtree directly through the inline popup payload in [tool-shapes.md](./tool-shapes.md).
2. If the write API directly returns popup-related uids, reuse those new targets first. Do not guess the host again.
3. Make explicit whether the current write is targeting `popup-page`, `popup-tab`, or `popup-content`.
4. When `guard-first popup flow` applies, first read the `catalog` of `popup-content` according to the `Catalog Contract` in [normative-contract.md](./normative-contract.md), confirm `resourceBindings`, scene restrictions, or field capabilities, and only then continue with `compose/add*`.
5. After the write, perform popup-specific `readback` via [verification.md](./verification.md).

Minimum acceptance for association-field popup:

1. After readback, the opener's `stepParams.popupSettings.openView` still contains the full `associationName`.
2. After readback, `resourceSettings.init` of popup `details/editForm(currentRecord)` contains both `associationName` and `sourceId`.
3. If there is another nested record-action popup inside the popup, keep applying the same standard to the next `details/editForm(currentRecord)` layer until the chain ends.

## Record Popup Recipes

### View Current Record: `recordActions.view -> details(currentRecord)`

1. Create `recordActions.view` on `table/details/list/gridCard`.
2. Reuse the returned `popupGridUid`.
3. Because this path needs the `currentRecord` guard, read the `catalog` of `popup-content` first according to [normative-contract.md](./normative-contract.md).
4. Only create `details(currentRecord)` after the guard passes.
5. After writing, confirm that popup content actually contains `details` rather than an empty shell. If resource binding is visible through live `get/catalog`, also confirm that it really binds to `currentRecord`.

### Edit Current Record: `recordActions.edit -> editForm(currentRecord) + submit`

1. Create `recordActions.edit` on `table/details/list/gridCard`.
2. Reuse the returned `popupGridUid`.
3. Because this path needs the `currentRecord` guard, read the `catalog` of `popup-content` first according to [normative-contract.md](./normative-contract.md).
4. Only create `editForm(currentRecord)` and add `submit` after the guard passes.
5. After writing, confirm that popup content actually contains both `editForm` and `submit`. If resource binding is visible through live `get/catalog`, additionally confirm that `editForm` binds to `currentRecord`, and that `submit` is still attached under that form.

## `openView` vs popup action

| User intent | Preferred capability | Key concern |
| --- | --- | --- |
| open details on field click | `clickToOpen + openView` | read back the association-field uid first |
| record-level view/edit button | `recordActions.view/edit/popup` | after creating the action, you still need to build popup content and confirm whether `currentRecord` is available |
| action button popup | popup action | popup target comes from the action write API |
| open as drawer | `openView.mode = "drawer"` or popup drawer | first decide whether the trigger source is a field or an action |
| open as normal dialog | `openView.mode = "dialog"` or popup action | prefer `openView` for field sources, popup for action sources |

Common field-level `openView` changes: `clickToOpen`, `openView.mode`, `openView.collectionName`.
If a field or action currently uses a popup template in `reference` mode, do not mutate popup inner blocks directly. Switch the popup template through `configure(changes.openView.template)` when the contract allows it, or detach first with `convertTemplateToCopy`.

## `linkageRules` and `flowRegistry`

- `linkageRules` belongs to a concrete settings domain. `flowRegistry` belongs to instance-level event-flow configuration. The standard entry for it is `setEventFlows`.
- Do not confuse them: `linkageRules` is not `flowRegistry`, and `flowRegistry` is not a normal settings patch where you can guess paths outside the contract.
- `setEventFlows` is a high-impact full-replace API. You must read the current flows first, use it only when the user explicitly accepts whole-flow replacement, and validate against the full flow state after writing.
- Recommended order: `get -> catalog -> write popup/openView settings or linkageRules`. Only continue to `setEventFlows -> readback` when the user explicitly accepts full replacement and you have already read the current flows.
- If popup settings are cleared but the flow still references the old path, prioritize fixing settings or flow references. Do not force a guessed compatibility path.
