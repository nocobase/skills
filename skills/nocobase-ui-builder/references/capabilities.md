# Capabilities

Read this file when you already know you need to add something into a content area, but have not yet decided whether it should be a block, action, or field. If the request is still at the "what kind of page should this become" stage, go to [page-intent-planning.md](./page-intent-planning.md) first. For family / target, see [runtime-playbook.md](./runtime-playbook.md). For popup semantics and `currentRecord`, see [popup.md](./popup.md). For chart topic routing, see [chart.md](./chart.md). For JS rules, see [js.md](./js.md). Whether `shell-only popup` is allowed is governed by [normative-contract.md](./normative-contract.md).

## Contents

1. Selection order
2. Block selection
3. Block resource expectations
4. Form-like block selection
5. Action scope
6. General FilterForm capabilities
7. Field rules

## Selection Order

1. First decide whether the user wants a block, an action, or a field.
2. Then narrow by container and scope: `table/details/list/gridCard/filterForm/actionPanel/createForm/editForm`.
3. Only after that consider JS, association leaf fields, `openView`, layout, and other topic-specific configuration.
4. If the request is still describing a whole page rather than one concrete container, stop low-level selection and return to `pageBlueprint` planning first.

The block / action capabilities below are common values, not an exhaustive list. The final source of truth is live `catalog`.

This file chooses capabilities. It does not choose execution entry or plan-step compilation.

## Block Selection

### Default Creation Capabilities

- Default creatable blocks: `table`, `createForm`, `editForm`, `details`, `list`, `gridCard`, `filterForm`, `markdown`, `iframe`, `chart`, `actionPanel`, `jsBlock`.
- Only create or lightly reconfigure `map` and `comments` when the live `catalog` explicitly allows them.
- When the user explicitly names a block type, prioritize that block choice. In block context, `Grid` defaults to `gridCard`.

### Common Block Choices

| User goal | Preferred block | Key point |
| --- | --- | --- |
| table-like data operations, bulk actions, tree table, fixed columns | `table` | requires a real data source; `fields` are columns, `actions` are block-level actions, `recordActions` are row-level actions |
| create record, input page, addNew popup | `createForm` | form content is built through `fields` + `actions`; usually add `submit` for submission |
| edit record, edit popup, edit page | `editForm` | used for editing existing records; do not fake details view with it |
| read-only single-record details | `details` | must bind to a real data source; actions only go through `recordActions` |
| lightweight item browsing, mobile-friendly list | `list` | mainly displays item fields and item-level actions |
| card wall, grid cards, thumbnail browsing | `gridCard` | `fields` are display fields on the card, `recordActions` are per-card actions |
| filter condition input | `filterForm` | only handles filter input, not data display |
| static help text, documentation text | `markdown` | do not enable `jsBlock` for simple copy |
| embedded page / HTML | `iframe` | use when the content is clearly embedded external content |
| charts / reports | `chart` | primary configuration goes through `query / visual / events`; only fall back to `configure` for compatibility or extreme advanced cases |
| toolbar / utility button area | `actionPanel` | does not inherit collection-block action lists |
| explicitly requested runtime code | `jsBlock` | after creation, read back and confirm the related JS config was persisted |

## Block Resource Expectations

Do not overgeneralize collection binding. The correct rule is: `data-bound block`s need a real data source; `non-data block`s may stay unbound.

| block family | Default resource expectation | Notes |
| --- | --- | --- |
| `table`, `details`, `list`, `gridCard` | required | bind to a real collection or association-backed resource |
| `createForm`, `editForm` | required | bind to the collection or record semantics the form edits |
| `filterForm` | usually required | binding may be field-level and may target one or more data blocks |
| `chart` | conditional | data-driven charts need real query/resource facts; purely presentational chart shells are not a default assumption |
| `markdown`, `iframe`, `actionPanel`, `jsBlock` | optional | may be created without a collection |

Rules:

- Do not say "every block must bind a collection".
- In a `pageBlueprint`, every `data-bound block` must carry an explicit real data source or live binding fact, preferably through `dataSourceKey`.
- `non-data block`s may omit `dataSourceKey` entirely.
- Multi-collection pages are allowed, but each `data-bound block` must keep its own data-source boundary clear.

### Frequent Block Reminders

- `table`: key readback points are `actionsColumnUid`, field uids, and association-field `clickToOpen/openView`.
- `details`: prefer it for view-only scenarios. Do not fake a details page with `editForm`.
- `filterForm`: it is a general data-filter input block, not a chart-only capability. In multi-target scenarios, prefer target-binding fields explicitly exposed by the contract, especially `defaultTargetUid`.
- `markdown`, `iframe`, `actionPanel`, and `jsBlock` are valid non-data blocks. Do not force a collection binding onto them unless the live capability or the user requirement actually needs one.
- For how public block / field / action properties should be inlined into `settings`, see [settings.md](./settings.md).

## Form-Like Block Selection

- In form scenarios, prefer `createForm` and `editForm` by default.
- If the user wants "create record / input page / addNew popup", prefer `createForm`.
- If the user wants "edit popup / edit page / record-action edit popup", prefer `editForm`.
- The public semantics of form-like blocks are `fields` + `actions`. They only host form actions, not `recordActions`.
- For view-only scenarios, prefer `details`. Do not use form-like blocks as a details substitute.

## Action Scope

### Scope Quick Reference

| scope | Typical container | Typical entry | When to use |
| --- | --- | --- | --- |
| `block` | `table`, `list`, `gridCard` | `addAction` / `actions` | affects the entire dataset |
| `record` | `table`, `details`, `list`, `gridCard` | `addRecordAction` / `recordActions` | affects a single record or item |
| `form` | `createForm`, `editForm` | `addAction` / `actions` | form-submission style actions |
| `filterForm` | `filterForm` | `addAction` / `actions` | filter submit / reset / collapse |
| `actionPanel` | `actionPanel` | `addAction` / `actions` | toolbar/panel actions |

### Entry Rules

- `addAction` / `actions` only host non-`recordActions`. `addRecordAction` / `recordActions` only host record-level actions.
- `details` is a block, but its public action capability belongs to `recordActions`.
- Readback for `table` may expose internal containers such as `actionsColumnUid`, but the target of `addRecordAction` must still be an owner target like `table/details/list/gridCard`.

### Frequent Actions

- block actions: `filter`, `addNew`, `popup`, `refresh`, `expandCollapse`, `bulkDelete`, `bulkEdit`, `bulkUpdate`, `export`, `exportAttachments`, `import`, `link`, `upload`, `composeEmail`, `templatePrint`, `triggerWorkflow`, `js`
- record actions: `view`, `edit`, `popup`, `delete`, `updateRecord`, `duplicate`, `addChild`, `composeEmail`, `templatePrint`, `triggerWorkflow`, `js`
- form actions: `submit`, `triggerWorkflow`, `js`, `jsItem`
- filter-form actions: `submit`, `reset`, `collapse`, `js`
- action-panel actions: `js`, `triggerWorkflow`

### Key Constraints

- `addNew`, `view`, and `edit` are CRUD-style popup actions. When no explicit `popup.blocks` or `popup.template` is supplied, backend may provide a standard popup completion.
- Generic `popup` actions, custom popup semantics, and completion verification still belong to [popup.md](./popup.md) and [verification.md](./verification.md).
- "view current record / edit current record / this record / this row" should default to record-popup handling.
- Whether it is allowed to create only a popup shell is governed by the `Popup Shell Fallback Contract` in [normative-contract.md](./normative-contract.md).
- `submit` is a public capability in both form-action containers and `filterForm`, but they are different scopes. `collapse` belongs only to `filterForm`.
- For inlining action title, tooltip, button type, and similar public attributes, see [settings.md](./settings.md).
- In this skill, `triggerWorkflow` only mounts the UI action shell for an existing workflow onto the surface. As soon as you need to create a workflow, choose a workflow key/id, or change trigger/node/execution path, hand off immediately to `nocobase-workflow-manage`.

## General FilterForm Capabilities

- A single `filterForm` can serve multiple data blocks. Do not treat it as a chart-only special case. It can drive filtering interactions for multiple data blocks, subject to live `catalog` and target contract.
- In multi-target scenarios, prefer field-level binding granularity. Do not assume the whole `filterForm` binds to exactly one block, and do not assume all fields automatically inherit the same target.
- In `pageBlueprint` planning, capture multi-target filter semantics explicitly in `interactions`; do not leave the eventual `defaultTargetUid` decision implicit.
- If the live contract exposes `defaultTargetUid`, prefer filling it explicitly during field creation to declare the field's default target.
- A field existing in collection schema does not guarantee that the current `filterForm` can `addField`; current-target addability still depends on live `catalog.fields`. For the detailed field-truth and addability rules, follow `Field Rules` below.
- For post-write wiring confirmation, see `Write Readback` in [verification.md](./verification.md). Do not mix post-write assertions into capability-selection rules.

Illustrative fragment:

```json
[
  {
    "fieldPath": "createdAt",
    "defaultTargetUid": "users-table-uid"
  },
  {
    "fieldPath": "status",
    "defaultTargetUid": "users-list-uid"
  }
]
```

This means that different fields inside the same `filterForm` may each declare their own default target. The exact envelope still follows the live tool schema, such as `addField` vs `addFields`.

## Field Rules

### Container Mental Model

- `table/details/list/gridCard`: primarily display fields
- `createForm/editForm`: primarily editable fields
- `filterForm`: primarily filter fields, not display fields

### Bound Fields and Common Configuration

- The most common shorthand for `compose(...).fields` is a string field name, for example `"nickname"`.
- In `addField/addFields`, or whenever you need to declare the field path explicitly, use `{ "fieldPath": "nickname" }`.
- When binding a real field, `fieldPath` is a required creation parameter and does not belong in `settings`. Synthetic standalone fields such as `jsColumn` / `jsItem` may omit a real `fieldPath`.
- Use `collections:get(appends=["fields"])` as the default live fact source to prove that the field exists, has an `interface`, and carries the needed scalar/relation metadata. This read includes relation fields too.
- `addField/addFields` should look at live `catalog.fields` first when deciding whether the current target can actually add the field. A field existing in collection schema does not guarantee that it is addable on the current target.
- If you did not read `catalog({ target, sections: ["fields"] })` first in this round, you may continue only when `collections:get(appends=["fields"])` or an equivalent live fact has already proven that the field has an `interface`. Otherwise stop. Do not probe with trial writes.
- The server ultimately decides addability from the field's `interface`, but current-target addability is confirmed through `catalog.fields`. A field without an `interface` cannot be added into a block through `addField`.
- For inlining public field attributes such as label, required, and disabled, see [settings.md](./settings.md).
- Common wrapper config: `label`, `showLabel`, `tooltip`, `extra`, `width`.
- `fixed` is only common in column semantics such as table columns, action columns, and `jsColumn`. Do not treat it as a universal field-wrapper setting.
- Common field config: `titleField`, `clickToOpen`, `openView`, `allowClear`, `multiple`.

### association leaf field

- Typical `fieldPath`: `roles.title`, `department.name`.
- When the user says "show department name" or "role title", prefer mapping it to an association leaf field rather than just an association id.
- To-many association leaf fields are allowed in display scenarios. A common next step is `clickToOpen = true` plus `openView`.
- Inside `details/list/gridCard`, direct to-many association fields such as `users.roles` also default to this display semantics: they should normalize to text display through the target table's `titleField`, not to a sub-table by default. Inputs like `roles` and `roles.title` should be treated as the same display field when live `catalog` has already narrowed them to one display field.
- If the user explicitly asks to make an existing association field display as a "sub-table", first interpret that as a field-wrapper reconfiguration problem, not as "add a new table block". Read back the existing field, locate `wrapperUid/fieldUid/innerFieldUid`, and if the live wrapper contract exposes `fieldComponent`, prefer `configure(changes.fieldComponent = "DisplaySubTableFieldModel")` on the wrapper uid.
- Only switch to a block-level solution when the user explicitly asks for a separate table region / association-details block / independent block actions, or when live facts prove that the current wrapper cannot support the requested `fieldComponent`.

### `filterForm` Special Points

- For multi-target binding and field-addability rules, see the previous section `General FilterForm Capabilities`.
- `renderer: "js"`, `jsColumn`, and `jsItem` are not supported.
- If JS is required, redesign it as a block or an action. Do not force it into a filter field.

### Readback Location

Most precise reconfiguration work must distinguish `wrapperUid`, `fieldUid`, and `innerFieldUid`. When adding popup/openView to an association field, or doing finer-grained field configuration, you usually need one of those specific uids.

- For wrapper-level changes such as association-field `fieldComponent`, target `wrapperUid` for the write, then read back both the wrapper and the inner field. Do not write `fieldComponent` to `innerFieldUid` and do not replace the field with a new block unless the user explicitly wants a block-level solution.
