---
title: Workflow HTTP API
description: Resource list and invocation specifications for workflow-related endpoints, exposed through the NocoBase MCP tool.
---

# Workflow HTTP API

## Invocation Specifications

- These interfaces correspond to resource actions of the same name in MCP; prioritize invocation via NocoBase MCP tools.
- The API prefix is `/api`, and the operation route format is `/api/<resource>:<action>`.
- The association resource operation format is `/api/<resource>/<id>/<association>:<action>`.
- When invoking via MCP, you usually only need to organize the request by resource action and parameters; the HTTP paths are preserved here for endpoint mapping and troubleshooting.

## Resources and Interfaces

### workflows — Workflows

Detailed parameters and examples: [workflows.md](workflows.md)

| Interface | Description |
|---|---|
| `GET /api/workflows:list` | List workflows |
| `GET /api/workflows:get` | Get a single workflow (can include nodes) |
| `POST /api/workflows:create` | Create a workflow |
| `POST /api/workflows:update` | Update a workflow (title, configuration, enabled status, etc.) |
| `POST /api/workflows:destroy` | Delete a workflow |
| `POST /api/workflows:revision` | Create a new version (same key) |
| `POST /api/workflows:execute` | Manually trigger execution |

---

### flow_nodes — Nodes

Detailed parameters and examples: [flow_nodes.md](flow_nodes.md)

| Interface | Description |
|---|---|
| `GET /api/flow_nodes:get` | Get a single node and read approval-related config such as `approvalUid` or `taskCardUid` |
| `POST /api/workflows/<workflowId>/nodes:create` | Create a node under a specified workflow |
| `POST /api/flow_nodes:update` | Update node configuration or title |
| `POST /api/flow_nodes:destroy` | Delete a node (and its branches by default) |
| `POST /api/flow_nodes:destroyBranch` | Delete a specified branch |
| `POST /api/flow_nodes:move` | Move a node to a new position |
| `POST /api/flow_nodes:duplicate` | Duplicate a node to a specified position |
| `POST /api/flow_nodes:test` | Test node configuration (supported only by some node types) |

---

### executions — Execution Records

Detailed parameters and examples: [executions.md](executions.md)

| Interface | Description |
|---|---|
| `GET /api/executions:list` | List execution records |
| `GET /api/executions:get` | Get details of a single execution (including jobs) |
| `POST /api/executions:cancel` | Cancel an ongoing execution record |
| `POST /api/executions:destroy` | Delete an execution record (cannot be deleted while running) |

---

### jobs — Node Jobs

Detailed parameters and examples: [jobs.md](jobs.md)

| Interface | Description |
|---|---|
| `GET /api/jobs:get` | Get details of a single node job (including full result) |

---

### flowSurfaces — Approval UI Authoring

Use this only for workflow approval custom UI authoring. For blueprint vs incremental routing, owner resolution, and verification order, read [Approval UI authoring index](../ui-config/approval/index.md).

| Interface | Description |
|---|---|
| `GET /api/flowSurfaces:get` | Read an existing approval surface by `uid` after resolving the root binding |
| `POST /api/flowSurfaces:catalog` | Discover approval block / field / action capabilities under a target approval node |
| `POST /api/flowSurfaces:applyApprovalBlueprint` | Bootstrap or replace an approval initiator / approver / task-card surface |
| `POST /api/flowSurfaces:addBlock` | Add one approval block under an existing approval root |
| `POST /api/flowSurfaces:addField` | Add one approval field under an existing approval root |
| `POST /api/flowSurfaces:addAction` | Add one approval action under an existing approval root |
| `POST /api/flowSurfaces:compose` | Batch localized edits under an existing approval root |
| `POST /api/flowSurfaces:configure` | Update approval UI settings such as return-node or reassignee scope |
| `POST /api/flowSurfaces:setLayout` | Re-layout an existing approval task-card/details grid without replacing the whole surface |
