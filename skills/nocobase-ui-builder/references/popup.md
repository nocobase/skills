# Popup

Read this file when you need to work on popup, `openView`, record popups, the `currentRecord` guard, or association-resource binding inside popup. For popup family and uid sources, see [runtime-playbook.md](./runtime-playbook.md). For request shapes, see [tool-shapes.md](./tool-shapes.md). For post-write verification, see [verification.md](./verification.md). Whether `shell-only popup` is allowed, and when `catalog` must be read first, is governed by [normative-contract.md](./normative-contract.md).

## Core Rules

- This file owns popup runtime semantics, backend-default CRUD popup completion, and popup-specific guard/readback flow.
- In blueprint DSL, keep popup intent explicit through `popups[*].completion` and popup block definitions. Do not leave popup semantics to guessing.
- Per [normative-contract.md](./normative-contract.md), nested popups, `currentRecord` / `associatedRecords` bindings, same-row popup layouts, and field `clickToOpen/openView` are still DSL-first scenarios.
- Generic `popup` actions still only create the popup entry unless you explicitly provide popup content or a popup template.
- `addNew`, `view`, and `edit` may be auto-completed by the backend into default CRUD popup content only when no explicit `popup.blocks` and no explicit `popup.template` is provided. `popup.mode` or popup-level layout choices alone do not disable this default completion.
- Popup templates are saved and searched through the flow-surfaces template APIs, not by reusing raw `openView.uid`. For save/search/detach rules, see [templates.md](./templates.md).
- Getting `popupPageUid` / `popupTabUid` / `popupGridUid` always means the popup subtree was established. For backend-default CRUD popup completion, it may also already include usable popup content; confirm this through readback rather than guessing either way.
- As soon as a write API returns `popupPageUid` / `popupTabUid` / `popupGridUid`, always reuse those uids directly for the next step. Do not guess `hostUid` / `gridUid` again.
- If a custom popup path needs `currentRecord` but the popup catalog does not expose it, stop guessing. Do not invent record binding on a normal popup.

## Popup Execution Modes

### Backend-default CRUD popup completion

1. This mode only applies to `addNew`, `view`, and `edit` when there is no explicit `popup.blocks` and no explicit `popup.template`.
2. For CRUD popup intents, prefer backend-default completion first: `addNew -> createForm(currentCollection) + submit`, `view -> details(currentRecord)`, `edit -> editForm(currentRecord) + submit`.
3. Create the opener first and read back the returned popup subtree before composing more popup content.
4. If readback already confirms usable popup content, stop there and verify it.
5. Only when backend-default content is insufficient for the confirmed intent should you continue with explicit popup composition.
6. When continuing, reuse `popupGridUid`, read popup-content `catalog` when guards or bindings matter, and only then continue with `compose/add*`.

### Custom popup / popup template / guard-sensitive popup

1. Use the `guard-first popup flow` whenever the task is a custom popup, popup template flow, or binding-sensitive popup.
2. If you are in blueprint DSL mode, keep the popup design in DSL first. If you are in low-level fallback mode, create the opener or popup shell first and obtain the popup uid from the write response only after a prior `validateDsl` attempt has produced concrete fallback evidence.
3. Make explicit whether the current write is targeting `popup-page`, `popup-tab`, or `popup-content`.
4. When `resourceBindings`, scene restrictions, or field capabilities matter, read the `catalog` of `popup-content` according to the `Catalog Contract` in [normative-contract.md](./normative-contract.md) before continuing with `compose/add*`.
5. After the write, perform popup-specific `readback` via [verification.md](./verification.md).

### Shell-only popup

- Whether the current result may stop at `shell-only popup` is governed by the `Popup Shell Fallback Contract` in [normative-contract.md](./normative-contract.md).
- This file does not restate the cross-topic threshold; it only defines runtime handling once that contract has already been satisfied.

## CRUD Popup Recipes

### Add New Record: `actions.addNew -> createForm + submit`

1. Create `actions.addNew` on the collection-capable owner target that exposes it.
2. Read back the returned popup subtree first.
3. If the backend-default popup already contains usable `createForm + submit` content, stop there and verify it.
4. Only if the user wants custom popup content, uses a popup template, or the default popup is insufficient, reuse `popupGridUid`, read `catalog`, and then explicitly compose `createForm + submit`.
5. After writing, confirm that popup content actually contains both `createForm` and `submit`.

### View Current Record: `recordActions.view -> details(currentRecord)`

1. Create `recordActions.view` on `table/details/list/gridCard`.
2. Read back the returned popup subtree first.
3. If the backend-default popup already contains usable details content, stop there and verify it.
4. Only if the user wants custom popup content, uses a popup template, or the default popup is insufficient, reuse `popupGridUid`, read `catalog`, and then explicitly compose `details(currentRecord)`.
5. After writing, confirm that popup content actually contains `details` rather than an empty shell. If resource binding is visible through live `get/catalog`, also confirm that it really binds to `currentRecord`.

### Edit Current Record: `recordActions.edit -> editForm(currentRecord) + submit`

1. Create `recordActions.edit` on `table/details/list/gridCard`.
2. Read back the returned popup subtree first.
3. If the backend-default popup already contains usable `editForm + submit` content, stop there and verify it.
4. Only if the user wants custom popup content, uses a popup template, or the default popup is insufficient, reuse `popupGridUid`, read `catalog`, and then explicitly compose `editForm(currentRecord) + submit`.
5. After writing, confirm that popup content actually contains both `editForm` and `submit`.

## Popup Reuse / `openView` / Template Switching

- `openView.uid` is not the default write mechanism in this skill. Without strong evidence, do not proactively use it for popup reuse.
- For popup template reuse, prefer `popup.template` on `addAction/addRecordAction/addField/addFields`, or `configure(changes.openView.template)` when the opener already exists and the backend contract allows template switching. Full reference/copy and detach rules live in [templates.md](./templates.md).
- The upstream contract explicitly forbids taking the uid from one opener and reusing it on another opener. In particular, do not write the popup uid from one entry into another entry's `openView.uid`.
- If the user explicitly requests reuse of an existing popup, only evaluate that path when live facts have already proven that the uid is valid, exists, and does not point to a page/tab/popup-subtree node. Otherwise stop by default. Do not guess.
- If a field or action currently uses a popup template in `reference` mode, do not mutate popup inner blocks directly. Switch the popup template through `configure(changes.openView.template)` when the contract allows it, or detach first with `convertTemplateToCopy`.

## Custom Binding / Association Invariants

- `currentRecord` is a resource-binding semantic for blocks inside popup. It is not a reused instance of an existing page block.
- For collection blocks inside popup, the public semantic binding follows live `catalog.blocks[].resourceBindings`. Common values include `currentCollection`, `currentRecord`, `associatedRecords`, and `otherRecords`.
- The presence of these popup-scoped bindings is not itself evidence that low-level flow is required; treat them as normal DSL authoring semantics first.
- The `select`, `subForm`, and `bulkEditForm` scenes currently do not support creating popup collection blocks. If one of these scenes is active, do not continue with `compose/addBlock(table/details/list/gridCard/createForm/editForm/filterForm)`.
- Inside popup, block `resource` must always be written in object wire shape, not string shorthand. Use `{ "binding": "currentRecord" }` for `details/editForm(currentRecord)`. Use `{ "binding": "associatedRecords", "associationField": "<field>" }` for an association collection block inside popup.
- Association collection blocks inside popup should prefer semantic `resource.binding="associatedRecords"` by default. After writing, confirm that `resourceSettings.init.associationName` is still the full association name containing `.`, and that `sourceId` still exists. If readback degrades into a bare field name such as `roles`, or `sourceId` is missing, treat it as failure.
- For association fields, `openView.collectionName` should preserve target-collection semantics by default. Do not rewrite an association popup into the source collection just to fake `current row details`.

## `openView` vs popup action

| User intent | Preferred capability | Key concern |
| --- | --- | --- |
| open details on field click | `clickToOpen + openView` | read back the association-field uid first |
| record-level view/edit button | `recordActions.view/edit/popup` | `view/edit` may already be completed by backend default popup content; generic `popup` still needs explicit content or template |
| action button popup | popup action | popup target comes from the action write API |
| open as drawer | `openView.mode = "drawer"` or popup drawer | first decide whether the trigger source is a field or an action |
| open as normal dialog | `openView.mode = "dialog"` or popup action | prefer `openView` for field sources, popup for action sources |
