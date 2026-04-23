---
title: jobs Resource CLI
description: Parameter descriptions and CLI examples for reading, listing, and resuming workflow job records.
---

# jobs Resource CLI

> Canonical front door: `nb api workflow jobs`.
>
> Use these commands after narrowing the failing or waiting node through `nb api workflow executions get`.

## Help-First Rule

```bash
nb api workflow jobs -h
nb api workflow jobs get -h
nb api workflow jobs list -h
nb api workflow jobs resume -h
```

## jobs:get

`nb api workflow jobs get`

Get full details of one node job, including the `result` field.

Usually, the first execution read excludes `jobs.result` through `nb api workflow executions get --except jobs.result`. When you need the detailed output or error payload of one node, load that job separately here.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Job ID |
| `appends[]` | `--appends <name>` | Optional associations |

```bash
nb api workflow jobs get --filter-by-tk 42
```

The returned job object typically includes:

- `status`: node execution status
- `result`: node output or error details
- `nodeId` / `nodeKey`: identifiers of the corresponding workflow node

---

## jobs:list

`nb api workflow jobs list`

List node job records. In most debugging flows, `executions:get` with `--appends jobs` is still more convenient.

| Parameter | CLI placement | Description |
|---|---|---|
| `filter` | `--filter '<json>'` | Filter conditions, for example `{"executionId":1}` or `{"nodeId":2}` |
| `appends[]` | `--appends <name>` | Optional associations |
| `sort` | `--sort <value>` | Sort order |
| `page` / `pageSize` | `--page <n>` / `--page-size <n>` | Pagination |

```bash
nb api workflow jobs list \
  --filter '{"executionId":10}' \
  --sort -id
```

---

## jobs:resume

`nb api workflow jobs resume`

Update a waiting job's fields and resume the paused execution asynchronously.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Job ID |
| `status` | `--status <value>` | Job status, for example `1`, `-1`, `-3`, `-4`, `-5` |
| `result` | `--result '<json>'` | Result data stored on the job |
| `meta` | `--meta '<json>'` | Additional metadata |
| request body | `--body '<json>'` or `--body-file <path>` | Full resume body |

```bash
nb api workflow jobs resume \
  --filter-by-tk 42 \
  --status 1 \
  --result '{"approved":true,"comment":"ok"}'
```

Returns HTTP `202 Accepted` with the updated job.
