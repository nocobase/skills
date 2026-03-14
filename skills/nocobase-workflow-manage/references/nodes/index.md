---
title: 工作流节点
description: 工作流节点的类型目录、链式结构说明与变量产出规则。
---

# 工作流节点

## 基础数据

根据节点类型不同，配置项与产出变量也不同。节点的类型即为 `type` 字段值。配置项存储在 `config` 字段（JSON）中。

创建节点时会确定 type 字段，该字段在节点创建后不可更改。修改节点配置时，需调用相应接口更新 `config` 字段。

## 节点的数据关系

1. NocoBase 工作流的节点之间仅通过节点表的 `upstreamId` 和 `downstreamId` 字段建立连接关系，分别表示上游节点和下游节点。没有上游节点的节点视为起始节点。
2. `upstreamId` 和 `downstreamId` 配对时，下游节点不作为分支内节点，而是作为直接下游。
3. 工作流支持通过分支组织流程结构，所有节点如果 `branchIndex` 有非 null 的整数值，则代表是分支内的开始节点，`upstreamId` 指向开启分支的节点，`branchIndex` 的具体值由开启分支的节点定义。已实现的可以开启分支的节点包括：
   - 条件分支节点（`condition`）
   - 并行分支节点（`parallel`）
   - 多条件分支节点（`multi-condition`）
   - 循环节点（`loop`）
   - 审批节点（`approval`）
4. 可开启分支的节点需要参考具体节点的文档，了解何种情况下支持分支，以及分支的具体 index 值含义。

## 节点产出的变量

部分节点可以产出供后续节点使用的变量，变量以 `{{$jobsMapByNodeKey.<nodeKey>.<variableName>}}` 形式引用，具体可参考各节点的文档说明。其中如果变量指向某张数据表结构的，则内部属性路径与数据表字段名一致。

后续节点基于业务的需要，可以在配置项中引用这些变量，实现动态化的工作流逻辑。

## 使用注意

* **只有文档中写明的类型值才能使用**，其他值会导致工作流无法识别。

## 节点文档目录

### 内置节点

| 类型值 | 名称 | 文档 |
|---|---|---|
| `calculation` | 运算 | [calculation.md](calculation.md) |
| `condition` | 条件分支 | [condition.md](condition.md) |
| `query` | 查询记录 | [query.md](query.md) |
| `create` | 新增记录 | [create.md](create.md) |
| `update` | 更新记录 | [update.md](update.md) |
| `destroy` | 删除记录 | [destroy.md](destroy.md) |
| `end` | 结束流程 | [end.md](end.md) |
| `output` | 流程输出 | [output.md](output.md) |
| `multi-condition` | 多条件分支 | [multi-conditions.md](multi-conditions.md) |

### 扩展插件节点

| 类型值 | 名称 | 插件 | 文档 |
|---|---|---|---|
| `loop` | 循环 | plugin-workflow-loop | [loop.md](loop.md) |
| `parallel` | 并行分支 | plugin-workflow-parallel | [parallel.md](parallel.md) |
| `request` | HTTP 请求 | plugin-workflow-request | [request.md](request.md) |
| `mailer` | 发送邮件 | plugin-workflow-mailer | [mailer.md](mailer.md) |
| `delay` | 延时 | plugin-workflow-delay | [delay.md](delay.md) |
| `notification` | 系统通知 | plugin-workflow-notification | [notification.md](notification.md) |
| `aggregate` | 聚合查询 | plugin-workflow-aggregate | [aggregate.md](aggregate.md) |
| `sql` | SQL 操作 | plugin-workflow-sql | [sql.md](sql.md) |
| `dynamic-calculation` | 动态运算 | plugin-workflow-dynamic-calculation | [dynamic-calculation.md](dynamic-calculation.md) |
| `cc` | 抄送通知 | plugin-workflow-cc | [cc.md](cc.md) |
| `json-query` | JSON 查询 | plugin-workflow-json-query | [json-query.md](json-query.md) |
| `json-variable-mapping` | JSON 变量映射 | plugin-workflow-json-variable-mapping | [json-variable-mapping.md](json-variable-mapping.md) |
| `manual` | 人工处理 | plugin-workflow-manual | [manual.md](manual.md) |
| `response-message` | 响应消息 | plugin-workflow-response-message | [response-message.md](response-message.md) |
| `subflow` | 调用工作流 | plugin-workflow-subflow | [subflow.md](subflow.md) |
| `webhook-response` | Webhook 响应 | plugin-workflow-webhook | [webhook-response.md](webhook-response.md) |
| `approval` | 审批 | plugin-workflow-approval | [approval.md](approval.md) |
