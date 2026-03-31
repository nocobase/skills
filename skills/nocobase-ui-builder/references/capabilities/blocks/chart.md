# Chart Block

`chart` 用于图表展示。

## 适用场景

- 趋势图
- 统计图
- 报表看板中的单块图表

## 必备输入

- 不要求像 table 那样显式绑定 collection resource。
- 但通常应给出至少一个明确的图表意图、查询来源或配置骨架。

## 高频配置

- `configure`
- `title`
- `displayTitle`
- `height`

## 关键约束

- 图表主要配置走 `configure`，不是一堆零散 props。
- 如果用户只说“来个图表”但没有任何业务意图，先收敛图表目标；不要凭空猜复杂 chart option。
- `filterForm` 不是它的默认搭档；只有现场读回确认当前 chart 带可解析 target resource 时，才把它当筛选目标。
