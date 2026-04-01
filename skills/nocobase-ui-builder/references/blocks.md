# Blocks

按用户的展示与交互目标选 block，而不是先想着底层 model use。表单类 block 单独看 [forms.md](./forms.md)，动作库存统一看 [actions.md](./actions.md)，横切 guardrail 以 [../SKILL.md](../SKILL.md) 的 `Global Rules` 为准。

规则强度：

- `Hard rule`：不能违背
- `Default heuristic`：默认偏好
- `Fallback`：前两者不适用时再用

## 默认创建策略

- `Default heuristic`：默认可创建 `table`、`details`、`list`、`gridCard`、`filterForm`、`markdown`、`iframe`、`chart`、`actionPanel`、`jsBlock`
- `Fallback`：`map`、`comments` 仅在现场 `catalog` 明确允许时才创建或小范围改配

## 先判断用户要哪种页面体验

| 用户目标 | 优先 block | 不要误选 |
| --- | --- | --- |
| 数据表格操作、批量操作、树表、固定列 | `table` | 不要为了“像列表”就默认改成 `list` |
| 单条记录只读详情 | `details` | 不要用 `editForm` 伪装详情页 |
| 轻量条目浏览、移动端友好 | `list` | 不要直接套 table 的重操作心智 |
| 卡片墙、宫格、缩略图浏览 | `gridCard` | 不要因为有分页就默认选 table |
| 筛选条件输入 | `filterForm` | 它不负责数据展示 |
| 静态说明、帮助文案 | `markdown` | 不要为简单文案启用 `jsBlock` |
| 嵌入网页 / HTML | `iframe` | 不要滥用 `markdown` |
| 趋势图 / 报表图 | `chart` | 主要配置走 `configure` |
| 工具按钮区 | `actionPanel` | 不继承 collection block action 列表 |
| 明确要求运行时代码 | `jsBlock` | 不要把通用说明内容塞进 JS |

## `table`

适用：记录浏览、筛选、排序、分页、批量操作、行内记录级操作、树表。

关键点：

- 通常需要 collection resource
- `fields` 是列；`actions` 是 block 级动作；`recordActions` 是行级动作
- 高频配置：`pageSize`、`dataScope`、`sorting`、`quickEdit`、`showRowNumbers`、`treeTable`、`density`、`dragSort`
- 常见组合：`filterForm + table`、`table + details popup`、`table + createForm popup`、`table + jsColumn`
- 读回重点：`actionsColumnUid`、字段 uid、关系字段 `clickToOpen/openView`

## `details`

适用：record popup 详情页、单记录只读查看、详情 + 记录动作。

关键点：

- `Hard rule`：必须绑定 collection resource
- `Hard rule`：动作只能走 `recordActions`
- 高频配置：`layout`、`labelAlign`、`labelWidth`、`labelWrap`、`colon`、`sorting`、`dataScope`、`linkageRules`

## `list`

适用：轻量 item 浏览、每项展示少量字段、移动端友好。

关键点：

- `fields` 是 item 展示字段；`recordActions` 是 item 级动作
- 高频配置：`pageSize`、`dataScope`、`sorting`、`layout`
- 只有明确是“轻列表 / 条目列表 / 移动端列表”时才优先它

## `gridCard`

适用：商品、成员、作品、图库等卡片浏览。

关键点：

- `fields` 是 card 内展示字段；`recordActions` 是单个 card 的记录动作
- 高频配置：`columns`、`rowCount`、`dataScope`、`sorting`、`layout`
- 用户明确说“卡片墙 / 宫格卡片 / 缩略图卡片列表”时优先它

## `filterForm`

适用：筛选条件输入；默认筛选目标是 `table/details/list/gridCard`。

关键点：

- `Hard rule`：`filterForm` 自己是 block，字段是筛选项而不是展示字段
- `Hard rule`：多目标时必须显式绑定当前 contract 暴露的 target 字段，优先 `defaultTargetUid`
- `Fallback`：`chart` 只有现场确认可解析 target resource 时，才作为筛选目标

## 简单 / 静态 / 保守能力

- `markdown`：静态说明、操作指南、页面文案
- `iframe`：嵌入外部 URL 或 HTML 内容
- `chart`：趋势图、统计图、报表图；主要配置走 `configure`
- `actionPanel`：页面顶部工具按钮区；动作 scope 是 `actionPanel`
- `map`：默认保守维护，仅在现场 `catalog` 允许时小范围改配或创建
- `comments`：默认保守维护，仅在现场 `catalog` 允许时小范围改配或创建

## `jsBlock`

适用：公开 block 无法满足、且用户明确要求自定义运行时代码时。

关键点：

- `Hard rule`：不需要 collection resource
- 高频配置：`title`、`description`、`className`、`code`、`version`
- `Hard rule`：创建后要读回确认相关 JS 配置已落盘
- `Fallback`：需要数据访问时，不要自动假设 collection 资源会被推导出来
