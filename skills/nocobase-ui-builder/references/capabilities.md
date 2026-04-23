# Capabilities

Read this file when you already know you need to add something into a content area, but have not yet decided whether it should be a block, field, or action.

## 1. First Routing Rule

- If the request is still a **whole-page** request, go back to [page-intent.md](./page-intent.md) first and stay in the public page blueprint / `applyBlueprint` path.
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
- examples: `addNew`, `view`, `edit`, custom `popup`, `submit` on `createForm` / `editForm`, `reset` only when the live target / catalog explicitly shows it is supported, js action, and `addChild` under `recordActions`
- if the user says “给表格 / 列表 / Grid 增加筛选”, or explicitly adds search to a table / list / Grid / card-like host, including “支持搜索 / 带搜索 / 可搜索 / searchable”, and does not explicitly ask for a filter/search block or form, default to a block-level `filter` action first
- if the requirement is really "click a title/name-like field to open details", prefer a field popup / clickable-field route instead of adding a redundant `view` action first

## 3. Data-bound vs Non-data Blocks

- Data-bound blocks must be backed by real schema facts.
- Non-data blocks such as `markdown`, `iframe`, `actionPanel`, and many `jsBlock` scenarios may stay unbound.

## 4. Field Rules

- Use live collection metadata as the default field truth. Prefer `nb api data-modeling collections get --filter-by-tk <collection> --appends fields -j`; if that command family is unavailable, use `nb api resource list --resource collections --filter '{"name":"<collection>"}' --appends fields -j`.
- Do **not** use `nb api data-modeling collections fields list` / `data-modeling fields list` for page authoring / field discovery; they are compact browse views only.
- Use `nb api data-modeling collections fields list --collection-name <collection> --filter '{"name":"<field>"}' -j` only for known single-field follow-up.
- A field existing in collection schema does not automatically mean it is addable on the current UI target.
- If the live collection metadata truth shows `interface: null` / empty, do not author that field into page-blueprint `fields[]`.
- When current-target addability matters, read `catalog({ target, sections: ["fields"] })`.
- Prefer display-ready field paths such as `department.title` over raw relation ids when the user is describing display semantics.

## 5. Action Rules

- Record-level actions belong on record-capable owners such as table/details/list/gridCard.
- Non-record actions belong to block/form/panel style containers.
- `view` / `edit` / `addNew` may create or use popup behavior; see [popup.md](./popup.md).
- `addChild` is a record action, not a block action.
- For the canonical `addChild` placement and live-target rule, follow [normative-contract.md](./normative-contract.md).
- For localized creates, read back the persisted surface before adding follow-up actions or popup wiring. If the user explicitly asked for filter/search on a new `table` / `list` / `gridCard`, add a normal block-level `filter` action on that host.
- When you do need popup-capable `add-action` / `add-record-action`, keep `popup.tryTemplate=true` as the default execution fallback unless an explicit `popup.template` or explicit `popup.tryTemplate=false` override already exists.
- If click-to-open already covers the requested details behavior on a shown Name/Title-like field, avoid adding a separate `view` record action unless the user explicitly asked for a button/action column.
