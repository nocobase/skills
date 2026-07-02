---
title: Capability selection gate
description: Decide native block vs native container plus JS slot vs JSBlock before drafting a NocoBase UI.
---

# Capability Selection Gate

Use this before `whole-page-quick.md` or localized writes when the user gives a business description, screenshot, HTML prototype, or any visible layout/style requirement. The goal is to make block choice a coverage decision, not a guess.

## Coverage Gate

For every visible region, create a short private `regionSelection[]` ledger before drafting:

```json
{
  "region": "Customer cards",
  "requirements": ["record grid", "rich card body", "status pills", "click opens details"],
  "nativeCandidate": "gridCard",
  "coverage": "nativeContainerPlusJsSlot",
  "gap": ["native fields cannot render the requested card body"],
  "jsSlot": "renderer:js JSField",
  "catalogProbe": "fields on GridCardItemModel"
}
```

Valid `coverage` values:

- `nativeOnly`: the native block covers every required function, interaction, data binding, and hard visual constraint.
- `nativeContainerPlusJsSlot`: the native container is still correct, but one field/column/action/item must be custom rendered or custom logic.
- `jsBlockRequired`: no native container owns the region, or the region is pure custom visual / pure aggregate KPI.

Do not mark a region `nativeOnly` when any required feature is missing. Explicit screenshots, HTML prototypes, and user-stated layout/style details are hard visual constraints; ordinary business descriptions only create visual constraints when they say so.

## Native-First Ladder

1. Use a native block with native fields/actions when it covers all requirements.
2. Keep the native container and add the smallest JS slot when only a field, column, card body, form helper, or action item is missing.
3. Use `jsBlock` only when there is no suitable native data container, or the region is a pure aggregate/custom visual such as KPI cards, map, kiosk, scanner, custom gauge, or big-screen panel.

For data-backed regions, the container should stay native so NocoBase keeps collection binding, ACL, CRUD, filters, sorting, pagination, popups, and template behavior.

## Capability Matrix

| Need / region shape | First native candidate | Native covers | Typical gap | Smallest JS escalation |
| --- | --- | --- | --- | --- |
| Dense records, spreadsheet, operations | `table` | columns, sorting, filter action, row actions, CRUD | rich lead cell, computed badge, custom toolbar controls | `JSColumnModel`, `renderer:"js"`, toolbar `JSItemActionModel` |
| Single-column feed or activity cards | `list` | record list, paging, filter action, record popup | card layout, progress, avatars, pill groups | `renderer:"js"` / `JSFieldModel` |
| Multi-column record card gallery | `gridCard` | card grid, paging, filter action, record popup | full custom card body or visual grouping | `renderer:"js"` / `JSFieldModel` |
| Responsive fill-width catalog, facet rail, custom pills | `list` + native actions | data list and paging | facet counts, custom pills, CSS auto-fill grid | `JSBlockModel` for facet rail plus `JSFieldModel` card and `JSItemActionModel` pills |
| Create/edit form | `createForm` / `editForm` | field layout, validation, submit, relation picker | live preview, custom helper item, custom editable control | `JSItemModel`, `JSEditableFieldModel`, form `JSActionModel` |
| Details / one-record view | `details` | display fields, related popups, record actions | rich summary item or computed display | `renderer:"js"` / `JSFieldModel`, record `JSItemActionModel` |
| Pipeline, status columns, drag board | `kanban` | grouped columns, drag, quick create, card popup | rich card body beyond native card fields | `renderer:"js"` / `JSFieldModel` |
| Calendar / schedule | `calendar` | date grid, start/end/title/color fields, event popup | unusual timeline lane or non-calendar visualization | keep calendar if semantics match; otherwise `list + JSField` or `jsBlock` |
| Tree / hierarchy / tree filter | `tree` | hierarchy, search, descendants, connected targets | custom node rendering not exposed | report capability gap or JS only inside legal catalog slot |
| Dedicated query area | `filterForm` | filter fields, submit/reset/collapse, cross-block targets | multi-select facets with live counts, visual pill groups | separate JS control plus target block filter resource |
| Trends, distribution, ranking, percentage | `chart` | chart query and visual config | raw ECharts option or drilldown event | chart `visual.raw` / `events.raw`; keep `chart` selected |
| KPI / summary numbers | `jsBlock` | no native statistic block in current contract | aggregate card strip | `jsBlock` with readable code |
| Comments / discussion | `comments` | comment thread for legal context | unsupported collection/context | report gap; do not fake with markdown |
| Record history / audit trail | `recordHistory` | history block for legal context | missing filter target/current record scene | report gap; do not fake with table |
| Operation shortcuts | `actionPanel` | clickable operations and links | passive metric display | use `jsBlock` for passive metrics |
| Static instructions | `markdown` / `iframe` | static content or embedded page | dynamic data or CRUD | choose native data block or JS only for the dynamic region |

## JS Slot Legality

- Table rich cell: `JSColumnModel` or field object with `renderer:"js"`.
- List/GridCard/Details/Kanban display card/item: bound field with `renderer:"js"` / `JSFieldModel`.
- Create/Edit form custom item: `JSItemModel`; custom editable field: `renderer:"js"` / `JSEditableFieldModel`.
- Ordinary click logic: scoped `JSCollectionActionModel`, `JSRecordActionModel`, `JSFormActionModel`, or `FilterFormJSActionModel`.
- Custom-rendered button group, chips, dropdown, toolbar UI, or helper action item: `JSItemActionModel`.
- `filterForm` does not host JS fields/items. Move custom filter UI into a JS control that drives the target data block.

For localized edits, verify unusual slots with `flow-surfaces catalog` before writing. For whole-page drafts, use the public slot names above and let backend validation return aggregate `errors[]` for unsupported shapes.

## Hard Stops

- Do not collapse a data-backed page or region into one full-page `jsBlock`.
- Do not use `actionPanel`, `gridCard`, `table`, `markdown`, or static notes to fake KPI, chart, comments, history, or custom-render requirements.
- When this gate selects `chart`, `jsBlock`, or a JS slot, backend errors only permit repairing that same choice unless the backend says the target is unsupported.
- If native coverage is uncertain and the decision would change the block family, inspect live metadata/catalog or state the gap; do not guess.
