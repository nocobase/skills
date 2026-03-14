---
title: executions 资源 HTTP API
description: executions 执行记录的列表、详情、取消与删除接口参数说明与调用示例。
---

# executions 资源 HTTP API

> 这些端点通过 NocoBase MCP 工具暴露；以下 HTTP 路径用于映射具体资源动作与参数。

## executions:list

`GET /api/executions:list`

列出执行记录，通常按工作流 ID 过滤并按时间倒序排列。

| 参数 | 说明 |
|---|---|
| `filter` | 过滤条件，如 `{"workflowId":1}` |
| `sort` | 排序，如 `-id` |
| `page` / `pageSize` | 分页 |

```
GET /api/executions:list?filter[workflowId]=1&sort=-id&page=1&pageSize=20
```

---

## executions:get

`GET /api/executions:get`

获取单个执行详情。**诊断执行失败时，附带 `jobs` 获取各节点状态；首次加载 jobs 时 `result` 字段默认不包含**（减小响应体积），如需查看某个节点的完整输出，用 `jobs:get` 单独加载。

| 参数 | 说明 |
|---|---|
| `filterByTk` | 执行 ID |
| `appends[]` | 追加关联，诊断问题时使用 `jobs`、`workflow`、`workflow.nodes` |
| `except[]` | 排除字段，如 `jobs.result`（首次加载时排除，减少体积） |

```
# 诊断执行失败时（加载所有节点状态，排除 result 字段）
GET /api/executions:get?filterByTk=10&appends[]=jobs&appends[]=workflow.nodes&except[]=jobs.result

# 需要 result 时（体积较大，按需使用）
GET /api/executions:get?filterByTk=10&appends[]=jobs&appends[]=workflow.nodes
```

---

## executions:cancel

`POST /api/executions:cancel`

取消执行中的记录（`status = 0`）。执行状态和所有 PENDING jobs 均置为 ABORTED（-3）。

```
POST /api/executions:cancel?filterByTk=10
```

---

## executions:destroy

`POST /api/executions:destroy`

删除执行记录。运行中的执行（`status = 0`）不可删除，须先取消。

```
POST /api/executions:destroy?filterByTk=10
```
