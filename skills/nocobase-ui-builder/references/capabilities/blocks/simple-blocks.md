# Simple Blocks

这份文档汇总信息增量较小、但在发布版里仍然常见的 block。默认可创建 / 保守维护策略统一看 [../../runtime-truth/capability-matrix.md](../../runtime-truth/capability-matrix.md)。

## `markdown`

- 用途：静态说明、操作指南、页面文案
- 不需要 collection resource
- 高频配置：`content`、`title`、`displayTitle`
- 关键约束：默认用它表达静态文本，不要为了简单文案启用 `jsBlock`

## `iframe`

- 用途：嵌入外部 URL 或 HTML 内容
- 不需要 collection resource
- 高频配置：`mode`、`url`、`html`、`params`、`allow`、`htmlId`、`height`
- 关键约束：如果用户要嵌网页，优先它，不要滥用 `markdown`

## `chart`

- 用途：趋势图、统计图、报表看板中的单块图表
- 不要求像 table 那样显式绑定 collection resource，但通常应给出明确的图表意图、查询来源或配置骨架
- 高频配置：`configure`、`title`、`displayTitle`、`height`
- 关键约束：主要配置走 `configure`；`filterForm` 不是它的默认搭档，只有现场读回确认 chart 带可解析 target resource 时才作为筛选目标

## `actionPanel`

- 用途：页面顶部工具栏、工作台按钮区、触发工作流和自定义 JS 的操作面板
- 不需要 collection resource
- 高频配置：`layout`、`ellipsis`、`title`、`displayTitle`
- 高频动作：`js`、`triggerWorkflow`
- 关键约束：它的 action scope 是 `actionPanel`，不是 collection block；不要把 `addNew`、`refresh` 这类 collection actions 直接套到 `actionPanel`

## `map`

- 默认策略：保守维护
- 用途：维护已有 map surface、读取已有地图区块配置、在现场 `catalog` 允许时做小范围改配
- 高频关注点：`mapField`、`marker`、`dataScope`、`lineSort`、`zoom`
- 关键约束：默认不在 `compose` 或 `addBlock` 的 happy path 中创建；只有用户明确要求且现场 `catalog` 暴露创建能力时才继续

## `comments`

- 默认策略：保守维护
- 用途：维护已有 comments surface、读取已有评论区块配置、在现场 `catalog` 允许时做小范围改配
- 高频关注点：`pageSize`、`dataScope`
- 关键约束：默认不在 `compose` 或 `addBlock` 的 happy path 中创建；只有用户明确要求且现场 `catalog` 暴露创建能力时才继续
