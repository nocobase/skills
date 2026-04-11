# Capabilities

Read this file when you already know you need to add something into a content area, but have not yet decided whether it should be a block, field, or action.

## 1. First Routing Rule

- If the request is still a **whole-page** request, go back to [page-intent.md](./page-intent.md) first.
- If the request is a **localized edit**, stay in low-level APIs and use this file.

## 2. Block vs Field vs Action

### Choose a block when

- the user is adding a new content area
- the change needs its own data source or layout slot
- examples: `table`, `details`, `list`, `gridCard`, `markdown`, `jsBlock`, `iframe`, `actionPanel`

### Choose a field when

- the block already exists and the user wants to expose one more field/item/column
- examples: add `nickname` to a table, add `status` to a details block

### Choose an action when

- the block already exists and the user wants a button-like operation
- examples: `addNew`, `view`, `edit`, custom `popup`, submit/reset, js action

## 3. Data-bound vs Non-data Blocks

- Data-bound blocks must be backed by real schema facts.
- Non-data blocks such as `markdown`, `iframe`, `actionPanel`, and many `jsBlock` scenarios may stay unbound.

## 4. Field Rules

- Use `collections:get(appends=["fields"])` as the default field truth.
- A field existing in collection schema does not automatically mean it is addable on the current UI target.
- When current-target addability matters, read `catalog({ target, sections: ["fields"] })`.
- Prefer display-ready field paths such as `department.title` over raw relation ids when the user is describing display semantics.

## 5. Action Rules

- Record-level actions belong on record-capable owners such as table/details/list/gridCard.
- Non-record actions belong to block/form/panel style containers.
- `view` / `edit` / `addNew` may create or use popup behavior; see [popup.md](./popup.md).
