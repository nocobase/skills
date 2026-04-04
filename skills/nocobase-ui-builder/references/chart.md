# Chart block

当用户要搭建或修改 `chart` 区块时，优先读本文。目标不是暴露全部前端内部细节，而是用最少参数稳定生成**能渲染出来**的图表，并保留少量 escape hatch 覆盖复杂场景。

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

## 默认策略

1. 默认先走 `query.mode = "builder"`。
2. 默认先走 `visual.mode = "basic"`。
3. 只有以下情况才升级：
   - 查询真的必须用 SQL → `query.mode = "sql"`
   - 基础图表类型和映射不够 → `visual.mode = "custom"`
   - 需要点击、缩放、联动 → `events.raw`

## 推荐执行顺序

chart block 最稳的执行顺序不是一次性盲写，而是：

1. `addBlock(type="chart")`
2. `flowSurfaces:context(path="chart")`
3. 如果是 builder query，再读 `flowSurfaces:context(path="collection")`
4. `configure(changes={ query, visual, events?, title?, displayTitle?, height?, heightMode? })`
5. `get(uid)` 做 canonical readback

如果是在**重配已有 chart**，并且你希望清空旧的 builder 状态（尤其是 `sorting` / `filter` 这类可残留字段），不要只靠“省略该字段”来赌服务端会自动清空；请显式传空值，例如：

- `sorting: []`
- `filter: { "logic": "$and", "items": [] }`

这是为了避免旧 query 残留把新配置污染脏，影响 reload 后的真实渲染。

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
- 这些外层参数最终会由 FlowSurfaces 同步到两层：

- 读回层：`decoratorProps`
- runtime 生效层：`stepParams.cardSettings`（例如 `titleDescription` / `blockHeight`）

不要只检查 `decoratorProps`，还要检查 `cardSettings` 是否已镜像；这是 title / height 在真实 runtime 生效的关键。

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
- 当 measure 中出现聚合时，排序字段只能引用已选维度 / 度量字段
- 如果聚合度量声明了 `alias`，排序字段在 FlowSurfaces / 后端 canonical contract 中应引用该 `alias`，不要再用原始字段名
- 但当前前端 runtime 对“聚合 alias 排序”的兼容仍然偏严格；在浏览器验证链路里，这类 case 要单独验证，不要把它当成默认安全路径
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

不合法：

- 同时再传 `resource / measures / dimensions / filter / sorting / limit / offset`

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

chart 现在建议在搭建前先读两次：

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

- `path = "chart"` 会返回：
  - `chart.queryOutputs`
  - `chart.aliases`
  - `chart.supportedMappings`
  - `chart.supportedVisualTypes`
- `chart.aliases` 只应理解为**显式声明过的 alias 名**；如果某个 dimension 没有 alias，优先从 `chart.queryOutputs` 里取可用输出名
- builder chart 会暴露 `collection`
- 可用它收敛：
  - `query.filter` 里的字段
  - `query.dimensions / measures / sorting` 里应该引用的字段
  - `visual.raw` / `events.raw` 中可安全访问的 collection 字段
- `visual.mappings.*` 不应直接从 `collection` 猜，应该优先从 `chart.queryOutputs` / `chart.aliases` 选
- SQL chart 不暴露 `collection`
- SQL chart 仍然会暴露 `chart.supportedMappings` / `chart.supportedVisualTypes`
- 只有 builder chart 才能被当成 filter-form target

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
2. **frontend runtime assumptions**
   - 这是前端 `ChartBlockModel` / `ChartOptionModel` / `ChartEventsModel` 在运行时通常可访问的变量
   - 它们适合拿来写 `visual.raw` / `events.raw`
   - 不要把它们误当成 `flowSurfaces:context` 一定会返回的字段

### `visual.raw`

建议先用 `ChartOptionModel + preview` 做本地 compat 检查。

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

- 主要做 `ctx.chart.on(...)` / `ctx.chart.off(...)`
- 实际写入前端时，优先按真实运行时写裸 `chart.on(...)` / `chart.off(...)`
- 不需要 `ctx.render(...)`
- runtime 会把 `ctx.openView(...)` 当作 simulated call，而不是实际打开弹窗

## readback

写入后最小必要读回：

- `tree.decoratorProps.title`
- `tree.decoratorProps.displayTitle`
- `tree.decoratorProps.height`
- `tree.decoratorProps.heightMode`
- `tree.stepParams.cardSettings.titleDescription.title`（当 `displayTitle !== false` 且 title 非空时）
- `tree.stepParams.cardSettings.blockHeight.heightMode`
- `tree.stepParams.cardSettings.blockHeight.height`（当 `heightMode = "specifyValue"` 时）
- 如果 `displayTitle = false`，预期 `tree.stepParams.cardSettings.titleDescription` 不存在
- 不要把 `tree.props.title / displayTitle / height / heightMode` 当成 chart 卡片成功落盘的唯一依据；chart runtime 是否生效要同时看 `decoratorProps + cardSettings`
- `tree.stepParams.chartSettings.configure.query`
- `tree.stepParams.chartSettings.configure.chart.option`
- `tree.stepParams.chartSettings.configure.chart.events`
- 如果 public DSL 用的是 `resource` / `sorting.direction`，readback 时预期看到的是内部 canonical 结构：
  - `query.collectionPath`
  - `query.orders[].order`
- 如果是 SQL chart，再额外确认它可 reload：
  - 需要验证后端已经把 SQL 持久化到 `flowSql`
  - 不要只根据 `tree.stepParams.chartSettings.configure.query.sql` 判断成功

skill 侧应以**内部 readback 结构**为准确认落盘，而不是假设公开 DSL 会原样持久化。

## 推荐验证 case

skill 在真正交付 chart 页面前，至少按下面顺序验证：

1. **builder + basic 基础图**
   - `query.mode = "builder"`
   - `visual.mode = "basic"`
   - `readback` 应看到 `query.collectionPath`
   - 页面 reload 后仍能显示

2. **sql chart 持久化**
   - `query.mode = "sql"`
   - 不只看 `stepParams.query.sql`
   - 还要确认 SQL 已经落到 `flowSql`
   - reload 后仍能显示

3. **builder -> sql -> builder roundtrip**
   - builder chart 可作为 filter-form target
   - 切到 sql 后，filter target 应失效 / 解绑
   - 切回 builder 后，filter target 应重新可用

4. **custom `visual.raw`**
   - 写入前先做 `ChartOptionModel` 兼容检查
   - 写入后确认不是空白图、不是 render failed

5. **负例**
   - 混用 `configure` 与 `query / visual / events`
   - `heightMode` 非法
   - `visual.mappings.*` 引用不存在的 query 输出
   - 预期都应返回 400，而不是留下半残配置

## 更复杂的验证矩阵

除了上面的基础 5 组，还建议补这几组：

6. **builder collection switch**
   - 先用 `employees`
   - 再切到 `departments`
   - 同次写入里同时更新 `query` 和 `visual.mappings`
   - 预期旧 `measures / dimensions / sorting / filter` 不会把新 collection 污染脏

7. **聚合 alias 排序**
   - `measures = [{ field: "amount", aggregation: "sum", alias: "totalAmount" }]`
   - `sorting = [{ field: "totalAmount", direction: "desc" }]`
   - 预期成功
   - 如果仍写 `sorting.field = "amount"`，预期 400

8. **filter-form roundtrip**
   - builder chart 绑定 filter-form
   - 切到 sql 后确认 filter target 解绑
   - 再切回 builder 后确认 filter target 重新可绑定
   - reload 后结果保持一致

9. **custom + events 组合**
   - `visual.mode = "custom"`
   - 同时配置 `events.raw`
   - 验证图可见、事件代码已落盘、reload 后不丢失

10. **SQL reload / durable**
   - SQL chart 创建后必须做一次页面 reload
   - 必须确认 runtime 仍能显示，而不是只在首次写入后的内存态可见

## 当前 skill 限制

- `visual.raw` / `events.raw` 不要套用普通 `jsBlock` / `js action` model；应分别使用 `ChartOptionModel` / `ChartEventsModel`。
- 这两类代码仍然优先使用保守模板，必要时先调用 `flowSurfaces:context` 收敛上下文，再写入，再做 readback。
- 如果用户只想“先出图”，一律优先 `builder + basic`，不要一上来走 custom JS。
- 如果用户要切换 chart collection，优先在同一次写入里同时给出：
  - 新 `query`
  - 新 `visual.mappings`
  这样成功率最高

## 什么时候回退 legacy `configure`

只在以下场景回退：

1. 需要兼容已有内部配置
2. `visual.raw` / `events.raw` 之外仍不够表达
3. 明确知道要写前端内部结构

否则优先使用 `query / visual / events`。
