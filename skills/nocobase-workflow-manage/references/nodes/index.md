---
title: Workflow Nodes
description: Directory of workflow node types, explanation of chain structure, and variable production rules.
---

# Workflow Nodes

## Basic Data

Configuration options and output variables differ based on the node type. The node type is specified by the `type` field. Configuration settings are stored in the `config` field (JSON).

The `type` field is determined when the node is created and cannot be changed afterward. To modify a node's configuration, you must call the corresponding API to update the `config` field.

## Data Relationships of Nodes

1. Nodes in a NocoBase workflow are connected only through the `upstreamId` and `downstreamId` fields in the node table, representing the upstream and downstream nodes, respectively. A node without an upstream node is considered a start node.
2. When `upstreamId` and `downstreamId` are paired, the downstream node is a direct downstream node, not a node within a branch.
3. Workflows support organizational structures through branches. Any node with a non-null integer value in the `branchIndex` field represents the starting node of a branch. Its `upstreamId` points to the node that initiated the branch, and the specific value of `branchIndex` is defined by that initiating node. Implemented nodes that can initiate branches include:
   - Condition node (`condition`)
   - Parallel node (`parallel`)
   - Multi-condition node (`multi-condition`)
   - Loop node (`loop`)
   - Approval node (`approval`)
4. For nodes that can initiate branches, refer to the specific node's documentation to understand when branches are supported and the meaning of specific `branchIndex` values.

## Variables Produced by Nodes

Some nodes produce variables that can be used by subsequent nodes. These variables are referenced in the format `{{$jobsMapByNodeKey.<nodeKey>.<variableName>}}`. Refer to each node's documentation for details. If a variable points to a data table structure, the internal property paths match the table's field names.

Subsequent nodes can reference these variables in their configuration to implement dynamic workflow logic as required by business needs.

## Usage Notes

* **Only the type values specified in the documentation can be used**; other values will not be recognized by the workflow.

## Node Document Directory

### Built-in Nodes

| Type Value | Name | Document |
|---|---|---|
| `calculation` | Calculation | [calculation.md](calculation.md) |
| `condition` | Condition Branch | [condition.md](condition.md) |
| `query` | Query Records | [query.md](query.md) |
| `create` | Create Record | [create.md](create.md) |
| `update` | Update Record | [update.md](update.md) |
| `destroy` | Delete Record | [destroy.md](destroy.md) |
| `end` | End Workflow | [end.md](end.md) |
| `output` | Workflow Output | [output.md](output.md) |
| `multi-condition` | Multi-condition Branch | [multi-conditions.md](multi-conditions.md) |

### Extension Plugin Nodes

| Type Value | Name | Plugin | Document |
|---|---|---|---|
| `loop` | Loop | plugin-workflow-loop | [loop.md](loop.md) |
| `parallel` | Parallel Branch | plugin-workflow-parallel | [parallel.md](parallel.md) |
| `request` | HTTP Request | plugin-workflow-request | [request.md](request.md) |
| `mailer` | Send Email | plugin-workflow-mailer | [mailer.md](mailer.md) |
| `delay` | Delay | plugin-workflow-delay | [delay.md](delay.md) |
| `notification` | System Notification | plugin-workflow-notification | [notification.md](notification.md) |
| `aggregate` | Aggregate Query | plugin-workflow-aggregate | [aggregate.md](aggregate.md) |
| `sql` | SQL Operation | plugin-workflow-sql | [sql.md](sql.md) |
| `cc` | CC Notification | plugin-workflow-cc | [cc.md](cc.md) |
| `json-query` | JSON Query | plugin-workflow-json-query | [json-query.md](json-query.md) |
| `json-variable-mapping` | JSON Variable Mapping | plugin-workflow-json-variable-mapping | [json-variable-mapping.md](json-variable-mapping.md) |
| `script` | JavaScript | plugin-workflow-javascript | [script.md](script.md) |
| `manual` | Manual Process | plugin-workflow-manual | [manual.md](manual.md) |
| `response-message` | Response Message | plugin-workflow-response-message | [response-message.md](response-message.md) |
| `subflow` | Call Workflow | plugin-workflow-subflow | [subflow.md](subflow.md) |
| `response` | Response (for webhook) | plugin-workflow-webhook | [response.md](response.md) |
| `approval` | Approval | plugin-workflow-approval | [approval.md](approval.md) |
