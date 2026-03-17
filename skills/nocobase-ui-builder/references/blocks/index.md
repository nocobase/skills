---
title: UI 区块文档索引
description: 按区块 use 查阅 nocobase-ui-builder 的细节文档与关联模式文档。
---

# UI 区块文档索引

## 使用方式

1. 先从用户目标识别本轮主要区块 use。
2. 打开对应的 block 文档。
3. 再按 block 文档里的“关联模式文档”继续打开 `../patterns/*.md`。
4. 如果当前区块还没有专用文档，退回 `SKILL.md`、`ui-api-overview.md` 和 `flow-model-recipes.md` 的通用规则执行，并在日志里记录缺口。

## 主干区块

| 区块 use | 文档 | 典型任务 | 常见关联模式 | 关联 case |
| --- | --- | --- | --- | --- |
| `FilterFormBlockModel` | [filter-form.md](filter-form.md) | 列表页顶部筛选、主表联动 | `relation-context.md` | `case1` `case4` `case5` |
| `TableBlockModel` | [table.md](table.md) | 主表、关系表、抽屉内子表、树表 | `table-column-rendering.md` `popup-openview.md` `relation-context.md` `tree-table.md` `many-to-many-and-through.md` | `case1` `case3` `case4` `case6` `case7` `case8` `case10` |
| `DetailsBlockModel` | [details.md](details.md) | 详情页、抽屉详情、详情内动作/关系表 | `relation-context.md` `popup-openview.md` `record-actions.md` | `case2` `case3` `case5` `case10` |
| `CreateFormModel` | [create-form.md](create-form.md) | 新建弹窗、抽屉表单、详情内新建入口 | `popup-openview.md` `relation-context.md` | `case1` `case4` `case6` |
| `EditFormModel` | [edit-form.md](edit-form.md) | 编辑弹窗、关系记录编辑、二层编辑对话框 | `popup-openview.md` `relation-context.md` `record-actions.md` | `case1` `case4` `case6` `case10` |
| `PageModel` / `RootPageTabModel` / `PageTabModel` | [page-and-tabs.md](page-and-tabs.md) | 默认隐藏 tab、显式 tabs、多标签页面 | `popup-openview.md` | `case9` `case10` |

## 先看横切模式的场景

| 现象或目标 | 优先文档 | 关联 case |
| --- | --- | --- |
| 表格列存在，但页面不显示真实值 | [../patterns/table-column-rendering.md](../patterns/table-column-rendering.md) | `case1` `case10` |
| drawer / dialog / ChildPage / 嵌套 popup | [../patterns/popup-openview.md](../patterns/popup-openview.md) | `case3` `case4` `case6` `case10` |
| 详情页内关系表、popup 内关系表、外键过滤 | [../patterns/relation-context.md](../patterns/relation-context.md) | `case2` `case3` `case5` `case6` `case10` |
| 记录级动作，如查看/编辑/审批/新增下级 | [../patterns/record-actions.md](../patterns/record-actions.md) | `case5` `case7` `case8` |
| 树表、自关联、层级型数据 | [../patterns/tree-table.md](../patterns/tree-table.md) | `case7` |
| 多对多、中间表字段、成员关系编辑 | [../patterns/many-to-many-and-through.md](../patterns/many-to-many-and-through.md) | `case8` |

## 用例覆盖对照

| 用例 | 建议先读 |
| --- | --- |
| `case1` 订单中心 | `filter-form.md` `table.md` `create-form.md` `edit-form.md` `table-column-rendering.md` `popup-openview.md` |
| `case2` 客户 360 工作台 | `details.md` `table.md` `relation-context.md` `popup-openview.md` |
| `case3` 采购单与明细抽屉 | `table.md` `details.md` `popup-openview.md` `relation-context.md` |
| `case4` 项目协同工作台 | `filter-form.md` `table.md` `details.md` `create-form.md` `edit-form.md` `popup-openview.md` `relation-context.md` |
| `case5` 审批详情与日志 | `details.md` `table.md` `record-actions.md` `relation-context.md` |
| `case6` 发票与回款 | `table.md` `create-form.md` `edit-form.md` `relation-context.md` `popup-openview.md` |
| `case7` 组织树与下级部门 | `table.md` `tree-table.md` `record-actions.md` |
| `case8` 项目成员与中间表 | `table.md` `many-to-many-and-through.md` `record-actions.md` |
| `case9` 多标签页 | `page-and-tabs.md` `details.md` `table.md` |
| `case10` 嵌套弹窗链路 | `table.md` `details.md` `popup-openview.md` `relation-context.md` `record-actions.md` |
