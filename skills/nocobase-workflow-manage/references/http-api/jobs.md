---
title: jobs 资源 HTTP API
description: jobs 节点作业的详情接口参数说明，用于诊断单个节点的执行结果。
---

# jobs 资源 HTTP API

> 这些端点通过 NocoBase MCP 工具暴露；以下 HTTP 路径用于映射具体资源动作与参数。

## jobs:get

`GET /api/jobs:get`

获取单个节点作业的完整详情，**包含 `result` 字段**。

通常在 `executions:get` 中通过 `except[]=jobs.result` 排除了 result 字段来减少体积，当需要分析某个具体节点的失败原因时，再用此接口单独加载该 job 的完整信息。

| 参数 | 说明 |
|---|---|
| `filterByTk` | job ID |

```
GET /api/jobs:get?filterByTk=42
```

返回 job 对象，包含：
- `status`：节点执行状态（状态码见 [modeling/index.md](../modeling/index.md)）
- `result`：节点执行输出或错误信息
- `nodeId` / `nodeKey`：对应的节点标识
