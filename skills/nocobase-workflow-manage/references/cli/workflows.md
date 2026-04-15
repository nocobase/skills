---
title: workflows Resource CLI
description: Parameter descriptions and CLI examples for workflows list, get, create, update, revision, and execute commands.
---

# workflows Resource CLI

> Canonical front door: `nocobase-ctl workflow workflows`.
>
> The exact flag surface is generated from the target app's Swagger schema. Use live `--help` for the current env, and use this file for the stable parameter meanings and body shapes.

## Help-First Rule

```bash
nocobase-ctl workflow workflows -h
nocobase-ctl workflow workflows list -h
nocobase-ctl workflow workflows get -h
nocobase-ctl workflow workflows create -h
nocobase-ctl workflow workflows update -h
nocobase-ctl workflow workflows revision -h
nocobase-ctl workflow workflows execute -h
nocobase-ctl workflow workflows nodes create -h
```

For create, update, and execute commands, prefer `--body-file` for non-trivial JSON payloads.

## Common Parameter Mapping

| Business parameter | Typical CLI placement | Notes |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Target workflow ID |
| `filter` | `--filter '<json>'` | JSON filter object |
| `appends[]` | `--appends <name>` | Repeatable flag |
| `except[]` | `--except <name>` | Repeatable flag |
| `sort` | `--sort <value>` | Usually repeatable |
| `page` / `pageSize` | `--page <n>` / `--page-size <n>` | Pagination |
| request body fields | `--body '<json>'` or `--body-file <path>` | Raw business object |

---

## workflows:list

`nocobase-ctl workflow workflows list`

List workflows. Usually only current versions are shown when filtering with `{"current": true}`.

| Parameter | CLI placement | Description |
|---|---|---|
| `filter` | `--filter '<json>'` | Filter conditions, for example `{"current":true}` |
| `sort` | `--sort <value>` | Sorting, for example `-createdAt` |
| `appends[]` | `--appends <name>` | Append associations such as `stats` or `versionStats` |
| `except[]` | `--except <name>` | Exclude fields such as `config` to reduce output size |
| `page` / `pageSize` | `--page <n>` / `--page-size <n>` | Pagination |

```bash
nocobase-ctl workflow workflows list \
  --filter '{"current":true}' \
  --sort -createdAt \
  --except config \
  --appends stats \
  --appends versionStats
```

---

## workflows:get

`nocobase-ctl workflow workflows get`

Get one workflow. Append `versionStats` when checking whether the version is editable, and append `nodes` when arranging node chains.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Workflow ID |
| `filter` | `--filter '<json>'` | Optional JSON filter when not reading by ID |
| `appends[]` | `--appends <name>` | Append associations such as `nodes` or `versionStats` |

```bash
nocobase-ctl workflow workflows get \
  --filter-by-tk 1 \
  --appends nodes \
  --appends versionStats
```

---

## workflows:create

`nocobase-ctl workflow workflows create`

Create a workflow. The `sync` field cannot be modified after creation and must be decided here.

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Workflow name |
| `type` | string | Yes | Trigger type, see trigger references |
| `sync` | boolean | Yes | Synchronous or asynchronous mode; immutable after creation |
| `enabled` | boolean | No | Recommended to keep `false` until configuration is complete |
| `description` | string | No | Description |
| `options` | object | No | Engine options such as `deleteExecutionOnStatus` and `stackLimit` |
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
nocobase-ctl workflow workflows create --body-file ./workflow-create.json
```

Inline example:

```bash
nocobase-ctl workflow workflows create \
  --body '{"title":"New Workflow","type":"collection","sync":false,"enabled":false,"options":{"deleteExecutionOnStatus":[],"stackLimit":1},"config":{"collection":"users"}}'
```

Returns the newly created workflow object, including `id` and `key`.

---

## workflows:update

`nocobase-ctl workflow workflows update`

Update a workflow. Typical updates include `title`, `description`, `enabled`, `triggerTitle`, `config`, `options`, and `categories`.

**Note: Versions that have already been executed (`versionStats.executed > 0`) are not allowed to update `config`. Create a new revision first.**

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Workflow ID |
| body fields | `--body '<json>'` or `--body-file <path>` | Fields to update |

Configure trigger example:

```bash
nocobase-ctl workflow workflows update \
  --filter-by-tk 1 \
  --body '{"config":{"collection":"users","mode":1,"changed":[],"condition":{"$and":[]}}}'
```

Enable workflow example:

```bash
nocobase-ctl workflow workflows update \
  --filter-by-tk 1 \
  --body '{"enabled":true}'
```

---

## workflows:destroy

`nocobase-ctl workflow workflows destroy`

Delete a workflow. If the target is the current version, historical versions with the same `key` may also be deleted.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Workflow ID |
| `filter` | `--filter '<json>'` | Optional batch-deletion filter |

```bash
nocobase-ctl workflow workflows destroy --filter-by-tk 1
```

This command is intentionally not part of the normal skill write path; use only when the user explicitly asks for workflow deletion and the operation has been separately reviewed.

---

## workflows:revision

`nocobase-ctl workflow workflows revision`

Create a new version from an existing version. The new version keeps the same `key` only when the `filter.key` value is provided.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Source workflow version ID |
| `filter` | `--filter '<json>'` | Must contain the workflow `key` for same-workflow revision |

Creating a new revision of the same workflow:

```bash
nocobase-ctl workflow workflows revision \
  --filter-by-tk 1 \
  --filter '{"key":"abc123"}'
```

Copying as a new independent workflow:

```bash
nocobase-ctl workflow workflows revision --filter-by-tk 1
```

Without `filter.key`, the server creates a separate workflow with a new random `key`.

---

## workflows:execute

`nocobase-ctl workflow workflows execute`

Manually trigger workflow execution. The CLI help for the current env should be treated as the source of truth for the exact body shape.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Workflow ID |
| `autoRevision` | `--auto-revision 1` | Automatically creates a new version after first execution |
| request body | `--body '<json>'` or `--body-file <path>` | Trigger input payload |

```bash
nocobase-ctl workflow workflows execute \
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
