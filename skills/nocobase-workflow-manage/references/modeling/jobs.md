---
title: "Jobs"
description: "The node execution record table, saving the results and status of each node in an execution."
---

# Jobs

Node execution records are automatically generated when a workflow executes and are managed by the executor. They do not need to be created manually. This document is for field description only.

## Field Descriptions

| Field Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| id | bigInt | No (System generated) | - | Primary key ID. Generated using snowflake by the workflow engine; must be explicitly provided if inserted manually. |
| execution | belongsTo | Yes | - | Associated execution (`executions`), foreign key is `executionId`. |
| node | belongsTo | Yes | - | Corresponding node (`flow_nodes`), foreign key is `nodeId`. |
| nodeKey | string | Yes | - | The `flow_nodes.key` of the corresponding node, used for cross-version mapping and result referencing. |
| upstream | belongsTo | No | - | Upstream job (`jobs`), foreign key is `upstreamId`, used in some node link scenarios. |
| status | integer | Yes | - | Node execution status, see the enum below. |
| meta | json | No | - | Node execution metadata (e.g., wait/form information, etc.). |
| result | json | No | - | Node execution result data (for subsequent nodes and output usage). |

## Status Enum (status)

- `0`: PENDING (Waiting)
- `1`: RESOLVED (Success)
- `-1`: FAILED (Condition failed/Not passed)
- `-2`: ERROR (Execution error)
- `-3`: ABORTED (Aborted)
- `-4`: CANCELED (Canceled)
- `-5`: REJECTED (Rejected)
- `-6`: RETRY_NEEDED (Retry needed)

## Example Values

```ts
const values = {
  id: '900000000000001',
  executionId: 20001,
  nodeId: 30001,
  nodeKey: 'node_user_update_notify',
  upstreamId: null,
  status: 1,
  meta: { durationMs: 120 },
  result: { delivered: true },
};
```