---
title: workflows Resource CLI
description: Parameter descriptions and CLI examples for workflows list, get, create, update, destroy, revision, execute, and sync commands.
---

# workflows Resource CLI

> Canonical front door: `nb api workflow workflows`.
>
> Use live `-h` output for the exact flag surface in the current environment, and use this file for the stable parameter meanings and body shapes.

## Help-First Rule

```bash
nb api workflow workflows -h
nb api workflow workflows list -h
nb api workflow workflows get -h
nb api workflow workflows create -h
nb api workflow workflows update -h
nb api workflow workflows destroy -h
nb api workflow workflows revision -h
nb api workflow workflows execute -h
nb api workflow workflows sync -h
nb api workflow workflows nodes create -h
```

For create, update, revision, and execute commands, prefer `--body-file` for non-trivial JSON payloads.

## Common Parameter Mapping

| Business parameter | Typical CLI placement | Notes |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Target workflow ID |
| `filter` | `--filter '<json>'` | JSON filter object |
| `appends[]` | `--appends <name>` | Repeatable flag |
| `except[]` | `--except <name>` | Repeatable flag |
| `sort` | `--sort <value>` | Sorting, prefix with `-` for descending |
| `page` / `pageSize` | `--page <n>` / `--page-size <n>` | Pagination |
| request body fields | dedicated body-field flags or `--body` / `--body-file` | Do not mix the two styles |

---

## workflows:list

`nb api workflow workflows list`

List workflows. Usually only current versions are shown when filtering with `{"current":true}`.

| Parameter | CLI placement | Description |
|---|---|---|
| `filter` | `--filter '<json>'` | Filter conditions, for example `{"current":true}` |
| `sort` | `--sort <value>` | Sorting, for example `-createdAt` |
| `fields[]` | `--fields <json>` | Optional returned fields |
| `appends[]` | `--appends <name>` | Append associations such as `stats` or `versionStats` |
| `except[]` | `--except <name>` | Exclude fields such as `config` to reduce output size |
| `page` / `pageSize` | `--page <n>` / `--page-size <n>` | Pagination |

```bash
nb api workflow workflows list \
  --filter '{"current":true}' \
  --sort -createdAt \
  --except config \
  --appends stats \
  --appends versionStats
```

---

## workflows:get

`nb api workflow workflows get`

Get one workflow. Append `versionStats` when checking whether the version is editable, and append `nodes` when arranging node chains.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Workflow ID |
| `filter` | `--filter '<json>'` | Optional JSON filter when not reading by ID |
| `appends[]` | `--appends <name>` | Append associations such as `nodes`, `stats`, `versionStats`, or `executions` |
| `except[]` | `--except <name>` | Exclude fields from response |

```bash
nb api workflow workflows get \
  --filter-by-tk 1 \
  --appends nodes \
  --appends versionStats
```

---

## workflows:create

`nb api workflow workflows create`

Create a workflow. The `type` and `sync` fields are create-time decisions.

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Workflow name |
| `type` | string | Yes | Trigger type, see trigger references |
| `sync` | boolean | Yes | Synchronous or asynchronous mode; immutable after creation |
| `enabled` | boolean | No | Keep `false` until configuration is complete |
| `description` | string | No | Description |
| `triggerTitle` | string | No | Trigger display label |
| `options` | object | No | Engine options such as `deleteExecutionOnStatus` and `stackLimit` |
| `categories` | number[] | No | Workflow category IDs |
| `config` | object | Yes | Trigger configuration; required shape depends on trigger type |

Preferred body-file example:

```json
{
  "title": "New Workflow",
  "type": "collection",
  "sync": false,
  "enabled": false,
  "options": {
    "deleteExecutionOnStatus": [],
    "stackLimit": 1
  },
  "config": {
    "collection": "users"
  }
}
```

```bash
nb api workflow workflows create --body-file ./workflow-create.json
```

Inline example:

```bash
nb api workflow workflows create \
  --title 'New Workflow' \
  --type collection \
  --config '{"collection":"users"}' \
  --options '{"deleteExecutionOnStatus":[],"stackLimit":1}'
```

Returns the newly created workflow object, including `id` and `key`.

---

## workflows:update

`nb api workflow workflows update`

Update a workflow. Typical updates include `title`, `description`, `enabled`, `triggerTitle`, `config`, `options`, and `categories`.

**Note: Versions that have already been executed (`versionStats.executed > 0`) are not allowed to update `config`. Create a new revision first.**

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Workflow ID |
| `title` | `--title <value>` | Update workflow title |
| `enabled` | `--enabled` | Enable the workflow |
| `description` | `--description <value>` | Update description |
| `triggerTitle` | `--trigger-title <value>` | Update trigger display label |
| `config` | `--config '<json>'` | Update trigger configuration |
| `options` | `--options '<json>'` | Update engine options |
| `categories` | `--categories '<json>'` | Update category IDs |
| request body | `--body '<json>'` or `--body-file <path>` | Full update body |

Configure trigger example:

```bash
nb api workflow workflows update \
  --filter-by-tk 1 \
  --config '{"collection":"users","mode":1,"changed":[],"condition":{"$and":[]}}'
```

Enable workflow example:

```bash
nb api workflow workflows update \
  --filter-by-tk 1 \
  --enabled
```

---

## workflows:destroy

`nb api workflow workflows destroy`

Delete one or more workflows. If the target is the current version, historical versions with the same `key` may also be deleted.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Workflow ID |
| `filter` | `--filter '<json>'` | Optional batch-deletion filter |

```bash
nb api workflow workflows destroy --filter-by-tk 1
```

This command is intentionally not part of the normal skill write path; use only when the user explicitly asks for workflow deletion and the operation has been separately reviewed.

---

## workflows:revision

`nb api workflow workflows revision`

Create a new version from an existing version. The new version keeps the same `key` only when `filter.key` is provided.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Source workflow version ID |
| `filter` | `--filter '<json>'` | Must contain the workflow `key` for same-workflow revision |
| `title` | `--title <value>` | Optional override title |
| `enabled` | `--enabled` | Optional override enabled state |
| `current` | `--current` | Optional override current-version flag |
| request body | `--body '<json>'` or `--body-file <path>` | Full override body |

Creating a new revision of the same workflow:

```bash
nb api workflow workflows revision \
  --filter-by-tk 1 \
  --filter '{"key":"abc123"}'
```

Copying as a new independent workflow:

```bash
nb api workflow workflows revision --filter-by-tk 1
```

Without `filter.key`, the server creates a separate workflow with a new random `key`.

---

## workflows:execute

`nb api workflow workflows execute`

Manually trigger workflow execution. The request body is treated as the trigger context/input.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Workflow ID |
| `autoRevision` | `--auto-revision 1` | Automatically create a new version after first execution |
| request body | `--body '<json>'` or `--body-file <path>` | Trigger input payload |

```bash
nb api workflow workflows execute \
  --filter-by-tk 1 \
  --auto-revision 1 \
  --body '{"data":{"id":1,"name":"test"}}'
```

Returns execution information such as:

```json
{
  "execution": {
    "id": 10,
    "status": 1
  },
  "newVersionId": 2
}
```

---

## workflows:sync

`nb api workflow workflows sync`

Re-register one or more workflows in the trigger system. Use this after configuration has been changed outside the normal workflow APIs.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Workflow ID |
| `filter` | `--filter '<json>'` | Batch selection filter |

```bash
nb api workflow workflows sync --filter-by-tk 1
```

Returns HTTP `204 No Content` on success.
