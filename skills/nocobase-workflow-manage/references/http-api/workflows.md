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
| `config` | object | Yes | Trigger configuration, structure depends on trigger type, some preset field should be provided when create (also based on trigger type, could check documentation of each trigger), can be updated later through the update API. For example, for a collection trigger, the `collection` field must be provided in config. |

```
POST /api/workflows:create
Body: {
  "title": "New Workflow",
  "type": "collection",
  "sync": false,
  "enabled": false,
  "options": { "deleteExecutionOnStatus": [], "stackLimit": 1 },
  "config": { "collection": "users" }
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

This endpoint duplicates a workflow and its nodes in one of two distinct modes. Users commonly reach same-workflow revision mode by asking to update triggers, nodes, conditions, or logic on a workflow that has already executed; they do not need to say "version". An editable workflow is updated directly without this endpoint. "Copy/duplicate this workflow" ordinarily means an independent workflow. Do not ask a copy-mode follow-up question.

| Copy mode | Intended result and natural-language signals | History and execution-statistics consequence | `filter` query parameter | Returned `key` check |
|---|---|---|---|---|
| Same-workflow revision | Update/adjust trigger, nodes, conditions, or logic when `versionStats.executed > 0`; explicit new version; preserved history | New version is `enabled: false`, `current: false/null`, and its version count starts at zero; previous executions and key-level aggregate count remain | Exact top-level `{"key":"<source-key>"}` | Must equal source `key` |
| Independent workflow copy | Object is the workflow itself; copy/clone workflow; save as; another process/template; statistics start from zero | New workflow is `enabled: false` with its own current version; version and aggregate counts start at zero; execution records/history are not copied; source statistics remain unchanged | Omit `filter` | Must differ from source `key` |

Both modes copy the trigger and node configuration. A same-workflow revision is initially `enabled: false, current: false/null`; an independent workflow is initially `enabled: false` and is the current version of its new `key`.

**Applicable scenario: When a version that has already been executed needs to be modified, a new version must first be created through this interface, and then modify on the new version.**

| Parameter | Description |
|---|---|
| `filterByTk` | Source version workflow ID |
| `filter` | Copy-mode switch. **Required for same-workflow revision** as the exact top-level object `{"key":"abc123"}`; omit it for an independent workflow copy. |

**Creating a new revision** (same workflow, new version):
```
POST /api/workflows:revision?filterByTk=1&filter={"key":"abc123"}
```
The `key` value must match the workflow's `key` field. Returns the new version's workflow object, including the new `id`.

Do not wrap `key` in `$and` or `$or`. The server selects same-workflow revision mode from the top-level `filter.key` property.

The CLI sends the object as a single JSON-encoded query parameter. Equivalent encoded request:

```
POST /api/workflows:revision?filterByTk=1&filter=%7B%22key%22%3A%22abc123%22%7D
```

After query decoding, the action must receive `filter` as `{ "key": "abc123" }`; `key` is not part of the request body.

**Copying as a new independent workflow** (omit `key`):
```
POST /api/workflows:revision?filterByTk=1
```
Without the direct top-level `filter.key`, the API creates a new independent workflow with a new random `key` — it is **not** a revision of the original workflow. Its version and aggregate execution counts start at zero. Only use this when the user intends to duplicate the workflow entity itself.

After either mode, compare the returned `key` with the source `key` before any further mutation. Stop if equality does not match the resolved mode.

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
