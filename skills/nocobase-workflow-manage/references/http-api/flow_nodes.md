---
title: flow_nodes Resource HTTP API
description: Parameter descriptions and call examples for flow_nodes node creation, update, deletion, movement, duplication, and testing interfaces.
---

# flow_nodes Resource HTTP API

> These endpoints are exposed through the NocoBase MCP tool; the following HTTP paths are used to map specific resource actions and parameters.
>
> **Note: Except for `test`, all write operations require that the workflow version has not yet been executed (`versionStats.executed == 0`). For already executed versions, a new version must first be created via `workflows:revision`.**

## nodes:create (Create Node)

`POST /api/workflows/<workflowId>/nodes:create`

Creates a node under the specified workflow. If creating nodes for the same workflow, the interface must be called serially (wait for the previous creation to complete before the next call) to avoid connection relationship errors caused by concurrency.

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | Yes | Node type, see node documentation. Cannot be changed after creation. |
| `title` | string | No | Node title |
| `upstreamId` | number|null | Yes | Upstream node ID; `null` means insert as the first node |
| `branchIndex` | number|null | Yes | Branch index; use `null` for the main chain; use the corresponding integer for branch head nodes |
| `config` | object | No | Node configuration, can be updated via `flow_nodes:update` after creation |

```
POST /api/workflows/1/nodes:create
Body: {
  "type": "calculation",
  "title": "Calculation Node",
  "upstreamId": null,
  "branchIndex": null,
  "config": {}
}
```

Returns the created node object, including `id` and `key`.

---

## flow_nodes:update (Update Node)

`POST /api/flow_nodes:update`

Updates a node's title or configuration. Calling is not allowed for already executed versions.

| Parameter | Description |
|---|---|
| `filterByTk` | Node ID (Query) |
| Body `title` | Modify node title |
| Body `config` | Modify node configuration |

```
POST /api/flow_nodes:update?filterByTk=10
Body: {
  "config": {
    "engine": "math.js",
    "expression": "{{$context.data.price}} * 1.1"
  }
}
```

---

## flow_nodes:destroy (Delete Node)

`POST /api/flow_nodes:destroy`

Deletes a node. By default, all its branch chains will be deleted as well.

| Parameter | Description |
|---|---|
| `filterByTk` | Node ID (Query) |
| `keepBranch` | Optional, retain a branch and connect it to the main chain (provide the `branchIndex` value) |

```
# Delete node, including all branches
POST /api/flow_nodes:destroy?filterByTk=10

# Delete node, keep branch with branchIndex=1 and connect it to the main chain
POST /api/flow_nodes:destroy?filterByTk=10&keepBranch=1
```

---

## flow_nodes:destroyBranch (Delete Branch)

`POST /api/flow_nodes:destroyBranch`

Deletes a specific branch of a branch node (including all nodes within the branch).

| Parameter | Description |
|---|---|
| `filterByTk` | Branch parent node ID (Query) |
| `branchIndex` | Index of the branch to delete |
| `shift` | `1` means shift subsequent branch indices forward after deletion (useful for multi-condition nodes) |

```
POST /api/flow_nodes:destroyBranch?filterByTk=5&branchIndex=2&shift=1
```

---

## flow_nodes:move (Move Node)

`POST /api/flow_nodes:move`

Moves a node to a new position (re-connects the chain).

| Parameter | Description |
|---|---|
| `filterByTk` | ID of the node to move (Query) |
| Body `values.upstreamId` | Target upstream node ID; `null` means move to the very front of the chain |
| Body `values.branchIndex` | Target branch index; use `null` for the main chain |

Constraints:
- The workflow version must not have been executed.
- A node's upstream cannot be set to itself.
- If the upstream and branch index are the same as current, the interface will return an error (no move necessary).

```
# Move node to the main chain after nodeId=3
POST /api/flow_nodes:move?filterByTk=10
Body: {
  "values": {
    "upstreamId": 3,
    "branchIndex": null
  }
}

# Move node to the very front of the chain
POST /api/flow_nodes:move?filterByTk=10
Body: {
  "values": {
    "upstreamId": null
  }
}
```

Returns the moved node object.

---

## flow_nodes:duplicate (Duplicate Node)

`POST /api/flow_nodes:duplicate`

Duplicates a node to a specified position. The new node copies the original node's `type`, `title`, and `config` (some node types handle configuration via `duplicateConfig`).

| Parameter | Description |
|---|---|
| `filterByTk` | Source node ID to duplicate (Query) |
| Body `values.upstreamId` | Upstream node ID for the new node's insertion position |
| Body `values.branchIndex` | Branch index for the new node; use `null` for the main chain |
| Body `values.config` | Optional, override the duplicated node configuration |

Constraints:
- The workflow version must not have been executed.
- Total number of nodes must not exceed the server limit (`WORKFLOW_NODES_LIMIT`).

```
# Duplicate nodeId=10 node, insert into the main chain after nodeId=3
POST /api/flow_nodes:duplicate?filterByTk=10
Body: {
  "values": {
    "upstreamId": 3,
    "branchIndex": null
  }
}
```

Returns the newly created node object, including new `id` and `key`.

---

## flow_nodes:test (Test Node Configuration)

`POST /api/flow_nodes:test`

Tests if a node configuration is valid (only some node types implement the `test` method, such as `calculation`, `query`, `request`).

| Field | Description |
|---|---|
| Body `values.type` | Node type |
| Body `values.config` | Node configuration |

```
POST /api/flow_nodes:test
Body: {
  "values": {
    "type": "calculation",
    "config": { "engine": "math.js", "expression": "1 + 1" }
  }
}
```

Returns execution results on success; returns 500 and error message on configuration error.
