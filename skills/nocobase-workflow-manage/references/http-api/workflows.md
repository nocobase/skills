---
title: workflows Resource HTTP API
description: Parameter descriptions and call examples for workflows resource CRUD, version management, and manual execution interfaces.
---

# workflows Resource HTTP API

> These endpoints are exposed through the NocoBase MCP tool; the following HTTP paths are used to map specific resource actions and parameters.

## workflows:list

`GET /api/workflows:list`

List workflows. Usually only lists versions where `current: true` (only shows the current version of each workflow).

| Parameter | Description |
|---|---|
| `filter` | Filter conditions, e.g., `{"current":true}` |
| `sort` | Sorting, e.g., `-createdAt` |
| `appends[]` | Append associations, e.g., `stats`, `versionStats` |
| `except[]` | Exclude fields, e.g., `config` (to reduce response size) |
| `page` / `pageSize` | Pagination |

```
GET /api/workflows:list?filter[current]=true&sort=-createdAt&except[]=config&appends[]=stats&appends[]=versionStats
```

---

## workflows:get

`GET /api/workflows:get`

Get a single workflow. Include `versionStats` when checking if it's editable, and `nodes` when arranging nodes.

| Parameter | Description |
|---|---|
| `filterByTk` | Workflow ID |
| `appends[]` | Append associations, e.g., `nodes`, `versionStats` |

```
GET /api/workflows:get?filterByTk=1&appends[]=nodes&appends[]=versionStats
```

---

## workflows:create

`POST /api/workflows:create`

Create a workflow. The `sync` field cannot be modified after creation and must be determined here.

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Workflow name |
| `type` | string | Yes | Trigger type, see trigger documentation |
| `sync` | boolean | Yes | Synchronous (true) or asynchronous (false) mode, cannot be changed after creation |
| `enabled` | boolean | No | Whether it's enabled; recommended to set to false first and enable after configuration is complete |
| `description` | string | No | Description |
| `options` | object | No | Engine options, e.g., `deleteExecutionOnStatus`, `stackLimit` |

```
POST /api/workflows:create
Body: {
  "title": "New Workflow",
  "type": "collection",
  "sync": false,
  "enabled": false,
  "options": { "deleteExecutionOnStatus": [], "stackLimit": 1 }
}
```

Returns the newly created workflow object, including `id` and `key`.

---

## workflows:update

`POST /api/workflows:update`

Update a workflow. Whitelist fields: `title`, `description`, `enabled`, `triggerTitle`, `config`, `options`, `categories`.

**Note: Versions that have already been executed (`versionStats.executed > 0`) are not allowed to update `config`.**

| Parameter | Description |
|---|---|
| `filterByTk` | Workflow ID (Query) |
| Body | Fields to be updated |

```
# Configure trigger
POST /api/workflows:update?filterByTk=1
Body: {
  "config": {
    "collection": "users",
    "mode": 1,
    "changed": [],
    "condition": { "$and": [] }
  }
}

# Enable workflow
POST /api/workflows:update?filterByTk=1
Body: { "enabled": true }
```

---

## workflows:destroy

`POST /api/workflows:destroy`

Delete a workflow. If `filterByTk` points to the current version, all historical versions with the same `key` will also be deleted.

```
POST /api/workflows:destroy?filterByTk=1
```

---

## workflows:revision

`POST /api/workflows:revision`

Create a new version based on an existing version (same `key`). The new version is initially `enabled: false, current: false`, with the same node configuration as the original version.

**Applicable scenario: When a version that has already been executed needs to be modified, a new version must first be created through this interface, and then modify on the new version.**

| Parameter | Description |
|---|---|
| `filterByTk` | Source version workflow ID |
| `filter` | JSON object containing the key of the workflow, ensuring the new version belongs to the same key |

```
POST /api/workflows:revision?filterByTk=1&filter={"key":"abc123"}
```

Returns the new version's workflow object, including the new `id`.

If `filter[key]` not provided, the API will create a new independent workflow (not a revision) with a new random `key`. Only use when you want to create a new workflow with the same configuration as an existing workflow but do not want it to be a revision of the existing workflow.

---

## workflows:execute

`POST /api/workflows:execute`

Manually trigger workflow execution, usually used for testing. The structure of `values` depends on the trigger type.

| Parameter | Description |
|---|---|
| `filterByTk` | workflow ID |
| `autoRevision` | `1` means a new version is automatically created after the first execution, and subsequent modifications are made on the new version |
| Body `values` | Trigger input data |

```
POST /api/workflows:execute?filterByTk=1&autoRevision=1
Body: {
  "values": { "data": { "id": 1, "name": "test" } }
}
```

Returns: `{ "execution": { "id": 10, "status": 1 }, "newVersionId": 2 }`
