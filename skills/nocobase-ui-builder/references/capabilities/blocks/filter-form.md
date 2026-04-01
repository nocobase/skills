# Filter Form Block

`filterForm` 负责筛选输入，不负责数据展示。

## 适用场景

- 默认为 `table/details/list/gridCard/map/comments` 提供筛选条件
- `chart` 只有在现场读回确认它带可解析 target resource 时，才作为保守筛选目标
- 作为页面左侧筛选面板
- 配合 `submit/reset/collapse` 操作

## 关键点

- `filterForm` 自己是 block。
- 它的字段是筛选项，不是展示字段。
- 字段通常要指定筛选目标，尤其当页面里有多个可筛选 block 时。

## 高频 actions

- `submit`
- `reset`
- `collapse`
- `js`

## 高频字段配置

筛选字段容易出现 target 歧义，这时要关注：

- `defaultTargetUid`
- `filterField`

如果页面里不止一个 `table/details/list/gridCard/map/comments` 目标，先 `get` 或 `catalog` 拿到目标 block uid，再显式绑定。

只使用当前 contract 明确暴露的 target 绑定字段，优先 `defaultTargetUid`；不要自造“等价字段”。

`chart` 不要当默认 target 猜；只有现场 `get` 证明它可被 `filterForm` 解析成目标时才显式绑定。

## 不支持的能力

- `renderer: "js"`
- `jsColumn`
- `jsItem`

## 推荐搭配

- 左侧 `filterForm`，右侧 `table`
- 上方 `filterForm`，下方 `list`
