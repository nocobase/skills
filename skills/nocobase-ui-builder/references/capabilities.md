# Capabilities

Read this file when you already know you need to add something into a content area, but have not yet decided whether it should be a block, action, or field. If the request is still at the `what kind of page should this become` stage, go to [page-intent-blueprint.md](./page-intent-blueprint.md) first. For family / target, see [runtime-playbook.md](./runtime-playbook.md). For popup semantics and `currentRecord`, see [popup.md](./popup.md). For chart topic routing, see [chart.md](./chart.md). For JS rules, see [js.md](./js.md). Whether `shell-only popup` is allowed is governed by [normative-contract.md](./normative-contract.md).

## Selection Order

1. First decide whether the user wants a block, an action, or a field.
2. Then narrow by container and scope: `table/details/list/gridCard/filterForm/actionPanel/createForm/editForm`.
3. Only after that consider JS, association leaf fields, `openView`, layout, and other topic-specific configuration.
4. If the request is still describing a whole page rather than one concrete container, stop low-level selection and return to blueprint DSL authoring first.

The block / action capabilities below are common values, not an exhaustive list. The final source of truth is live `catalog`.

This file chooses capabilities. It does not choose the execution entry or DSL authoring flow.

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

- Do not say `every block must bind a collection`.
- In blueprint DSL, every `data-bound block` must carry an explicit real data source or live binding fact, preferably through `dataSourceKey`.
- `non-data block`s may omit `dataSourceKey` entirely.
- Multi-collection pages are allowed, but each `data-bound block` must keep its own data-source boundary clear.

## Action Scope

| scope | Typical container | Typical entry | When to use |
| --- | --- | --- | --- |
| `block` | `table`, `list`, `gridCard` | `addAction` / `actions` | affects the entire dataset |
| `record` | `table`, `details`, `list`, `gridCard` | `addRecordAction` / `recordActions` | affects a single record or item |
| `form` | `createForm`, `editForm` | `addAction` / `actions` | form-submission style actions |
| `filterForm` | `filterForm` | `addAction` / `actions` | filter submit / reset / collapse |
| `actionPanel` | `actionPanel` | `addAction` / `actions` | toolbar/panel actions |

Rules:

- `addAction` / `actions` only host non-`recordActions`. `addRecordAction` / `recordActions` only host record-level actions.
- `details` is a block, but its public action capability belongs to `recordActions`.
- `addNew`, `view`, and `edit` are CRUD-style popup actions. When no explicit `popup.blocks` or `popup.template` is supplied, backend may provide a standard popup completion.
- Generic `popup` actions, custom popup semantics, and completion verification still belong to [popup.md](./popup.md) and [verification.md](./verification.md).

## Field Rules

- The most common shorthand for `compose(...).fields` is a string field name, for example `nickname`.
- In `addField/addFields`, or whenever you need to declare the field path explicitly, use `{ "fieldPath": "nickname" }`.
- Use `collections:get(appends=["fields"])` as the default live fact source to prove that the field exists, has an `interface`, and carries the needed scalar/relation metadata.
- `addField/addFields` should look at live `catalog.fields` first when deciding whether the current target can actually add the field. A field existing in collection schema does not guarantee that it is addable on the current target.
- In blueprint DSL authoring, capture multi-target filter semantics explicitly in `interactions`; do not leave the eventual `defaultTargetUid` decision implicit.
- Association leaf fields such as `department.name` or `roles.title` should be preferred over raw association ids for display semantics.
