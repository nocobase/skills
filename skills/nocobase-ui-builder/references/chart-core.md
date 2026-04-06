# Chart block

chart 任务先读 [chart.md](./chart.md)。当你已经进入 chart 专题，且当前要处理运行期搭建、重配、readback 或 legacy fallback 时，再读本文。目标不是暴露全部前端内部细节，而是用最少参数稳定生成**能渲染出来**的图表，并保留少量 escape hatch 覆盖复杂场景。

如果你要核对复杂 contract、负例或回归矩阵，请继续看 [chart-validation.md](./chart-validation.md)；本文只保留运行期主链路。

## 目录

1. 公开 DSL
2. 默认策略
3. 推荐执行顺序
4. 区块外层参数（最小暴露集）
5. 最小可用配方
6. query 规则
7. visual 规则
8. events 规则
9. flowSurfaces:context 的用法
10. 区块外层参数规则
11. JS 上下文提醒
12. readback
13. 边界提醒
14. 当前 skill 限制
15. 什么时候回退 legacy `configure`

## 公开 DSL

`flowSurfaces.configure(...).changes` / `compose(...).blocks[].settings` 对 chart 默认使用这 3 组语义：

```json
{
  "query": { "...": "..." },
  "visual": { "...": "..." },
  "events": { "...": "..." }
}
```

仍然保留 `configure` 作为 legacy fallback，但**不要**把 `configure` 与 `query / visual / events` 混用。服务端会把 legacy `configure` 先走同一套 chart contract 规范化，例如 builder query 会统一落盘为 `query.collectionPath`，而不是保留 `query.resource`。

除此之外，chart block 只额外暴露 4 个区块外层参数：

- `title`
- `displayTitle`
- `height`
- `heightMode`

目标是先把“卡片能显示 + 图能渲染”这两层稳定下来；不要暴露前端内部 `props / decoratorProps / stepParams` 细节给用户。

chart 也是通用 public-settings 模式的一个先例：创建或重配时，优先传 `query / visual / events / title / displayTitle / height / heightMode` 这类公开语义，不要把读回出来的内部 `props / decoratorProps / stepParams` 反向当成输入模板。

## 默认策略

1. 默认先走 `query.mode = "builder"`。
2. 默认先走 `visual.mode = "basic"`。
3. **重配已有 chart** 时，默认优先命中 `flowSurfaces:context(path="chart")` 返回的 `safeDefaults`；**新建 chart** 时，先建 block 并先写 `query`，再读取 `path="chart"`。
4. 如果命中 `riskyPatterns`，不要直接禁止；可以继续写，但要在结果里标记风险，并补 `readback`。
5. 如果命中 `unsupportedPatterns`，不要继续臆造 payload；应改写成安全子集，或明确告诉用户当前 contract 不支持。
6. 只有以下情况才升级：
   - 查询真的必须用 SQL → `query.mode = "sql"`
   - 基础图表类型和映射不够 → `visual.mode = "custom"`
   - 需要点击、缩放、联动 → `events.raw`

## 推荐执行顺序

chart block 最稳的执行顺序不是一次性盲写，而是：

1. `addBlock(type="chart", settings={ title?, displayTitle?, height?, heightMode? })`
2. 如果要配 builder query，先读 `flowSurfaces:context(path="collection")` 选字段
3. 先 `configure(changes={ query, title?, displayTitle?, height?, heightMode? })`
4. 再读 `flowSurfaces:context(path="chart")`
5. 基于 `chart.queryOutputs / aliases / supportedMappings / supportedStyles / safeDefaults / riskyPatterns / unsupportedPatterns` 再 `configure(changes={ visual, events? })`
6. `get(uid)` 做 canonical readback
7. 命中 risky pattern 时，在结果里明确说明这是 risky path，并以 readback 为准确认落盘

如果是在**重配已有 chart**，可以跳过上面的建 block 步骤，直接从“读 `path="chart"` / 清理旧 query 状态 / 重配 visual”继续；并且如果你希望清空旧的 builder 状态（尤其是 `sorting` / `filter` 这类可残留字段），不要只靠“省略该字段”来赌服务端会自动清空；请显式传空值，例如：

- `sorting: []`
- `filter: { "logic": "$and", "items": [] }`

这是为了避免旧 query 残留把新配置污染脏，影响后续运行态表现。

只有在兼容旧配置时才使用 `changes.configure`。一旦使用 `configure`：

- 不要再同时传 `query / visual / events`
- 传入的 `configure` 必须是**完整且合法**的 chart config；不要再指望服务端接受半残配置

## 区块外层参数（最小暴露集）

除了 `query / visual / events / configure`，chart block 对 skill 只建议再暴露 4 个外层参数：

- `title?: string`
- `displayTitle?: boolean`
- `height?: number`
- `heightMode?: "defaultHeight" | "specifyValue" | "fullHeight"`

说明：

- `heightMode` 对外只宣传真实前端枚举：
  - `defaultHeight`
  - `specifyValue`
  - `fullHeight`
- 为兼容旧 skill / 历史 payload，服务端仍会接受 `fixed`，并自动规范化为 `specifyValue`
- 如果 `heightMode = "specifyValue"`，推荐再同时传 `height`
- `heightMode = "defaultHeight" | "fullHeight"` 时，通常不要再传 `height`
- 当前 public contract 的**主判据**是 `stepParams.cardSettings`（例如 `titleDescription` / `blockHeight`）。
- `decoratorProps` 可能作为 legacy / UI 层镜像出现，但**不是** chart 成功落盘的必检项。
- skill 文档与 readback 不再要求“必须看到 decoratorProps 才算成功”；chart runtime 是否真正生效，以 `cardSettings` 为准。

不合法：

- `heightMode = "fixed"` 作为文档主写法
- `heightMode` 传任意未知字符串

补充：

- 当前服务端会严格校验 `heightMode` 的枚举值，但**不会单独因为缺少 `height` 就拒绝** `heightMode = "specifyValue"`。
- skill 仍应把“`specifyValue` 搭配 `height`”当成推荐写法；这样前端表现最稳定。

## 最小可用配方

最稳妥的最小 chart 配法：

```json
{
  "query": {
    "mode": "builder",
    "resource": {
      "dataSourceKey": "main",
      "collectionName": "employees"
    },
    "measures": [
      {
        "field": "id",
        "aggregation": "count",
        "alias": "employeeCount"
      }
    ],
    "dimensions": [
      {
        "field": "department.title"
      }
    ]
  },
  "visual": {
    "mode": "basic",
    "type": "bar",
    "mappings": {
      "x": "department.title",
      "y": "employeeCount"
    }
  }
}
```

skill 选默认值时，优先套这个 safe 子集：

- builder query
- single measure
- basic visual
- 明确 mappings
- 首轮不生成 sorting

## query 规则

### builder

合法：

- `mode = "builder"`
- `resource.collectionName` 必填；`dataSourceKey` 省略时默认 `main`
- skill 对外只写 `resource`；后端会 canonicalize 到内部 `query.collectionPath`
- `measures` 必须是非空数组
- `measures[].field` 必填
- `aggregation` 仅支持 `sum | count | avg | max | min`
- `dimensions` 可选
- `filter` 可选，结构应为 FilterGroup
- `sorting` 可选；为了首轮成功率，skill 默认**不要主动生成排序**，除非用户明确要求
- 如果需要清空已有排序，必须显式传 `sorting: []`，不要只靠省略字段
- builder 排序目前只应作为高级路径使用
- 当前 runtime / FlowSurfaces contract 会拒绝：
  - 聚合 measure 输出排序
  - 自定义 measure alias 排序
- 因此 skill 默认不要生成这类排序；命中时应视为 `unsupportedPatterns.builder_measure_sorting`
- `context(path="chart").chart.aliases` 只能安全用于 `visual.mappings.*`
- 不要因为某个 alias 出现在 `chart.aliases` 里，就推断它也能用于 `query.sorting.field`
- `limit` 必须是大于等于 0 的整数；`offset` 必须是大于等于 0 的整数
- 外部 DSL 统一写 `sorting[].direction = "asc" | "desc"`
- 不要自己写内部落盘结构 `query.orders[].order`；这是后端兼容层负责转换的

不合法：

- `resource` 缺失
- 同时写 `resource` 和 `collectionPath`
- `measures` 为空
- `field` 为空字符串
- 聚合排序引用了未选字段
- 聚合排序在自定义 `alias` 后仍使用原始字段名（例如 `sum(amount) as totalAmount` 还写 `sorting.field = "amount"`）
- `filter.items[].path` 为空字符串
- `visual.mappings.*` 引用了 query 没有输出的字段 / alias

### sql

合法：

- `mode = "sql"`
- `sql` 必填
- `sqlDatasource` 可选
- SQL 会额外持久化到 `flowSql`；判断是否真正保存成功，不能只看 stepParams
- SQL 只应写单条只读 `SELECT` / `WITH`
- `configure(query)` 后，优先立刻读一次 `flowSurfaces:context(path="chart")`
- 如果 SQL 没有 runtime 模板变量，`chart.queryOutputs` 现在会优先通过 SQL preview metadata 推断，即使当前数据集为空也尽量返回输出列
- 如果 SQL 含模板变量 / `ctx` / liquid bind，preview 可能无法提前推断，这时会落到 `riskyPatterns`
- 如果 `chart.queryOutputs` 缺失，FlowSurfaces 现在会拒绝 `visual.mode = "basic"` 的写入；skill 只能先写 `query`，再用 `context(path="chart") + readback` 收口
- SQL alias 要以 `chart.queryOutputs` 为准，不要直接假设自己写在 SQL 里的大小写会原样保留
- PostgreSQL 等方言会把**未加引号**的 alias 折叠成小写；如果需要 `employeeCount` 这类大小写敏感 alias，请写成 `AS \"employeeCount\"`，否则优先使用全小写 alias

不合法：

- 同时再传 `resource / measures / dimensions / filter / sorting / limit / offset`
- 空 SQL、多语句、明显写操作 SQL
- preview 后没有任何输出列的 SQL
- SQL preview 没有任何输出列

## visual 规则

### basic

`type` 只支持：

- `line`
- `area`
- `bar`
- `barHorizontal`
- `pie`
- `doughnut`
- `funnel`
- `scatter`

`mappings` 只暴露：

- `x`
- `y`
- `category`
- `value`
- `series`
- `size`

### type 与 mappings 的关系

| type | 必填 mappings | 可选 mappings |
| --- | --- | --- |
| `line` / `area` / `bar` / `barHorizontal` | `x`, `y` | `series` |
| `scatter` | `x`, `y` | `series`, `size` |
| `pie` / `doughnut` / `funnel` | `category`, `value` | 无 |

`visual.mappings.*` 应该优先引用：

1. `flowSurfaces:context(path="chart")` 返回的 `chart.queryOutputs`
2. builder query 中显式声明的 alias
3. 如果某个 dimension 没有 alias，则可直接引用它的字段路径输出，例如 `department.title`

`style` 只暴露高频参数：

- 通用：`legend`, `tooltip`, `label`
- 笛卡尔系：`boundaryGap`, `xAxisLabelRotate`, `yAxisSplitLine`
- 折线 / 面积：`smooth`
- 柱状 / 横向柱状 / 面积：`stack`
- 饼图 / 环图：`radiusInner`, `radiusOuter`, `labelType`
- 漏斗：`sort`, `minSize`, `maxSize`

优先从 `context(path="chart")` 读 `chart.supportedStyles`，而不是在 skill 里硬编码 style 合法性。当前服务端已经会返回每个 `visual.type` 下：

- 允许的 style key
- 每个 key 的值类型
- 可选枚举值，例如 `labelType`、`sort`
- 数值范围，例如 `xAxisLabelRotate`、`radiusInner/radiusOuter`、`minSize/maxSize`

skill 应把 `supportedStyles` 当成 visual style 的第一真相源，文档只作为解释性补充。

不合法：

- `basic` 模式下传 `raw`
- 为当前 `type` 传不支持的 `style` 键
- `radiusOuter < radiusInner`
- `maxSize < minSize`

### custom

合法：

- `mode = "custom"`
- `raw` 必填，代码需要 `return` 一个 ECharts option object

不合法：

- `custom` 模式下再传 `type / mappings / style`

## events 规则

合法：

- 只暴露 `events.raw`
- `raw` 是 JS 代码
- 可访问 `chart` 实例

典型用途：

- click / dblclick
- dataZoom
- 打开 popup / openView
- 轻量联动

## flowSurfaces:context 的用法

chart 现在建议按场景读取 `context`，而不是在所有场景一上来都读同一组数据：

```json
{
  "target": { "uid": "<chart-uid>" },
  "path": "chart",
  "maxDepth": 4
}
```

```json
{
  "target": { "uid": "<chart-uid>" },
  "path": "collection",
  "maxDepth": 3
}
```

关键点：

- **新建 chart** 时，`path = "chart"` 只有在 chart block 已存在、并且至少已经写入过一次 `query` 后才值得读取；否则很容易拿不到稳定的 `queryOutputs` / `supportedMappings`。
- **重配已有 chart** 时，可以直接先读 `path = "chart"`，再按现有 `queryOutputs / safeDefaults / riskyPatterns` 收敛改配。
- `path = "chart"` 会返回：
  - `chart.queryOutputs`
  - `chart.aliases`
  - `chart.supportedMappings`
  - `chart.supportedVisualTypes`
  - `chart.safeDefaults`
  - `chart.riskyPatterns`
  - `chart.unsupportedPatterns`
- `chart.aliases` 只应理解为**显式声明过的 alias 名**；如果某个 dimension 没有 alias，优先从 `chart.queryOutputs` 里取可用输出名
- builder chart 会暴露 `collection`
- 可用它收敛：
  - `query.filter` 里的字段
  - `query.dimensions / measures / sorting` 里应该引用的字段
  - `visual.raw` / `events.raw` 中可安全访问的 collection 字段
- `visual.mappings.*` 不应直接从 `collection` 猜，应该优先从 `chart.queryOutputs` / `chart.aliases` 选
- SQL chart 不暴露 `collection`
- SQL chart 仍然会暴露 `chart.supportedMappings` / `chart.supportedVisualTypes`
- SQL chart 如果没有拿到 `queryOutputs`，先检查 `riskyPatterns` 是否提示了 runtime context / preview unavailable；不要在没有输出列依据时盲写 `visual.mappings`
- builder chart 可以被当成 filter-form target
- SQL chart 不能直接被当成 filter-form target；如果已有绑定，切到 SQL 后应视为失效，并通过 readback 确认

## 区块外层参数规则

### `title`

- 合法：非空字符串
- 不合法：空字符串、对象、数组

### `displayTitle`

- 合法：`true | false`
- 不合法：字符串 `"true"` / `"false"`

### `height`

- 合法：数字，通常与 `heightMode = "specifyValue"` 配合
- 不合法：非数字

### `heightMode`

- 合法：`defaultHeight | specifyValue | fullHeight`
- 兼容：legacy 值 `fixed` 仍会被后端接受，但会被规范化成 `specifyValue`
- skill 文档与示例中**不要再主动写 `fixed`**

## JS 上下文提醒

这里要区分两类上下文：

1. **FlowSurfaces stable context**
   - 这是 `flowSurfaces:context` 稳定暴露给 skill 的字段
   - 对 chart 来说，当前稳定可依赖的是：
     - `collection`
     - `chart.queryOutputs`
     - `chart.aliases`
     - `chart.supportedMappings`
     - `chart.supportedVisualTypes`
     - `chart.safeDefaults`
     - `chart.riskyPatterns`
     - `chart.unsupportedPatterns`
2. **frontend runtime assumptions**
   - 这是前端 `ChartBlockModel` / `ChartOptionModel` / `ChartEventsModel` 在运行时通常可访问的变量
   - 它们适合拿来写 `visual.raw` / `events.raw`
   - 不要把它们误当成 `flowSurfaces:context` 一定会返回的字段

### `visual.raw`

建议先用 `ChartOptionModel + validate` 做本地 compat 检查。

前端 runtime 里，优先假设可用：

- `ctx.data.objects`
- `ctx.collection`
- `ctx.record`
- `ctx.popup.record`

规则：

- 直接 `return` ECharts option object
- 不需要 `ctx.render(...)`
- `ctx.data` 视为运行时数据集，允许访问数组项与字段

### `events.raw`

建议先用 `ChartEventsModel + validate` 做本地 compat 检查。

前端 runtime 里，优先假设可用：

- `chart`
- `ctx.openView`
- `ctx.record`
- `ctx.popup.record`

规则：

- `chart` 实例通过 top-level alias 暴露；主要做裸 `chart.on(...)` / `chart.off(...)`
- 不要写成 `ctx.chart.on(...)` / `ctx.chart.off(...)`
- 不需要 `ctx.render(...)`
- runtime 会把 `ctx.openView(...)` 当作 simulated call，而不是实际打开弹窗

## readback

写入后最小必要读回：

- `tree.stepParams.cardSettings.titleDescription.title`（当 `displayTitle !== false` 且 title 非空时）
- `tree.stepParams.cardSettings.blockHeight.heightMode`
- `tree.stepParams.cardSettings.blockHeight.height`（当 `heightMode = "specifyValue"` 时）
- 如果 `displayTitle = false`，预期 `tree.stepParams.cardSettings.titleDescription` 不存在
- `tree.decoratorProps.*` 若存在，只作为辅助镜像；不存在不应单独判失败
- 不要把 `tree.props.title / displayTitle / height / heightMode` 当成 chart 卡片成功落盘的唯一依据；chart runtime 是否生效优先看 `cardSettings`
- `tree.stepParams.chartSettings.configure.query`
- `tree.stepParams.chartSettings.configure.chart.option`
- `tree.stepParams.chartSettings.configure.chart.events`
- 如果 public DSL 用的是 `resource` / `sorting.direction`，readback 时预期看到的是内部 canonical 结构：
  - `query.collectionPath`
  - `query.orders[].order`
- 如果是 SQL chart，再额外确认它已稳定持久化到 `flowSql`
- 不要只根据 `tree.stepParams.chartSettings.configure.query.sql` 判断成功

skill 侧应以**内部 readback 结构**为准确认落盘，而不是假设公开 DSL 会原样持久化。

## 边界提醒

- 真实浏览器验证不属于本 skill 的默认职责；本文只覆盖 FlowSurfaces contract、上下文收敛与 readback。

## 当前 skill 限制

- `visual.raw` / `events.raw` 不要套用普通 `jsBlock` / `js action` model；应分别使用 `ChartOptionModel` / `ChartEventsModel`。
- 这两类代码仍然优先使用保守模板，必要时先调用 `flowSurfaces:context` 收敛上下文，再写入，再做 readback。
- 如果用户只想“先出图”，一律优先 `builder + basic`，不要一上来走 custom JS。
- 如果用户要切换 chart collection，优先在同一次写入里同时给出：
  - 新 `query`
  - 新 `visual.mappings`
  这样成功率最高
- SQL chart 默认分两步写：
  - 先写 `query`
  - 再读 `context(path="chart")`
  - 再按 `chart.queryOutputs` 写 `visual`
- 如果 `chart.queryOutputs` 缺失且 `riskyPatterns` 提示 runtime context / preview unavailable，不要伪造 mappings；服务端会拒绝 basic visual，因此只能保留 query，除非用户明确改走 `visual.mode = "custom"` 并接受 risky path

## 什么时候回退 legacy `configure`

只在以下场景回退：

1. 需要兼容已有内部配置
2. `visual.raw` / `events.raw` 之外仍不够表达
3. 明确知道要写前端内部结构

否则优先使用 `query / visual / events`。
