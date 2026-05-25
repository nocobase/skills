---
title: CalendarBlockModel
description: Calendar 区块的主块字段绑定、隐藏弹窗和错误修复规则。
---

# CalendarBlockModel

## 什么时候优先用

当请求明确出现 `日历`、`calendar`、`排期`、`日程`、`事件视图`、`排班` 这类时间轴/事件展示语义时，优先使用 `CalendarBlockModel`。

如果请求只是 dashboard / trend / KPI / 统计概览，不要因为中文里出现“看板”就改成 calendar 或 kanban；趋势、分布、排行走 chart，KPI/数字统计走 JSBlock。

## 主块规则

- 主 calendar block 不使用 `fields[]`
- 主 calendar block 不使用 `fieldGroups`
- 主 calendar block 不使用 `recordActions`
- 主 calendar block 不使用 `fieldsLayout`
- 事件标题和时间字段放在 `settings.titleField`、`settings.startField`、`settings.endField`，颜色可选放 `settings.colorField`
- `startField` / `endField` 必须是目标 collection 上真实存在、适合日期/时间语义的字段

示例：

```json
{
  "key": "taskCalendar",
  "type": "calendar",
  "collection": "tasks",
  "settings": {
    "titleField": "title",
    "startField": "startAt",
    "endField": "endAt",
    "colorField": "status"
  }
}
```

## 日期字段选择

- 业务日历优先使用用户要求或数据模型里明确表达业务含义的日期字段，例如 `startAt` / `endAt` / `scheduledAt` / `dueDate`
- 如果 collection 缺少有业务意义的日期字段，先通过数据建模补字段或向调用链说明需要该字段，不要静默拿无关字段伪装业务日历
- 只有普通 smoke / generic calendar 场景，且用户没有指定业务含义时，才可以使用已有且更可能有值的 `createdAt` / `updatedAt` 作为可渲染事件时间
- 不要把可选且通常为空的日期字段当作 smoke 日历默认字段，除非 live data 证明它有值

## Hidden popups

- 快速新建弹窗放在 `settings.quickCreatePopup`
- 事件点击/查看弹窗放在 `settings.eventPopup`
- popup 内可以使用 table/details/createForm/editForm 等正常 block 或模板选择
- event 表单/详情字段属于这些 popup host，不属于 calendar main block 的 `fields[]`、`fieldGroups`、`recordActions` 或 `fieldsLayout`
- whole-page `create` 下，direct non-template calendar 省略 hidden popup 时，backend authoring 可以补 `{ "tryTemplate": true }`

## 默认筛选与动作

- direct non-template public `calendar` 可以省略 `defaultFilter`；backend authoring 会从 live metadata 生成默认筛选字段
- 用户说“给日历增加筛选/搜索”时，默认落到 calendar host 的 block-level `filter` action
- 只有用户明确要求筛选区块、查询表单、搜索表单时才创建 `FilterFormBlockModel`
- 主块动作只放适合 calendar host 的 block-level action，不要放 record-level actions

## 后端错误修复

如果后端返回 `calendar-main-block-unsupported-fields`、`calendar-main-block-unsupported-fieldGroups`、`calendar-main-block-unsupported-recordActions` 或 `calendar-main-block-unsupported-fieldsLayout`：

- 保持 block type 为 `calendar`
- 把主块字段绑定修成 `settings.titleField` / `settings.startField` / `settings.endField` / `settings.colorField`
- 把表单、详情、字段分组、事件查看内容移动到 `settings.quickCreatePopup` 或 `settings.eventPopup`
- 按错误里的 `details.repairHint` 修当前 payload 并重试，不要切换成 table、chart、gridCard 或 actionPanel 来绕过错误

## 继续读

- [../page-blueprint.md](../page-blueprint.md)
- [../patterns/popup-openview.md](../patterns/popup-openview.md)
- [../reaction.md](../reaction.md)
