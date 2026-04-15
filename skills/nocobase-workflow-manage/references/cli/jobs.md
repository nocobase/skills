---
title: jobs Resource CLI
description: Parameter descriptions and CLI examples for reading detailed workflow job records.
---

# jobs Resource CLI

> Canonical front door: `nocobase-ctl workflow jobs`.
>
> Use this command after narrowing the failing node or job through `nocobase-ctl workflow executions get`.

## Help-First Rule

```bash
nocobase-ctl workflow jobs -h
nocobase-ctl workflow jobs get -h
```

## jobs:get

`nocobase-ctl workflow jobs get`

Get full details of one node job, including the `result` field.

Usually, the first execution read excludes `jobs.result` through `nocobase-ctl workflow executions get --except jobs.result`. When you need the detailed output or error payload of one node, load that job separately here.

| Parameter | CLI placement | Description |
|---|---|---|
| `filterByTk` | `--filter-by-tk <id>` | Job ID |

```bash
nocobase-ctl workflow jobs get --filter-by-tk 42
```

The returned job object typically includes:

- `status`: node execution status
- `result`: node output or error details
- `nodeId` / `nodeKey`: identifiers of the corresponding workflow node
