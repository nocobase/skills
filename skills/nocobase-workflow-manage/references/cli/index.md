---
title: Workflow CLI
description: Canonical nocobase-ctl command families and argument conventions for workflow-related operations.
---

# Workflow CLI

## Canonical Front Door

- Use runtime-generated `nocobase-ctl workflow ...` commands whenever the CLI is available and the target env has been updated from `swagger:get`.
- Treat this folder as the CLI-first command map for `nocobase-workflow-manage`.
- Treat [../http-api/index.md](../http-api/index.md) as the backend endpoint map and fallback reference for MCP or direct HTTP execution.

## Important Runtime Note

- The canonical families in this folder are `workflow workflows`, `workflow flow-nodes`, `workflow executions`, and `workflow jobs`.
- These are runtime-generated commands. They normally appear under the `nocobase-ctl workflow` namespace only after `nocobase-ctl env update` has pulled the target app's Swagger schema.
- If `nocobase-ctl workflow workflows -h` returns `Command workflow:workflows not found`, the CLI itself may still be installed correctly; the selected env likely has not been updated yet.
- `nocobase-ctl workflow` is the namespace entrypoint. The concrete resource operations are the subtopics beneath it.

## Required CLI Preparation

Before the first workflow command in a task:

```bash
nocobase-ctl --help
nocobase-ctl env --help
```

If the target env is missing or incomplete, repair it first:

```bash
nocobase-ctl env add --name <name> --base-url http://host:port/api --token <token>
nocobase-ctl env use <name>
nocobase-ctl env update
```

After the env is ready:

```bash
nocobase-ctl workflow -h
nocobase-ctl workflow workflows -h
nocobase-ctl workflow flow-nodes -h
nocobase-ctl workflow executions -h
nocobase-ctl workflow jobs -h
```

Before first use of a specific subcommand in the current task:

```bash
nocobase-ctl workflow workflows <subcommand> -h
nocobase-ctl workflow workflows nodes create -h
nocobase-ctl workflow flow-nodes <subcommand> -h
nocobase-ctl workflow executions <subcommand> -h
nocobase-ctl workflow jobs <subcommand> -h
```

## Invocation Conventions

- Generated commands inherit common flags such as `-e, --env`, `-t, --token`, and `-j, --json-output`.
- Query and path parameters usually become kebab-case CLI flags such as `--filter-by-tk`, `--page-size`, `--branch-index`, or `--workflow-id`.
- Array query parameters usually become repeatable flags such as `--appends`, `--except`, and sometimes `--sort`.
- Object or array parameters usually expect JSON strings.
- Body-based writes usually support both generated body-field flags and raw JSON via `--body` / `--body-file`.
- For complex writes, prefer `--body-file <json-file>` over long inline JSON.
- In CLI mode, pass the raw business object itself. Do not wrap it under MCP-specific envelopes such as `requestBody`.

## Command Families

### workflows

Detailed parameters and examples: [workflows.md](workflows.md)

| Task | Canonical command family |
|---|---|
| list workflows | `nocobase-ctl workflow workflows list` |
| inspect one workflow | `nocobase-ctl workflow workflows get` |
| create a workflow | `nocobase-ctl workflow workflows create` |
| update workflow config or status | `nocobase-ctl workflow workflows update` |
| create a new revision | `nocobase-ctl workflow workflows revision` |
| manually execute a workflow | `nocobase-ctl workflow workflows execute` |

### flow_nodes

Detailed parameters and examples: [flow_nodes.md](flow_nodes.md)

| Task | Canonical command family |
|---|---|
| create a node under a workflow | `nocobase-ctl workflow workflows nodes create` |
| update node config or title | `nocobase-ctl workflow flow-nodes update` |
| delete a node | `nocobase-ctl workflow flow-nodes destroy` |
| delete a specific branch | `nocobase-ctl workflow flow-nodes destroy-branch` |
| move a node | `nocobase-ctl workflow flow-nodes move` |
| duplicate a node | `nocobase-ctl workflow flow-nodes duplicate` |
| test node config | `nocobase-ctl workflow flow-nodes test` |

### executions

Detailed parameters and examples: [executions.md](executions.md)

| Task | Canonical command family |
|---|---|
| list execution records | `nocobase-ctl workflow executions list` |
| inspect one execution | `nocobase-ctl workflow executions get` |
| cancel a running execution | `nocobase-ctl workflow executions cancel` |
| delete an execution record | `nocobase-ctl workflow executions destroy` |

### jobs

Detailed parameters and examples: [jobs.md](jobs.md)

| Task | Canonical command family |
|---|---|
| inspect one node job | `nocobase-ctl workflow jobs get` |

## Practical Rules

- Use live `--help` output as the source of truth for exact flag spellings in the current env.
- Use this folder for stable command-family selection, parameter meaning, body shape, and workflow-specific rules.
- When the CLI is unavailable, or the env still cannot expose the required generated family after repair, fall back to [../http-api/index.md](../http-api/index.md).
