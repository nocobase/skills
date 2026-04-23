---
title: executions Resource CLI
description: Parameter descriptions and CLI examples for listing, inspecting, cancelling, and deleting workflow execution records.
---

# executions Resource CLI

> Canonical front door: `nb api workflow executions`.
>
> Use live `-h` output to confirm the exact flag surface, and use this file for stable parameter meanings and diagnostic patterns.

## Help-First Rule

```bash
nb api workflow executions -h
nb api workflow executions list -h
nb api workflow executions get -h
nb api workflow executions cancel -h
nb api workflow executions destroy -h
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

`nb api workflow executions list`

List execution records. Usually filter by `workflowId` and sort by descending ID.

| Parameter | CLI placement | Description |
|---|---|---|
| `filter` | `--filter '<json>'` | Filter conditions, for example `{"workflowId":1}` |
| `appends[]` | `--appends <name>` | Optional associations such as `jobs` or `workflow` |
| `except[]` | `--except <name>` | Exclude fields to reduce payload |
| `sort` | `--sort <value>` | Sorting, for example `-id` |
| `page` / `pageSize` | `--page <n>` / `--page-size <n>` | Pagination |

```bash
nb api workflow executions list \
  --filter '{"workflowId":1}' \
  --sort -id \
  --page 1 \
  --page-size 20
```

---

## executions:get

`nb api workflow executions get`

Get one execution record. When diagnosing failures, append `jobs`, `workflow`, and `workflow.nodes`, and initially exclude `jobs.result` to reduce payload size.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Execution ID |
| `appends[]` | `--appends <name>` | Append associations such as `jobs`, `workflow`, `workflow.nodes`, or workflow stats |
| `except[]` | `--except <name>` | Exclude fields such as `jobs.result` during first pass |

Failure diagnosis read:

```bash
nb api workflow executions get \
  --filter-by-tk 10 \
  --appends jobs \
  --appends workflow \
  --appends workflow.nodes \
  --except jobs.result
```

Full result read:

```bash
nb api workflow executions get \
  --filter-by-tk 10 \
  --appends jobs \
  --appends workflow \
  --appends workflow.nodes
```

---

## executions:cancel

`nb api workflow executions cancel`

Cancel a running execution record. Typically used only when the execution status is still `0`.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Execution ID |

```bash
nb api workflow executions cancel --filter-by-tk 10
```

The execution status and pending jobs usually become `ABORTED (-3)`.

---

## executions:destroy

`nb api workflow executions destroy`

Delete one or more execution records. Running executions cannot be deleted before they are cancelled.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Execution ID |
| `filter` | `--filter '<json>'` | Optional batch-deletion filter |

Delete one execution:

```bash
nb api workflow executions destroy --filter-by-tk 10
```

Delete multiple finished executions:

```bash
nb api workflow executions destroy \
  --filter '{"status":{"$ne":0},"workflowId":1}'
```
