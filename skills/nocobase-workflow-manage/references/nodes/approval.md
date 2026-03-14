---
title: "审批"
description: "说明审批节点的配置项、协商/顺序审批规则与分支索引含义。"
---

# 审批

## 节点类型

`approval`
请使用以上 `type` 值创建节点，不要使用文档文件名作为 type。

## 节点描述
发起审批任务，等待审批结果后继续流程，可按审批结果分支。

## 业务场景举例
报销单提交后走审批流程，分支模式可类比 if/else。

## 配置项列表
| 字段 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| branchMode | boolean | false | 是 | 通过模式：`false` 直通（拒绝/退回即终止），`true` 分支模式。 |
| assignees | array | [] | 是 | 审批人列表。元素可为用户 ID，或用户筛选条件对象（filter 结构）。 |
| negotiation | number | 0 | 否 | 多人协商模式：`0` 任一通过/拒绝即生效；`1` 全部通过才通过；`0<value<1` 为投票阈值（如 0.6 表示通过率 >60% 才通过）。 |
| order | boolean | false | 否 | 是否按顺序审批（顺序审批时后续人员初始为 Assigned）。 |
| endOnReject | boolean | false | 否 | 分支模式下，拒绝分支结束后是否直接终止流程。 |
| title | string | 节点标题 | 否 | 任务标题，支持变量模板。 |
| applyDetail | object | 无 | 否 | 审批界面 UI Schema（旧版，通常由 UI 生成）。 |
| approvalUid | string | 无 | 否 | 审批界面配置 UID（新版，通常由 UI 生成）。 |
| taskCardUid | string | 无 | 否 | “我的审批”卡片配置 UID（通常由 UI 生成）。 |
| notifications | array | [] | 否 | 通知配置（审批通知模板/渠道等，由 UI 生成）。 |

## 分支说明
当 `branchMode=true` 时开启分支：
- `branchIndex=2`：审批通过（Approved）
- `branchIndex=-1`：审批拒绝（Rejected）
- `branchIndex=1`：退回（Returned）

`branchMode=false` 时不产生分支。

## 示例配置
```json
{
  "branchMode": true,
  "assignees": ["{{ $context.data.ownerId }}"],
  "negotiation": 1,
  "order": false,
  "endOnReject": true,
  "title": "{{ $context.data.title }} - 审批"
}
```