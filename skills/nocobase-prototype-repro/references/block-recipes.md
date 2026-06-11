# Block recipes — region → native block, with runnable patterns

For each prototype region, the native block to reach for and the minimal `nb api flow-surfaces` path to build it. Snippets are proven against NocoBase 2.1.0-alpha.45 (`flow-surfaces` + RunJS). For full command shapes see `nocobase-ui-builder` (`page-archetypes.md`, `js.md`, `popup.md`, `chart.md`). Always pass `-e <env> -y`. Write JS code via `curl flowModels:save` (never `flowModels:update`).

The golden rule: **if a region is a list/table/board/calendar of records, it is a native block.** A JS block is only for genuinely custom visuals (glowing map, kiosk, gauge, live feed).

---

## 1. Table + one rich JS column

When the prototype shows dense rows but wants one visually rich lead cell (icon tile + bold title + sub-meta), keep the native Table and add **one whole-record JS column**.

- `add-field --renderer js --field-path <anchorField>` on the table block → produces a `JSColumnModel`/`JSFieldModel` wrapper; the anchor field is just a binding, the cell reads the whole record.
- `configure --changes {showLabel:false}` to drop the leftover "Field :" label.
- Write the renderer via `flowModels:save`.

Renderer skeleton (whole-record card cell, with click → native popup):
```js
const React = ctx.libs.React;
const { Typography } = ctx.libs.antd;
const record = await ctx.getVar('ctx.record');

const STATUS_COLOR = { confirmed:'#52c41a', completed:'#1677ff', cancelled:'#ff7875' };
const color = STATUS_COLOR[String(record.status ?? '')] || '#8c8c8c'; // fallback, never "Tag not found"
const initials = String(record.room?.name ?? record.title ?? '?').slice(0,2).toUpperCase();

return React.createElement('div',
  { style:{ display:'flex', gap:11, alignItems:'center', cursor:'pointer' },
    onClick:() => ctx.openView('<TABLE_VIEWACTION_UID>', {
      mode:'drawer', size:'medium', dataSourceKey:'main',
      collectionName:'<coll>', filterByTk: record.id, params:{ filterByTk: record.id },
    }) },
  React.createElement('div', { style:{ width:36, height:36, borderRadius:9,
    background:'#e8f0fe', color:'#1677ff', fontWeight:700, fontSize:14,
    display:'flex', alignItems:'center', justifyContent:'center', flex:'0 0 auto' } }, initials),
  React.createElement('div', null,
    React.createElement('div', { style:{ fontSize:14, fontWeight:650, lineHeight:1.15 } }, record.title),
    React.createElement('div', { style:{ fontSize:11.5, color:'#8c8c8c', marginTop:2, display:'flex', gap:6, alignItems:'center' } },
      React.createElement('span', { style:{ width:7, height:7, borderRadius:'50%', background:color, display:'inline-block' } }),
      `${record.room?.name ?? '-'} · ${record.attendees ?? 0}p`)));
```

## 2. List + JS item — the default for any card-styled region

Feeds, "currently checked out", activity, contact lists, anything the prototype draws as a column of cards → **List**, not Table.

- `add-block --type list` with `resourceInit` (page grids reject `currentRecord` binding). The backend forces ≥3 visible business fields on create — create with 3 real fields, then `remove-node` them, then `add-field --renderer js` to attach **one** whole-record renderer.
- `configure` to set sort (`occurred_at desc` etc.), `dataScope` (e.g. `status=checked_out`), pageSize, and `showLabel:false`.
- The card body renderer is the same shape as §1 (read `ctx.record`, build a flex card). Make overdue / urgent states visually loud (red border-left, red tag).

Common slip: setting List `sort` to a non-existent column → "Invalid SQL column" render failure. Sort by a real column (`updatedAt`, `occurred_at`).

## 3. GridCard + JS card — multi-column rich card grid (preferred for card grids)

**This is the right block for a prototype that shows a multi-column grid of rich, styled cards.** GridCard gives native multi-column layout AND supports a full JS card renderer. Use it for photo/avatar grids, asset catalogs, people directories, any "N-column card gallery with styled content".

### How to build (verified alpha.45)

1. `add-block --type gridCard --resource-init {...} --fields '["f1","f2","f3"]' --defaults '{"collections":{"<coll>":{"fieldGroups":[{"title":"Basic","fields":[...all fields...]}]}}}'`
   - `fields` must list ≥3 business fields (backend requires visible fields on create).
   - `defaults.collections.<coll>.fieldGroups` is required if the collection has >10 total fields (covers generated popup fields); all fields must be listed.
2. The block creates: `GridCardBlockModel` → `GridCardItemModel` → `DetailsGridModel` → `DetailsItemModel` (one per field) → field model inside.
3. `add-field --renderer js --field-path <any_anchor_field>` on the **`GridCardItemModel`** uid → API returns `fieldUse: "JSFieldModel"`. The tree node is `DetailsItemModel` → `JSFieldModel`. This **does execute** — the old gotcha was wrong.
4. `remove-node` the original native `DetailsItemModel` nodes (name/asset_no/category etc.) — leave only the `DetailsItemModel` wrapper that holds the JSFieldModel.
5. `configure --changes {showLabel:false}` on the remaining `DetailsItemModel` wrapper to drop the "Name :" label.
6. Write the full card renderer to the `JSFieldModel` via `curl flowModels:save` (same `ctx.getVar('ctx.record')` / `ctx.render(html)` pattern as List).
7. Wire FilterForm → GridCard via `filterManager` on the `BlockGridModel` (same `filterId`/`targetId`/`filterPaths` shape as for a List).

### Key structure after build

```
GridCardBlockModel (uid=<gc>)
  GridCardItemModel (uid=<item>)
    DetailsGridModel (uid=<dgrid>)
      DetailsItemModel (uid=<wrapper>)   ← configure showLabel:false here
        JSFieldModel (uid=<js>)          ← write rich card code here via flowModels:save
  FilterActionModel
  RefreshActionModel
  AddNewActionModel
```

### Why `add-field --renderer js` on GridCard works (and why the old claim was wrong)

The earlier note "lands as DetailsItemModel, renderer doesn't execute" was based on observing the tree structure: the node IS wrapped in a `DetailsItemModel`, but the inner `JSFieldModel` **does** execute. The fix is to remove the sibling native DetailsItemModel nodes so the JS card body has no competing native fields above it. After cleanup it renders a full-page-width-per-column rich card with gradients, badges, progress bars, and avatars.

### List + CSS multi-column as alternative

A List block can also be made multi-column via CSS injection in the JSFieldModel code. Inject a `<style>` tag once per block mount (idempotent via style-tag id check on `ctx.element['owner'+'Document']`):

```js
try {
  const doc = ctx.element['owner'+'Document'];
  const styleId = 'my-grid-css';
  if (doc && !doc.getElementById(styleId)) {
    const s = doc.createElement('style');
    s.id = styleId;
    s.textContent = `
      [data-grid-item-uid="<LIST_BLOCK_UID>"] .ant-spin-container > ul.ant-list-items {
        display: grid !important;
        /* responsive auto-fill: cards stretch to fill the row, reflow by width */
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)) !important;
        gap: 16px !important;
        align-items: start !important;
      }
      [data-grid-item-uid="<LIST_BLOCK_UID>"] .ant-list-item {
        display: block !important;
        border-block-end: none !important;
        padding: 0 !important;
      }
    `;
    doc.head.appendChild(s);
  }
} catch(e) {}
```

With `repeat(auto-fill, minmax(280px,1fr))` the cards **stretch to fill the row and reflow by available width** — true responsive "fill the width", which a GridCard's fixed/breakpoint column count does not give.

⚠️ **The JS card won't fill its grid cell unless you also un-collapse the JSField wrapper chain.** Setting the card root to `width:100%` is necessary but NOT sufficient: a List JS field renders inside `.ant-form-item-control-input-content → div → span(display:inline-block) → .ant-app → yourCard`, and that **`inline-block` span shrinks to content width** (e.g. 167px), so the card has nothing to fill — you get filled grid tracks (329px) but narrow cards with big right-side gaps. Fix: card root `width:100%; boxSizing:border-box; display:block`, **plus** scoped CSS forcing the wrapper chain (not its inner badges) to block/full-width:
```css
[data-grid-item-uid="<LIST_UID>"] .ant-list-item,
[data-grid-item-uid="<LIST_UID>"] .ant-list-item > * { width:100% !important; box-sizing:border-box !important; }
[data-grid-item-uid="<LIST_UID>"] .ant-form-item-control-input-content > div,
[data-grid-item-uid="<LIST_UID>"] .ant-form-item-control-input-content > div > span,
[data-grid-item-uid="<LIST_UID>"] .ant-form-item-control-input-content .ant-app {
  display:block !important; width:100% !important; box-sizing:border-box !important;
}
```
Scope to `control-input-content > div > span` / `.ant-app` (the chain **above** the card) — never `span` globally — or you'll break the inline badges/pills *inside* the card. Verify by measuring: card box width should equal the grid track width (±4px).

### Comparison: GridCard vs List+CSS for multi-column rich cards

| | GridCard + JS | List + JS + CSS grid |
|---|---|---|
| Multi-column | native, **fixed/breakpoint** column count | CSS grid on `ul.ant-list-items` |
| Responsive **fill-the-width** (cards stretch, auto reflow) | no (fixed columns, gaps on the right) | **yes** (`auto-fill, minmax`) |
| Rich JS card | yes | yes |
| FilterForm wiring | `filterManager` on BlockGridModel | same |
| "View/Edit" action links | toolbar only | inline per row |
| Cleanup needed | remove native DetailsItemModel fields + `showLabel:false` | none |
| Best for | a standard breakpoint grid, no custom CSS | **a catalog/gallery that should fill the width responsively, or that needs a facet rail / pill bar** |

**Rule of thumb:** if the prototype's grid clearly *fills the width* (cards stretch, reflow on resize) or sits next to a facet rail / pill bar — use **List + JS + CSS auto-fill** (the rich-catalog archetype below). Use GridCard only for a plain fixed-breakpoint grid.

## 3b. Rich catalog archetype — facet rail + status pills + responsive card grid

The reliable build for a "real product catalog" screen (asset catalog, product gallery, directory): a prototype with a **left faceted filter sidebar** (multi-select checkboxes with live counts), a **status pill bar** above the grid, and a **responsive card grid** that fills the width. Native blocks can't express the faceted multi-select with counts, so this is a composed pattern. Three regions wired by cross-block filter:

1. **Left facet rail = a JS block** (`JSBlockModel`, not FilterForm — FilterForm has no multi-select-with-counts). It:
   - fetches distinct values + counts per facet field (e.g. `ctx.api.request` with `data-modeling` aggregate, or list+group client-side) for Category / Status / Location;
   - renders grouped multi-select checkboxes with the count badges, a search box, and a "Reset all filters";
   - on change, applies the combined filter to the grid resource via the shared filter manager / `ctx.engine.getModel(<gridUid>).resource.addFilterGroup(...)` + `.refresh()` (cross-block filter, see §8).
2. **Status pill bar above the grid = the click-to-filter pill pattern** (toolbar JS action or a small JS strip): All / <each status>, single-select, highlights active, sets the status filter on the same grid. State on `ctx.model` so it survives remount (never re-apply in a mount `useEffect`).
3. **Right grid = List + JS item card + CSS auto-fill** (§2 + the CSS from §3) so the rich cards **fill the width and reflow** — `repeat(auto-fill, minmax(280px,1fr))`.

Wire all three to filter the **same** grid resource; combine facet + pill + search into one filter group (replace, don't stack, the group each change). Result beats both a plain GridCard (no facets) and a bare FilterForm (no counts / no pills): faceted navigation + quick pills + responsive rich cards. This is the canonical answer when the user says a catalog "isn't rich enough" or wants "left facets + grid that fills".

**Pill placement — toolbar vs separate block.** The status pill bar can live in the block's **top-right action toolbar** (next to Filter / Add new / Refresh) instead of as a separate row. The List/Table toolbar accepts two JS action types (verified alpha.45 via `flow-surfaces catalog --sections '["actions"]'` on the block): `JSCollectionActionModel` ("JS action" — click-logic button, no render) and **`JSItemActionModel`** ("JS item" — a **render** surface, `ctx.render` + `ctx.libs.React`). For pills/custom widgets in the toolbar use `JSItemActionModel`:
```
nb api flow-surfaces add-action --target '{"uid":"<blockUid>"}' --use JSItemActionModel
# then flowModels:save the render code (pills → addFilterGroup('pill-status',{...}) + refresh on the grid resource)
```
Toolbar `JSItemActionModel` is the tidy home for quick-filter pills; a separate JS block row is the fallback when the toolbar is too narrow.

## 4. Kanban + JS card

Pipeline / board-by-status. Native **Kanban**, `groupField=<statusField>`. Kanban's own card field limit is 2 — for a rich card, **remove the plain card fields and add one JS card field**:
- Remove existing card fields (`subject`, `status`) via `remove-node`.
- `add-field --renderer js` bound to any one field on the Kanban card item model; render the whole record (title + priority tag + channel tag + assignee avatar + SLA relative time).
- `configure --changes {showLabel:false}`.
- Seed enough tickets that each column has ≥2–3 cards, else the board looks broken.

Priority/channel/status → color+icon all need fallback to raw value.

## 5. Calendar — schedule / room booking

`add-block` calendar, `startField`/`endField`/`titleField`, optional `colorField`. The data, not the block, is what makes it look good: **seed dense, realistic, conflict-free** data across the visible window (e.g. fill working days of the next 1–2 months, 2–4 events per resource/day, no same-resource overlaps if there's a double-booking rule). A sparse calendar reads as broken regardless of styling.

applyBlueprint note: calendar popups with >10 fields need every system field (`id`/`*_id`/`createdAt`…) covered in `defaults.collections.<coll>.fieldGroups`, else `missing-default-field-groups`.

## 6. Chart dashboard

Analytics page → native **Chart** blocks (data-visualization). Builder mode for single-table aggregates (dimension = field name, measure = avg/count + alias); custom raw ECharts (`visual.mode=custom`) for gauge / heatmap the builder lacks. Chart config goes in `assets.charts`; the block only references it. **alpha has no statistic/number chart type** → render big-number KPIs as a small JS block, not a 1-bar bar chart. dataScope filter format is `{path, operator, value}`.

## 7. Tree — org chart / nested categories

Native **Tree** block on a self-referencing m2o (`manager_id`, `parent_id`). Searchable, `includeDescendants`. Link to a GridCard/Table via `filterPaths` for master-detail.

## 8. FilterForm cross-block filter

A filter bar that drives another region → native **FilterForm**; wire it to the target block. Filter form field keys carry a uid suffix (`title_7dc88d482f2`) — match generically with `Object.values(getFieldsValue()).some(non-empty)`. To hide a block when a search has a value, render a `<style>[data-grid-item-uid="<uid>"]{display:none}</style>` from a JS block keyed off the form value. Don't put a top-level `ctx.resource.refresh()` inside a re-rendering container (it spams requests) — cache on `ctx.model`.

## 9. Native popup on click — the only reliable way from JS

To open NocoBase's native drawer/dialog from a JS cell or block:
```js
ctx.openView('<a real TABLE ViewActionModel uid>', {
  mode:'drawer', size:'medium', dataSourceKey:'main',
  collectionName:'<coll>', filterByTk: record.id, params:{ filterByTk: record.id },
});
```
The uid must be a **real table's ViewActionModel** (it has `hasCurrentRecord:true` and the proper resource/dataSource flow). A hand-built standalone PopupActionModel triggered from JS fails with `reading 'dataSource'` and an empty drawer. If the page has no View action, `add-record-action --use ViewActionModel` on the table first to mint one. (RunJS skill-mode flags `ctx.openView` as reference-only `RUNJS_BLOCKED_CTX_CAPABILITY`, but it is correct at runtime — record actions on the same page already use it.)

## 10. JS block — the legitimate full-custom case

Reserve a full `JSBlockModel` for visuals no native block expresses: glowing/positional maps, kiosk scanners, doughnut rings, live-refreshing feeds, gauges, big-number KPIs. Pattern for a live feed: put `setInterval` **inside a per-row React component** that only `setState`s locally — never at the top level (top-level interval re-fetches the whole resource on every tick). Data via `ctx.initResource('MultiRecordResource')` + `ctx.resource`; cross-block via `ctx.engine.getModel(uid).resource`.

## 11. Hard-visual recipes — verified combinations for the patterns that used to fail

These are the archetypes that one-pass agents historically fumbled (free-floating JS visuals). Each is now a verified combination — copy the shape, don't improvise.

| Visual | Combination (verified) | Key moves |
|---|---|---|
| **Donut / ring gauge** | List (pageSize=1, native fields removed) + JSField drawing an SVG ring / `conic-gradient` + center number + legend | aggregate inside the JSField via `ctx.api.request`, cache on `ctx.blockModel.__cache`; inject scoped CSS to hide the List pagination footer (`pageSize 1` shows "N pages" otherwise); **remove the List's default toolbar actions (Filter/Refresh/Add new)** — a visual card with a toolbar reads as "a table", which users flag |
| **KPI card strip** | one JSBlock row (full width): 4-5 cards, big colored number + trend + accent bar | pure-aggregation → freestanding JSBlock is legitimate; data via `ctx.initResource('MultiRecordResource')` (validator rejects `ctx.api.request` at JSBlock top level) |
| **Gantt — standard start/end timeline** (campaign / project schedules) | **native `GanttBlockModel` FIRST** — NocoBase ships one; bind it whenever the visual is plain date-range bars per row | confirmed user preference (2026-06-07): native component beats a hand-drawn JS gantt for this shape |
| **Time-lane board the native Gantt can't express** (rooms × hours grid) | List bound to the *row-axis* collection (rooms) + JSField rendering one time lane per row; colored bars positioned by start/end % | inject the hour-ruler header + legend **once** into the List container; per-row bookings fetched + cached per row; bar click → `ctx.openView(<ViewActionModel uid>, {filterByTk})` |
| **Rich kanban card** | native Kanban (drag preserved) + ONE JS card field (limit is 2 fields → remove natives first) | card click passes through to native `KanbanCardViewActionModel` as long as the JS body doesn't `stopPropagation` |
| **Hero search + filter pills over a grid** | JSBlock (gradient hero, debounced input, pill row) driving the grid resource | **named filter groups per control** — `addFilterGroup('hdr-search')`, `addFilterGroup('hdr-dept')`, `addFilterGroup('facet-dept')` — so search / pills / left facet never clobber each other; debounce ~280ms; state on `ctx.model.__state` to survive remount |
| **Workflow run / log console** | system collections (workflows/executions/jobs) can't bind native blocks → JSBlock with `ctx.api.request` against the workflow HTTP API | the one case where "no native container exists" genuinely holds |
| **Stage-progress / checklist card** | List + JSField, steps rendered as a horizontal segment bar inside the card | same wrapper-uncollapse CSS as §3 |

Numbers computed live from seeded data will differ from the prototype's hardcoded mock values — that is correct behavior; note it in the report instead of fudging the data.
