---
title: FilterFormBlockModel
description: 筛选区块的适用范围、完成标准、whole-page 写法与低层兜底边界。
---

# FilterFormBlockModel

## 适用范围

- `FilterFormBlockModel`
- `FilterFormGridModel`
- `FilterFormItemModel`
- `FilterFormSubmitActionModel`
- `FilterFormResetActionModel`

典型目标：

- 列表页顶部筛选
- 详情页上方的主记录筛选
- 与某张主表或关系表联动的查询入口

## 何时使用

- 用户明确要求“筛选区块 / 筛选表单 / 查询表单 / 搜索区块 / 搜索表单 / 条件查询区 / filter form / search block”
- validation case 需要证明页面不是空壳，而是能命中真实数据
- 页面主表已确定，需要一个稳定的筛选入口，而不是自由输入的表单壳

如果用户只是说“给表格/列表/Grid 增加筛选”或“增加筛选功能”，或者说“给表格/列表/Grid/卡片增加搜索功能”“支持搜索”“带搜索”“可搜索 / searchable”，默认先把它理解成数据区块上的 `filter` action，而不是新增 `FilterFormBlockModel`。像“搜索页 / 搜索结果页 / 搜索列表页”这样的页面级搜索表述，即使同句里再出现“支持搜索”，也不应仅因为出现了列表或卡片字样就升级成 filter intent。像“帮助中心页面，用列表展示帮助文档入口，并支持搜索”这种普通页面检索诉求，也不应仅因为同句出现 `列表` 就自动变成 data-block `filter` action。

## 写前必查

1. `FilterFormBlockModel`、`FilterFormItemModel` 与目标字段渲染模型的 schema
2. 目标主表或目标区块的 same-run `key`（whole-page public）或 live `uid`（localized low-level edit）
3. 要筛选的字段元数据
4. 如果筛选项包含关联字段或记录选择器，再看 [../patterns/relation-context.md](../patterns/relation-context.md)

## 最小成功树

在“真实可筛选”的场景里，最低结构应包括：

- `FilterFormBlockModel`
- `subModels.grid`
- 至少一个 `FilterFormItemModel`
- `FilterFormSubmitActionModel`
- `FilterFormResetActionModel`
- 每个筛选项都显式指向目标区块，例如 `target` 或持久化后的 `defaultTargetUid`
- 承载这些区块的 `BlockGridModel` 顶层存在 `filterManager`

只有 block 壳、没有 items/actions，不能算完成。

## Whole-page 默认配方

当 whole-page blueprint 已经知道目标主表时，默认这样落：

- 给目标 table 一个稳定的 same-run key
- 在 `applyBlueprint` 里，每个筛选项都用 public `target: "<table-key>"` 指向这个 same-run table；`target` 必须是字符串 block key
- 如果同一个页面里有两个筛选区块分别服务两张表，这仍然是合法的 whole-page public 写法；每个 `filterForm` 只需要让自己的筛选项指向自己的 same-run table key
- 同一个筛选区块里同时放稳定筛选项和 filter-form action family
- 当筛选字段少于 4 个时，默认放 `submit` / `reset`
- 当筛选字段大于等于 4 个时，默认放 `submit` / `reset` / `collapse`
- 如果该 tab / popup 还存在其他非筛选区块，并且显式提供了 `layout`，让 `filterForm` 单独占据第一行
- 第一行可以同时放多个 `filterForm`，前提是那一整行都只由筛选区块组成
- 让 canonicalization / live readback 基于 public `target` 和字段 metadata 补齐持久化后的 `defaultTargetUid` 与 `filterManager`
- 不要在 whole-page `filterForm` block `settings` 里写 low-level `fields`、`actions`、`defaultTargetUid` 或 `filterManager`
- 如果某个复杂筛选项的 field model 或 `filterPaths` 仍未消歧，就先保留简单且稳定的筛选项，不要为了“以后再补”先写一个空壳 filter block

最低 whole-page 形状应该像这样：

```json
{
  "key": "recordsFilter",
  "type": "filterForm",
  "collection": "records",
  "fields": [
    {
      "key": "statusFilter",
      "field": "status",
      "target": "recordsTable"
    }
  ],
  "actions": ["submit", "reset"]
}
```

## Localized low-level 配方

只有在以下情况才走低层路径：

- 当前任务本来就是现有页面上的 localized live edit
- 或者 whole-page `applyBlueprint` 已经成功，但 live readback 暴露了明确的 residual local/live gap，需要对筛选区块做窄范围修补
- 如果 whole-page `applyBlueprint` 在首次成功前失败，先根据错误修正 blueprint，重新跑 `prepare-write` 和 preview，并仅重试 blueprint 路径，最多 5 轮；这些 pre-success retries 期间不要切到低层写；5 轮仍失败再报告最新 blueprint / preview / error 证据

低层默认写法：

- `addBlock(type="filterForm")` 创建 block 壳
- 只给 block 写当前 live contract 支持的配置键；不要把 `fields` / `actions` / `defaultTargetUid` 塞进 block settings
- `addAction("submit")`、`addAction("reset")`
- 每个筛选项通过 `addField(fieldPath, { collectionName, defaultTargetUid })` 落库
- 完成后用 live readback 确认 items、submit/reset、`defaultTargetUid` 都已持久化，再宣称 `filterForm` 完成

## 完成标准

- 用户要求的关键筛选项都已经落库，而不是只创建空 grid
- whole-page public 写法里，筛选项已经指向明确的 same-run table `target`
- localized low-level 写法里，筛选项已经持久化出明确的 `defaultTargetUid`
- 每个筛选项都绑定了明确的 `fieldPath`
- 当筛选字段大于等于 4 个时，`collapse` 动作存在
- 每个筛选项的 `subModels.field.use` 与 `filterFormItemSettings.init.filterField` 都必须由字段 metadata 推导，不能把 `select/date/number/percent/time/association` 一律落成 `InputFieldModel`
- 提交 / 重置动作存在
- `subModels.actions[*].use` 必须来自 filter-form action family，例如 `FilterFormSubmitActionModel` / `FilterFormResetActionModel`
- 筛选区块的目标表或目标区块可追踪，而不是隐式悬空
- `BlockGridModel.filterManager` 已把每个筛选项连接到明确 target，并且 `filterPaths` 与字段 metadata 一致

## 常见陷阱

- 只创建 `FilterFormBlockModel` 壳，不创建 item/action
- 把 whole-page public `target` 写法和 low-level `defaultTargetUid` 写法混成一种 payload
- 把 `fields` / `actions` / `defaultTargetUid` / `filterManager` 直接塞进 `filterForm` block settings，期待 `applyBlueprint` / `addBlock` 接受
- 筛选项存在，但没有绑定目标区块
- 明明已经知道目标主表，却把 `submit` / `reset` 或 field `target` 留到第二阶段再补
- 关联字段筛选直接猜 `fieldPath` 或 `fieldNames`
- `select` / `radioGroup` / `checkboxGroup` / `boolean` / `percent` / `time` 字段沿用普通文本输入
- 把“筛选区块已落库”误当成“已经可筛选”

## 关联模式文档

- [../patterns/relation-context.md](../patterns/relation-context.md)
- [../execution-checklist.md](../execution-checklist.md)
- [table.md](table.md)

## 能力不足时如何降级

- 如果某个复杂筛选项的字段渲染模型仍未消歧，优先保留简单且稳定的筛选项
- 如果 single-shot whole-page 在首次成功前失败，先根据错误修正 blueprint，重新跑 `prepare-write` 和 preview，并仅重试 blueprint 路径，最多 5 轮；这些 pre-success retries 期间不要把 staged 低层写法当默认主流程或同阶段兜底；5 轮仍失败再报告最新 blueprint / preview / error 证据
- 只有在 whole-page `applyBlueprint` 已成功且 readback 显示明确 residual local/live gap 时，才把该筛选区块切到窄范围低层 `addBlock` / `addAction` / `addField` 修补
- 在 validation 场景里，如果最终无法命中样本数据，必须判为未完整通过
