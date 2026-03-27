---
title: Page / Tabs
description: 页面壳、默认隐藏页签、显式 tabs 和 tab-grid 定位的注意事项。
---

# Page / Tabs

## 适用范围

- `PostDesktoproutes_createv2`（由 agent 先通过 MCP 调用，再把 artifact 交给 `ui_write_wrapper.mjs --action create-v2`）
- `RootPageModel` / `PageModel` / `ChildPageModel`
- `RootPageTabModel` / `PageTabModel` / `ChildPageTabModel`
- tab 下的 `grid`

典型目标：

- 普通 v2 页面
- 使用默认隐藏 tab 的单页结构
- 显式可见 tabs
- popup page / ChildPage 中的 tabs

优先参考动态场景：

- 多标签业务工作台
- 协作 / 分析 / 地图这类扩展 tab 视图
- popup page / ChildPage 下的局部页面结构

## 写前必查

1. `createV2` 只初始化页面壳，不负责修复缺失树
2. 默认隐藏 tab 的 `schemaUid` 是 `tabs-{schemaUid}`
3. 当前任务是否真的要求“显式 tabs”，还是只需要默认隐藏 tab
4. 如果显式 tabs / popup page tabs 仍有歧义，先明确是哪一层 page / tab / grid
5. 写前就要确定写后 readback 要核对什么，不能等 `save` 返回 ok 再临时猜成功标准
6. page / tab use 要按父 page 选择：`RootPageModel -> RootPageTabModel`，`PageModel -> RootPageTabModel | PageTabModel`，`ChildPageModel -> ChildPageTabModel`
7. builder 当前只支持 `popup.pageUse + blocks`，不支持 `popup.tabs` / `popup.layout.tabs`
8. flowPage v2 的 `RootPageModel` 必须写到 `parentId=<pageSchemaUid>, subKey=page`；不要把页面 route `schemaUid` 直接当作 `RootPageModel.uid`
9. `RootPageModel` 的可见 tabs 是 route-driven runtime 结构，不应持久化到 `RootPageModel.subModels.tabs`
10. 如果需要多个可见 tab，先创建 child desktopRoutes；每个 tab 内容单独写到 `parentId=<tabSchemaUid>, subKey=grid`

## 最小成功树

单页最低结构：

- `ui_write_wrapper.mjs --action create-v2`
- route tree / page anchor / grid anchor artifacts
- 页面根锚点
- 默认隐藏 tab grid

显式 tabs 场景最低结构：

- 页面 route 下的 child desktopRoutes
- page anchor 仍只负责 `RootPageModel` 本身，不直接持久化 visible `tabs`
- 每个 child route 的 `schemaUid`
- 每个 child route 各自的 grid anchor
- 每个 tab 的 grid 下至少一个真实业务 block

## 完成标准

- 用户只要单页时，默认隐藏 tab 即可，不必强造显式 tabs
- 用户明确要求“多个可见标签”时，必须能区分默认隐藏 tab 与显式 tab
- `createV2` 后必须额外确认 page route 与隐藏 tab 已进入 accessible route tree；仅有 flowModels 锚点不算 page ready
- `RootPageModel` 的 readback 不应把可见 tabs 当作持久化 flow tree 主体；显式 tab 的持久化锚点应落在各自 child route 的 grid anchor
- 每个 tab 的 block 都要挂到正确 grid，不能只创建 page 壳
- `save` 之后必须做 write-after-read；至少核对 tab 数、tab 标题和每个 tab 的 grid 是否真的存在
- 自动对账只在写操作与 `GetFlowmodels_findone` 都显式带同一个 `args.targetSignature`、且 `tool_call.result.summary` 已落下结构化摘要时成立
- 如果 readback 只剩 page 壳或 `Add block`，即使 `save` 返回成功，也必须判成 `partial/failed`
- fresh build 若首开前缺少 route-ready 证据，只能记为“page shell created”，不能记为“页面可打开”

## 常见陷阱

- 把默认隐藏 tab 当成显式 tabs 能力
- 写 block 时定位错了 page 根和 tab grid
- 把 `RootPageModel.subModels.tabs` 当成 flowPage v2 的真实持久化协议
- 把页面 route `schemaUid` 直接当成 `RootPageModel.uid` 写入
- 以为 `createV2` 会自动补齐显式 tabs
- 以为 `createV2` + `GetFlowmodels_findone(page/grid)` 就足以证明页面首开可用
- `save` 返回了 `tabCount` 就直接宣布成功，却没有看 write-after-read
- 在显式 tabs 能力不足时，静默退回默认隐藏 tab 却不说明

## 关联模式文档

- [../patterns/popup-openview.md](../patterns/popup-openview.md)

## 失败时如何降级

- 如果显式 tabs 仍不稳定，不要绕开问题；应明确说明当前只能稳定依赖默认隐藏 tab
- 多标签页至少要说明哪个 tab 已落库、哪个 tab 仍缺定位或写入协议
- 如果显式 tabs payload 自身不稳定，优先回退到“阻断写入并报告 payload/协议问题”，不要把空壳页面交给用户继续验证
