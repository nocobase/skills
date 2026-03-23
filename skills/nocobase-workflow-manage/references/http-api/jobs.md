---
title: jobs Resource HTTP API
description: Parameter descriptions for the jobs node job detail interface, used for diagnosing the execution results of individual nodes.
---

# jobs Resource HTTP API

> These endpoints are exposed through the NocoBase MCP tool; the following HTTP paths are used to map specific resource actions and parameters.

## jobs:get

`GET /api/jobs:get`

Get complete details of a single node job, **including the `result` field**.

Usually, the `result` field is excluded in `executions:get` via `except[]=jobs.result` to reduce size. When you need to analyze the reason for the failure of a specific node, use this interface to separately load the complete information of that job.

| Parameter | Description |
|---|---|
| `filterByTk` | job ID |

```
GET /api/jobs:get?filterByTk=42
```

Returns a job object, containing:
- `status`: Node execution status (see status codes in [modeling/index.md](../modeling/index.md))
- `result`: Node execution output or error message
- `nodeId` / `nodeKey`: Corresponding node identifier
