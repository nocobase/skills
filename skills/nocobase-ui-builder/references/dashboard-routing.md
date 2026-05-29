# Dashboard Routing

Use this file when the user asks for a dashboard, overview page, summary tab, KPI section, statistics panel, or analytics home page.

## Block choice matrix

| User intent | Correct block |
| --- | --- |
| 追踪产品数 / 本周新增 / 待阅数 / KPI / 指标卡 / 数字统计 / summary numbers | `JSBlockModel` |
| 趋势 / 分布 / 排行 / 占比 | `ChartBlockModel` |
| 最新记录 / 最近动态 / top N | `table` / `list` |
| 快捷操作 / 操作入口 / shortcuts / action entry | `ActionPanelBlockModel` |
| 记录卡片墙 / 产品卡片墙 / record cards | `GridCardBlockModel` |

## Wrong patterns

- Do not implement 4 KPI cards as `actionPanel` + 4 `js` actions.
- Do not use `GridCardBlockModel` for aggregated dashboard numbers.
- Do not treat "can render something" as enough. The block must match the section semantics.
- Do not replace a requested chart / 图表 / trend / distribution / ranking section with `JSBlockModel`, `table`, `list`, `gridCard`, or `markdown`.

## Correct patterns

- KPI area uses one `jsBlock` that renders a metric panel.
- Charts use `chart`.
- Latest records use `table` or `list`.
- Operation entry areas use `actionPanel`.
- Record card walls use `gridCard`.

## Dashboard Coverage Gate

Before the first write, make a short section checklist:

- `metric_sections`: KPI / 指标卡 / 数字统计 sections that must become `jsBlock`.
- `chart_sections`: 图表 / Charts / 趋势 / 分布 / 排行 / percentage / 占比 sections that must become `chart`.
- `record_list_sections`: latest records, recent activity, top-N record lists that become `table` or `list`.
- `action_sections`: shortcuts or user operations that become `actionPanel`.

The draft is not writable until each `chart_sections` entry has a concrete chart block title and chart asset key. If the request says "4 charts", the payload must contain at least four `type: "chart"` blocks. `jsBlock` KPI panels and table/list summaries do not count toward chart coverage.

## Backend repair behavior

- If a KPI / numeric summary `jsBlock` write returns a backend jsBlock authoring error, repair the reported payload shape and retry the same `jsBlock`. Make the final retry instruction say "repair the same jsBlock"; do not downgrade the KPI area to `table`, `chart`, `actionPanel`, or `gridCard`.
- If a chart write returns a backend chart authoring error, repair the chart payload using the returned `details.repairHint`, `assets.charts.<key>.query`, `assets.charts.<key>.visual`, and `block.chart`. Do not switch the section to another block type to avoid the error.
- If the backend says a KPI / summary number should use `jsBlock`, keep it on `jsBlock`. Use `chart` only for trends, distributions, rankings, percentages, and other visual analysis.
- Probe pages are allowed while investigating metadata or a failing payload, but they are not final deliverables. Do not count probe pages in the final summary, and clean them up when they are under the user's delivery menu.

## Pre-write dashboard self-check

- numeric metrics / KPI cards -> `jsBlock`
- trends / distributions / rankings -> `chart`
- latest records / top-N records -> `table` or `list`
- action shortcuts -> `actionPanel`
- if a KPI area is implemented with `actionPanel`, regenerate before `applyBlueprint`
- if any required chart section is implemented as `jsBlock`, `table`, or `list`, regenerate before `applyBlueprint`

## Completion Evidence

For dashboards with required charts, the final summary must list chart evidence in this shape:

```text
chart blocks: <visible title> -> <assets.charts key or live chart uid>
```

If you cannot list that evidence, say the dashboard is unfinished instead of saying charts are complete.
