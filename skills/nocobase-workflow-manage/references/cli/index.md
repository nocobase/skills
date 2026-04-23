---
title: Workflow CLI
description: Canonical nb command families and argument conventions for workflow-related operations.
---

# Workflow CLI

## Canonical Front Door

- Use `nb api workflow ...` for all workflow operations.
- Treat this folder as the CLI-first command map for `nocobase-workflow-manage`.
- Treat [../http-api/index.md](../http-api/index.md) as the backend endpoint map only when you need to understand the underlying API semantics.

## Required CLI Checks

Before the first workflow command in a task:

```bash
nb api workflow -h
nb api workflow workflows -h
nb api workflow flow-nodes -h
nb api workflow executions -h
nb api workflow jobs -h
```

Before first use of a specific subcommand in the current task:

```bash
nb api workflow workflows <subcommand> -h
nb api workflow workflows nodes create -h
nb api workflow flow-nodes <subcommand> -h
nb api workflow executions <subcommand> -h
nb api workflow jobs <subcommand> -h
```

## Invocation Conventions

- Common connection flags are shared across commands: `--base-url`, `-e/--env`, `--role`, `-t/--token`, `-j/--json-output`.
- Query parameters usually become kebab-case flags such as `--filter-by-tk`, `--page-size`, `--branch-index`, or `--workflow-id`.
- Array query parameters are repeatable flags such as `--appends` and `--except`.
- JSON fields expect JSON strings.
- Write operations usually support both body-field flags and raw JSON via `--body` / `--body-file`.
- For complex writes, prefer `--body-file <json-file>` over long inline JSON.
- Do not mix body-field flags with `--body` or `--body-file` in the same command.

## Command Families

### workflows

Detailed parameters and examples: [workflows.md](workflows.md)

| Task | Canonical command family |
|---|---|
| list workflows | `nb api workflow workflows list` |
| inspect one workflow | `nb api workflow workflows get` |
| create a workflow | `nb api workflow workflows create` |
| update workflow config or status | `nb api workflow workflows update` |
| create a new revision | `nb api workflow workflows revision` |
| manually execute a workflow | `nb api workflow workflows execute` |
| reload trigger registration | `nb api workflow workflows sync` |
| delete workflows | `nb api workflow workflows destroy` |

### flow_nodes

Detailed parameters and examples: [flow_nodes.md](flow_nodes.md)

| Task | Canonical command family |
|---|---|
| create a node under a workflow | `nb api workflow workflows nodes create` |
| inspect one node | `nb api workflow flow-nodes get` |
| update node config or title | `nb api workflow flow-nodes update` |
| delete a node | `nb api workflow flow-nodes destroy` |
| delete a specific branch | `nb api workflow flow-nodes destroy-branch` |
| move a node | `nb api workflow flow-nodes move` |
| duplicate a node | `nb api workflow flow-nodes duplicate` |
| test node config | `nb api workflow flow-nodes test` |

### executions

Detailed parameters and examples: [executions.md](executions.md)

| Task | Canonical command family |
|---|---|
| list execution records | `nb api workflow executions list` |
| inspect one execution | `nb api workflow executions get` |
| cancel a running execution | `nb api workflow executions cancel` |
| delete execution records | `nb api workflow executions destroy` |

### jobs

Detailed parameters and examples: [jobs.md](jobs.md)

| Task | Canonical command family |
|---|---|
| inspect one node job | `nb api workflow jobs get` |
| list job records | `nb api workflow jobs list` |
| resume a paused job | `nb api workflow jobs resume` |

## Practical Rules

- Use live `-h` output as the source of truth for exact flag spellings.
- Use this folder for stable command-family selection, parameter meaning, body shape, and workflow-specific rules.
- Prefer `--body-file` whenever the JSON body is non-trivial or contains `null` values that are awkward to express through flags.
