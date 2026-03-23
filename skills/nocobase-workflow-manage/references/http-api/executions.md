---
title: executions Resource HTTP API
description: Parameter descriptions and call examples for the list, detail, cancellation, and deletion interfaces of execution records.
---

# executions Resource HTTP API

> These endpoints are exposed through the NocoBase MCP tool; the following HTTP paths are used to map specific resource actions and parameters.

## executions:list

`GET /api/executions:list`

List execution records, usually filtered by workflow ID and sorted by time in descending order.

| Parameter | Description |
|---|---|
| `filter` | Filter conditions, e.g., `{"workflowId":1}` |
| `sort` | Sorting, e.g., `-id` |
| `page` / `pageSize` | Pagination |

```
GET /api/executions:list?filter[workflowId]=1&sort=-id&page=1&pageSize=20
```

---

## executions:get

`GET /api/executions:get`

Get details of a single execution. **When diagnosing execution failures, include `jobs` to get the status of each node; the `result` field is excluded by default when first loading jobs** (to reduce response size). To view the full output of a specific node, load it separately using `jobs:get`.

| Parameter | Description |
|---|---|
| `filterByTk` | Execution ID |
| `appends[]` | Append associations, use `jobs`, `workflow`, `workflow.nodes` when diagnosing issues |
| `except[]` | Exclude fields, e.g., `jobs.result` (exclude during initial load to reduce size) |

```
# When diagnosing execution failure (load all node statuses, exclude result field)
GET /api/executions:get?filterByTk=10&appends[]=jobs&appends[]=workflow.nodes&except[]=jobs.result

# When result is needed (larger size, use as needed)
GET /api/executions:get?filterByTk=10&appends[]=jobs&appends[]=workflow.nodes
```

---

## executions:cancel

`POST /api/executions:cancel`

Cancel an ongoing execution record (`status = 0`). The execution status and all PENDING jobs will be set to ABORTED (-3).

```
POST /api/executions:cancel?filterByTk=10
```

---

## executions:destroy

`POST /api/executions:destroy`

Delete an execution record. Running executions (`status = 0`) cannot be deleted and must be cancelled first.

```
POST /api/executions:destroy?filterByTk=10
```
