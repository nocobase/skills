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

## Correct patterns

- KPI area uses one `jsBlock` that renders a metric panel.
- Charts use `chart`.
- Latest records use `table` or `list`.
- Operation entry areas use `actionPanel`.
- Record card walls use `gridCard`.

## Backend repair behavior

- If a KPI / numeric summary `jsBlock` write returns a backend jsBlock authoring error, repair the reported payload shape and retry the same `jsBlock`. Do not downgrade the KPI area to `table`, `chart`, `actionPanel`, or `gridCard`.
- If a chart write returns a backend chart authoring error, repair the chart payload using the returned `details.repairHint`, `assets.charts.<key>.query`, `assets.charts.<key>.visual`, and `block.chart`. Do not switch the section to another block type to avoid the error.
- If the backend says a KPI / summary number should use `jsBlock`, keep it on `jsBlock`. Use `chart` only for trends, distributions, rankings, percentages, and other visual analysis.
- Probe pages are allowed while investigating metadata or a failing payload, but they are not final deliverables. Do not count probe pages in the final summary, and clean them up when they are under the user's delivery menu.

## Pre-write dashboard self-check

- numeric metrics / KPI cards -> `jsBlock`
- trends / distributions / rankings -> `chart`
- latest records / top-N records -> `table` or `list`
- action shortcuts -> `actionPanel`
- if a KPI area is implemented with `actionPanel`, regenerate before `applyBlueprint`
