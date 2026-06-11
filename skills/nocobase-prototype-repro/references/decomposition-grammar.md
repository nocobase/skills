# Decomposition grammar — region = container × JS slots × behaviors

The whole point of this page is to make decomposition a **lookup, not free invention** — so the agent picks from a closed set instead of guessing. Keep it that simple.

## Selection rule

Each prototype region → **pick 1 container + attach 0–N JS slots + attach 0–N behaviors.** Only choose from the lists below. Record the choice in the nb-spec. Data regions always get a native container; a freestanding `JSBlock` is only for regions with no data container.

## Containers (pick 1)

Native data blocks: `Table` / `List` / `GridCard` / `Kanban` / `Calendar` / `Tree` / `Form` (create/edit) / `Details` (single record) / `Chart` / `FilterForm`
Escape hatch: `JSBlock` — only for data-less custom visuals (map / kiosk / gauge / glowing dashboard).

## Legality matrix — what each container can host

| Container | JS slots it accepts | Common behaviors |
|---|---|---|
| Table | `JSColumn` (rich cell), toolbar `JSAction` (pills/controls), row `JSRecordAction` | event-flow summary row, cross-block filter |
| List | `JSField` (whole-record card), toolbar `JSAction` | cross-block filter, CSS auto-fill grid |
| GridCard | `JSField` (whole-record card — remove sibling native fields + `showLabel:false`) | cross-block filter |
| Kanban | one JS card field (card field limit 2 → use JS) | native drag |
| Form / Details | `JSItem` (custom item / live preview), `JSEditableField`, `JSAction` | event-flow on `formValuesChange` (linkage/value/visibility) |
| Calendar / Tree / Chart | usually pure native | `colorField` / self-relation / Chart custom raw |
| FilterForm | native fields | drives another block (cross-block filter) |
| JSBlock | the block itself is JS | fetches its own data via `ctx.resource` |

Slots are not arbitrary — the exact legal set per container is whatever `flow-surfaces catalog --sections '["actions"]'` / `'["fields"]'` returns on that block. This table is the verified mainline; confirm an unusual slot at build time.

## Behaviors (attach 0–N)

- **event-flow / linkage** — listen to `formValuesChange` for field linkage / value / visibility; table summary row. **Prefer declarative event-flow for pure linkage (no code); use a JS slot only when rendering or logic is custom.**
- **cross-block filter** — facet / pill / search push `addFilterGroup` to the same resource + `refresh`.
- **workflow** (server-side) — `llm` node writing a field, status transitions.

## Effect → combination recipe library (look up, don't re-derive)

| Want this effect | Combination |
|---|---|
| Rich card list (single column) | List + JSField |
| Rich card grid (fills width, reflows) | List + JSField + CSS auto-fill (`repeat(auto-fill,minmax(280px,1fr))`) |
| Catalog (left facets + pills + grid) | List+JSField+CSS ＋ facet `JSBlock` ＋ pill `JSItemAction` ＋ cross-filter |
| Table with a rich lead column | Table + JSColumn |
| Table with a summary/footer row | Table + event-flow (footer aggregate) |
| Board by status | Kanban + JS card field |
| Composer with live preview | Form + JSItem (preview bound via `formValuesChange`) |
| Quick-filter pills in the toolbar | toolbar `JSItemAction` |
| Click card/row → detail | `ctx.openView(<real ViewActionModel uid>, {filterByTk})` |
| Big-screen / map / gauge (no data container) | JSBlock |
| Status transition / write-back | native `UpdateAction` or workflow |

Detailed runnable snippets for these live in [block-recipes.md](block-recipes.md). This page is the index the design step selects from.
