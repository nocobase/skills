# NocoBase JS widget library — agent reference

Synced from `@albert/plugin-flow-template-library` (57 templates). Each entry is one working JS block/item/column body + its `$p` input contract. To use: pick by purpose below, open `<key>.md`, fill `$p` for the target collection/fields, then write `const $p = {…}\n` + body into the model `stepParams.jsSettings.runJs.code` via `flowModels:save`.

> **Unique key** = filename = template `key` in the plugin; re-sync overwrites in place.


## Action

| key | widget | kind/scope | purpose |
|---|---|---|---|
| [`autoRefresh`](autoRefresh.md) | Auto-refresh toggle | action/collection | A switch that periodically refreshes a table block |
| [`copyFromField`](copyFromField.md) | Copy field value | item/record | One-way mirror: copy a source field into a target field on change |
| [`exportCsv`](exportCsv.md) | Export CSV | action/collection | Export selected rows (or all current rows) to a CSV file |
| [`formAutoFill`](formAutoFill.md) | Auto-fill from lookup | item/record | When a field changes, look up a record and fill sibling fields |
| [`formToggleBlocks`](formToggleBlocks.md) | Show / hide block by value | item/collection | Watch a form field and hide or show another block |
| [`rowOpenRelated`](rowOpenRelated.md) | Open related | action/record | A row button that opens a drawer listing related records |
| [`rowPrint`](rowPrint.md) | Print row | action/record | A row button that prints the current record |

## Custom

| key | widget | kind/scope | purpose |
|---|---|---|---|
| [`jsFree`](jsFree.md) | Custom JS | block/any | Free-form JavaScript — starts from a working skeleton |
| [`sqlBlock`](sqlBlock.md) | SQL block | block/any | Write SQL, render the result as a table or a single value |

## Data

| key | widget | kind/scope | purpose |
|---|---|---|---|
| [`card`](card.md) | Card list | block/collection | A card grid built from a collection’s fields |
| [`comboText`](comboText.md) | Multi-field text | column/record | Combine several fields in one cell — title/subtitle, inline, badge or accent |
| [`commentFeed`](commentFeed.md) | Comment feed | block/record | Avatar + bubble feed of related records (or latest of a collection) |
| [`dueSoon`](dueSoon.md) | Due soon | block/collection | Records whose date falls within the next N days |
| [`formConcat`](formConcat.md) | Concat preview | item/record | Live preview of several fields joined together (e.g. full name) |
| [`recentList`](recentList.md) | Recent records feed | block/collection | Most recent N records as list / timeline / cards / compact |
| [`recordSummary`](recordSummary.md) | Record summary | block/record | Show the current record’s fields as a key/value card (popup / form) |
| [`relatedList`](relatedList.md) | Related list | block/record | List records of one of this record’s relations (popup / form) |
| [`timelineFeed`](timelineFeed.md) | Activity timeline | block/record | Icon-dot timeline of related records (or latest of a collection) |

## Filter

| key | widget | kind/scope | purpose |
|---|---|---|---|
| [`clickDistribution`](clickDistribution.md) | Click-to-filter distribution | block/collection | Value counts as bars / pills — clicking filters target blocks ($in multi-select) |
| [`conditionCards`](conditionCards.md) | Condition stat cards | block/collection | One card per condition set with a live record count — click to filter target blo |
| [`conditionMenu`](conditionMenu.md) | Condition side menu | block/collection | A vertical menu of condition sets with count badges — click to filter target blo |
| [`customFilter`](customFilter.md) | Custom filter group | item/collection | Pills / buttons / segmented / tabs / chips / dropdown — each option a condition  |
| [`dateRangeFilter`](dateRangeFilter.md) | Date quick filter | block/collection | Today / 7 days / 30 days / This month pills filtering target blocks by a date fi |
| [`facetFilter`](facetFilter.md) | Facet checkbox filter | block/collection | Sidebar checkbox groups (multi-select per field, live counts) filtering target b |
| [`formDrivenFilter`](formDrivenFilter.md) | Form value → filter block | item/collection | Form input live-filters a target block (search-box pattern) |
| [`linkedList`](linkedList.md) | Linked master list | block/collection | Click a row → target blocks filter to that record (master / detail) |
| [`pillFilter`](pillFilter.md) | Button filter group | action/collection | Pill buttons from a field’s options that filter the table |
| [`quickFilter`](quickFilter.md) | Quick filter | action/collection | A dropdown in the toolbar that filters the table by a field’s options |
| [`searchFilter`](searchFilter.md) | Search box | block/collection | A standalone search box — keyword $or-matches chosen fields of target blocks |
| [`segmentedFilter`](segmentedFilter.md) | Segmented filter | block/collection | A segmented single-select (All / options) filtering target blocks |
| [`treeFilter`](treeFilter.md) | Tree filter | block/collection | A side tree of a field’s options that filters a target block |

## Stats

| key | widget | kind/scope | purpose |
|---|---|---|---|
| [`calendarHeatmap`](calendarHeatmap.md) | Calendar heatmap | block/collection | GitHub-style daily activity grid from a date field |
| [`distribution`](distribution.md) | Distribution bars | block/collection | Group records by a field and show bars / pills / columns / donut (top N) |
| [`donutChart`](donutChart.md) | Donut chart | block/collection | Share-of-total donut with legend, colored by the field’s options |
| [`formCalc`](formCalc.md) | Form calculator | item/record | Live sum/product of other form fields |
| [`formSubtotal`](formSubtotal.md) | Sub-table total | item/collection | Sum / avg / count a sub-table column live — show it or write it back to a field |
| [`funnelStages`](funnelStages.md) | Sales funnel | block/collection | Stage funnel with counts and step conversion rates |
| [`kpiStat`](kpiStat.md) | KPI stat card | block/collection | A big-number card — aggregate / SQL / JS value, 10 styles |
| [`leaderboard`](leaderboard.md) | Leaderboard | block/collection | Top N records by a numeric field: list / podium / bars / medal cards |
| [`matrixHeatmap`](matrixHeatmap.md) | Matrix heatmap | block/collection | Row × column matrix with color-graded cells (count or average) |
| [`pivotTable`](pivotTable.md) | Pivot table | block/collection | Cross-tab aggregation: rows × columns with count / sum / avg cells, totals and h |
| [`progressGoal`](progressGoal.md) | Progress toward goal | block/collection | Progress vs a target: bar / ring / gauge / segments |
| [`quadrantScatter`](quadrantScatter.md) | Quadrant matrix | block/collection | Two number fields scattered into four quadrants (median split) — prioritization  |
| [`relatedCount`](relatedCount.md) | Related count | block/record | A big number — count of related records for this record (popup / form) |
| [`tagCloud`](tagCloud.md) | Tag cloud | block/collection | A field’s values sized by frequency — cloud / pills / bubbles |
| [`trendKpi`](trendKpi.md) | Trend KPI (vs last period) | block/collection | Current vs previous period with delta % and a sparkline — day / week / month ove |

## Style

| key | widget | kind/scope | purpose |
|---|---|---|---|
| [`avatarText`](avatarText.md) | Avatar + text | column/record | A colored initial avatar with the value — left, stacked, initials box or chip |
| [`charCounter`](charCounter.md) | Character counter | item/record | Live remaining-characters counter for a text field |
| [`heroBanner`](heroBanner.md) | Gradient banner | block/any | A gradient hero banner with title, subtitle and optional live count |
| [`highlightNumber`](highlightNumber.md) | Threshold highlight | column/record | Color a number good/bad against a threshold — plain, badge, mini-bar or trend ar |
| [`noticeBanner`](noticeBanner.md) | Notice banner | block/any | A static styled callout — alert / outline / left-accent / icon tile |
| [`phonePreview`](phonePreview.md) | Phone post preview | block/record | Device-frame social post preview — live in forms, record-bound elsewhere |
| [`progressBar`](progressBar.md) | Progress bar | column/record | Render a numeric field as a small bar, ring, stripes or labeled bar |
| [`ratingDots`](ratingDots.md) | Rating | column/record | Render a 0..N number as a readonly rating — stars, dots, bar or number |
| [`relativeTime`](relativeTime.md) | Relative time | column/record | “3 hours ago” style time, full timestamp on hover — text, badge, dot or icon |
| [`statusSteps`](statusSteps.md) | Status steps | block/record | Show a record’s status as a step progress bar |
| [`ticker`](ticker.md) | News ticker | block/collection | Latest records scrolling like a stock ticker — marquee / vertical roll |
