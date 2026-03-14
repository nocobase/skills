---
title: "审批事件"
description: "由审批发起触发的专用流程，支持审批发起人、审批表单与通知配置。"
---

# 审批事件

## 触发器类型

`approval`
请使用以上 `type` 值创建触发器，不要使用文档文件名作为 type。

## 适用场景
- 需要基于审批流程的业务场景（报销、采购、请假等）。
- 希望在流程中使用审批专属节点与审批中心能力。

## 触发时机 / 事件
- 当审批被创建或提交时触发流程。
- 支持“先保存数据再审批”或“审批通过后再落库”两种模式。

## 配置项列表
| 字段 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| collection | string | - | 是 | 审批关联的数据表，格式为 `"<dataSource>.<collection>"`。 |
| mode | number | 0 | 是 | 触发模式：`1` 保存前审批（审批通过后才写入数据），`0` 保存后审批（先写入再进入审批）。 |
| centralized | boolean | false | 否 | 是否允许在待办中心发起审批；为 `false` 时仅能在数据块/按钮上发起。 |
| audienceType | number | 1 | 否 | 发起人范围：`0` 受限（需配置审批发起人范围），`1` 不受限（所有可见用户）。 |
| applyForm | string | - | 否 | 发起人界面（v1 旧版 UI Schema 的 uid）。 |
| approvalUid | string | - | 否 | 发起人界面（v2 配置 uid）。 |
| taskCardUid | string | - | 否 | “我的申请”列表卡片配置 uid。 |
| recordShowMode | boolean | false | 否 | 流程中记录展示模式：`false` 快照，`true` 最新数据。 |
| appends | string[] | [] | 否 | 预加载关联字段路径，供流程中读取关系数据。 |
| withdrawable | boolean | false | 否 | 是否允许发起人撤回（由发起人界面配置自动生成）。 |
| useSameTaskTitle | boolean | false | 否 | 是否统一所有审批节点任务标题。 |
| taskTitle | string | - | 否 | 统一任务标题（支持变量模板）；仅在 `useSameTaskTitle=true` 时生效。 |
| notifications | object[] | [] | 否 | 审批完成通知配置（发送给发起人）。 |
| notifications[].channel | string | - | 是 | 通知渠道名称（如站内信/邮件等）。 |
| notifications[].templateType | string | template | 否 | 模板类型（`template` 或 `custom`）。 |
| notifications[].template | number \| object | - | 是 | 模板配置：模板 ID 或自定义模板结构（随渠道类型而定）。 |

## 触发器变量
- `$context.data`：审批关联的数据记录（是否包含预加载关系取决于 `appends` 与 `mode`）。
- `$context.approvalId`：审批记录 ID。
- `$context.applicant`：发起人用户信息。
- `$context.applicantRoleName`：发起人角色名称。

## 示例配置
```json
{
  "collection": "main.expenses",
  "mode": 0,
  "centralized": true,
  "audienceType": 1,
  "recordShowMode": false,
  "appends": ["applicant", "department"],
  "withdrawable": true,
  "useSameTaskTitle": true,
  "taskTitle": "报销审批：{{$context.data.title}}",
  "notifications": [
    {
      "channel": "in-app",
      "templateType": "template",
      "template": 1
    }
  ]
}
```