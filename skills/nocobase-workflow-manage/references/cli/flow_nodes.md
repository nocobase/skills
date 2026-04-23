---
title: flow_nodes Resource CLI
description: Parameter descriptions and CLI examples for workflow node creation, inspection, update, deletion, movement, duplication, and testing.
---

# flow_nodes Resource CLI

> Node creation uses the nested workflow command `nb api workflow workflows nodes create`.
>
> Node inspection, mutation, and testing use `nb api workflow flow-nodes`.
>
> Except for `test`, write operations require an unexecuted workflow version. If `versionStats.executed > 0`, create a new workflow revision first.

## Help-First Rule

```bash
nb api workflow workflows nodes create -h
nb api workflow flow-nodes -h
nb api workflow flow-nodes get -h
nb api workflow flow-nodes update -h
nb api workflow flow-nodes destroy -h
nb api workflow flow-nodes destroy-branch -h
nb api workflow flow-nodes move -h
nb api workflow flow-nodes duplicate -h
nb api workflow flow-nodes test -h
```

For create, update, move, duplicate, and test, prefer `--body-file` for non-trivial JSON bodies.

## Common Parameter Mapping

| Business parameter | Typical CLI placement | Notes |
|---|---|---|
| workflow path `<workflowId>` | `--workflow-id <id>` | Required for `workflows nodes create` |
| `filterByTk` | `--filter-by-tk <id>` | Target node ID |
| `appends[]` | `--appends <name>` | Repeatable flag |
| `branchIndex` | `--branch-index <n>` | Branch selector |
| `keepBranch` | `--keep-branch <n>` | Keep one branch during node deletion |
| `shift` | `--shift 1` | Shift branch indices after deletion |
| `updateAssociationValues` | `--update-association-values '<json>'` | Update associations while mutating |
| request body fields | dedicated body-field flags or `--body` / `--body-file` | Do not mix the two styles |

---

## nodes:create

`nb api workflow workflows nodes create`

Create a node under the specified workflow. For the same workflow, create nodes serially, not concurrently.

| Field | Type | Required | Description |
|---|---|---|---|
| workflow path `<workflowId>` | number | Yes | Workflow ID owning the new node |
| `type` | string | Yes | Node type |
| `title` | string | No | Node title |
| `upstreamId` | number or null | Yes | Upstream node ID; `null` inserts at the front |
| `branchIndex` | number or null | Yes | `null` for main chain; integer for branch head |
| `config` | object | No | Initial node configuration |

Body-file example:

```json
{
  "type": "calculation",
  "title": "Calculation Node",
  "upstreamId": null,
  "branchIndex": null,
  "config": {}
}
```

```bash
nb api workflow workflows nodes create \
  --workflow-id 1 \
  --body-file ./flow-node-create.json
```

Inline example:

```bash
nb api workflow workflows nodes create \
  --workflow-id 1 \
  --type calculation \
  --title 'Calculation Node' \
  --config '{}'
```

Returns the created node object, including `id` and `key`.

---

## flow_nodes:get

`nb api workflow flow-nodes get`

Get one node. Append `upstream` or `downstream` when checking link relationships.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Node ID |
| `appends[]` | `--appends <name>` | Append associations such as `upstream` or `downstream` |

```bash
nb api workflow flow-nodes get \
  --filter-by-tk 10 \
  --appends upstream \
  --appends downstream
```

---

## flow_nodes:update

`nb api workflow flow-nodes update`

Update a node's title, configuration, branch index, or linked associations.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Node ID |
| `title` | `--title <value>` | Update node title |
| `config` | `--config '<json>'` | Update node configuration |
| `branchIndex` | `--branch-index <n>` | Update the branch index |
| `updateAssociationValues` | `--update-association-values '<json>'` | Update related associations such as `upstream` |
| request body | `--body '<json>'` or `--body-file <path>` | Full update body |

```bash
nb api workflow flow-nodes update \
  --filter-by-tk 10 \
  --config '{"engine":"math.js","expression":"{{$context.data.price}} * 1.1"}'
```

---

## flow_nodes:destroy

`nb api workflow flow-nodes destroy`

Delete a node. By default, all branch chains under that node are removed too.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Node ID |
| `keepBranch` | `--keep-branch <n>` | Optional branch index to keep and reconnect |

Delete node with all branches:

```bash
nb api workflow flow-nodes destroy --filter-by-tk 10
```

Delete node but keep branch `1`:

```bash
nb api workflow flow-nodes destroy \
  --filter-by-tk 10 \
  --keep-branch 1
```

---

## flow_nodes:destroyBranch

`nb api workflow flow-nodes destroy-branch`

Delete one branch of a branch-capable node.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Parent branch node ID |
| `branchIndex` | `--branch-index <n>` | Branch index to delete |
| `shift` | `--shift 1` | Shift later branch indices forward after deletion |

```bash
nb api workflow flow-nodes destroy-branch \
  --filter-by-tk 5 \
  --branch-index 2 \
  --shift 1
```

---

## flow_nodes:move

`nb api workflow flow-nodes move`

Move a node to a new position by reconnecting the chain.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Node ID to move |
| `upstreamId` | `--upstream-id <id>` | Target upstream node ID; `null` moves to the front |
| `branchIndex` | `--branch-index <n>` | Target branch index; `null` for main chain |
| request body | `--body '<json>'` or `--body-file <path>` | Use this when you need explicit `null` values |

Move node after `nodeId=3` in the main chain:

```bash
nb api workflow flow-nodes move \
  --filter-by-tk 10 \
  --upstream-id 3
```

Move node to the front:

```bash
nb api workflow flow-nodes move \
  --filter-by-tk 10 \
  --body '{"upstreamId":null,"branchIndex":null}'
```

Constraints:

- The workflow version must not have been executed.
- A node cannot be moved under itself.
- Moving to the same position usually returns an error instead of a no-op.

---

## flow_nodes:duplicate

`nb api workflow flow-nodes duplicate`

Duplicate a node to a specified position. The new node copies the source node's `type`, `title`, and `config` unless overridden.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Source node ID |
| `upstreamId` | `--upstream-id <id>` | Upstream node ID for the duplicated node |
| `branchIndex` | `--branch-index <n>` | Branch index for the duplicated node |
| `config` | `--config '<json>'` | Optional configuration override |
| request body | `--body '<json>'` or `--body-file <path>` | Use this when you need explicit `null` values |

```bash
nb api workflow flow-nodes duplicate \
  --filter-by-tk 10 \
  --upstream-id 3
```

Constraints:

- The workflow version must not have been executed.
- Total node count must not exceed `WORKFLOW_NODES_LIMIT`.

---

## flow_nodes:test

`nb api workflow flow-nodes test`

Validate whether a node configuration is executable. Only node types whose instruction implements a `test` method support this operation.

| Field | CLI placement | Description |
|---|---|---|
| `type` | `--type <value>` | Node type |
| `config` | `--config '<json>'` | Node configuration |
| request body | `--body '<json>'` or `--body-file <path>` | Full test body |

```bash
nb api workflow flow-nodes test \
  --type calculation \
  --config '{"engine":"math.js","expression":"1 + 1"}'
```

Successful responses return the test result. Unsupported node types usually return a `test method of instruction "<type>" not implemented` style error.
