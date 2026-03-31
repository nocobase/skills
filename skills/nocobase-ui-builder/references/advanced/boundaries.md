# Boundaries

## 这个 skill 应该做什么

- 根据自然语言映射到 page/tab/block/field/action/layout/configuration
- 用 `catalog/get` 约束生成
- 在 UI 搭建范围内完成可工作的页面

## 这个 skill 不应该做什么

- 不把源码当运行时依赖
- 不把 REST 当运行时接口
- 不把 raw tree patch 当默认手段
- 不把数据建模、ACL、workflow 全量定义混进 UI 搭建
- 不假设每个 block/action/field 都在当前应用里已启用

## 决策边界

- block 选型不确定时，先收敛到用户的展示/交互目标，再用 `catalog.blocks` 验证。
- 高级配置不确定时，先 `catalog.settingsContract`，再决定 `configure` 还是 `updateSettings`。
- 事件流不确定时，先确认相关 step 是否还存在。
