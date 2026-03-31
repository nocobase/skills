# Filter Form Block

`filterForm` 负责筛选输入，不负责数据展示。

## 适用场景

- 为 `table/details/list/gridCard/chart/map/comments` 提供筛选条件
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

如果页面里不止一个 table/list/gridCard，先 `get` 或 `catalog` 拿到目标 block uid，再显式绑定。

## 不支持的能力

- `renderer: "js"`
- `jsColumn`
- `jsItem`

## 推荐搭配

- 左侧 `filterForm`，右侧 `table`
- 上方 `filterForm`，下方 `list`
