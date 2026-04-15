---
title: executions Resource CLI
description: Parameter descriptions and CLI examples for listing, inspecting, cancelling, and deleting workflow execution records.
---

# executions Resource CLI

> Canonical front door: `nocobase-ctl workflow executions`.
>
> Use live `--help` to confirm the exact generated flag surface in the current env, and use this file for stable parameter meanings and diagnostic patterns.

## Help-First Rule

```bash
nocobase-ctl workflow executions -h
nocobase-ctl workflow executions list -h
nocobase-ctl workflow executions get -h
nocobase-ctl workflow executions cancel -h
nocobase-ctl workflow executions destroy -h
```

## Common Parameter Mapping

| Business parameter | Typical CLI placement | Notes |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Target execution ID |
| `filter` | `--filter '<json>'` | JSON filter object |
| `appends[]` | `--appends <name>` | Repeatable flag |
| `except[]` | `--except <name>` | Repeatable flag |
| `sort` | `--sort <value>` | Sort order |
| `page` / `pageSize` | `--page <n>` / `--page-size <n>` | Pagination |

---

## executions:list

`nocobase-ctl workflow executions list`

List execution records. Usually filter by `workflowId` and sort by descending ID.

| Parameter | CLI placement | Description |
|---|---|---|
| `filter` | `--filter '<json>'` | Filter conditions, for example `{"workflowId":1}` |
| `sort` | `--sort <value>` | Sorting, for example `-id` |
| `page` / `pageSize` | `--page <n>` / `--page-size <n>` | Pagination |

```bash
nocobase-ctl workflow executions list \
  --filter '{"workflowId":1}' \
  --sort -id \
  --page 1 \
  --page-size 20
```

---

## executions:get

`nocobase-ctl workflow executions get`

Get one execution record. When diagnosing failures, append `jobs` and `workflow.nodes`, and initially exclude `jobs.result` to reduce payload size.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Execution ID |
| `appends[]` | `--appends <name>` | Append associations such as `jobs`, `workflow`, or `workflow.nodes` |
| `except[]` | `--except <name>` | Exclude fields such as `jobs.result` during first pass |

Failure diagnosis read:

```bash
nocobase-ctl workflow executions get \
  --filter-by-tk 10 \
  --appends jobs \
  --appends workflow.nodes \
  --except jobs.result
```

Full result read:

```bash
nocobase-ctl workflow executions get \
  --filter-by-tk 10 \
  --appends jobs \
  --appends workflow.nodes
```

---

## executions:cancel

`nocobase-ctl workflow executions cancel`

Cancel a running execution record. Typically used only when the execution status is still `0`.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Execution ID |

```bash
nocobase-ctl workflow executions cancel --filter-by-tk 10
```

The execution status and pending jobs usually become `ABORTED (-3)`.

---

## executions:destroy

`nocobase-ctl workflow executions destroy`

Delete an execution record. Running executions cannot be deleted before they are cancelled.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Execution ID |

```bash
nocobase-ctl workflow executions destroy --filter-by-tk 10
```
