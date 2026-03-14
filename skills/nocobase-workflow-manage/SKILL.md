---
name: nocobase-workflow-manage
description: Orchestrate and manage NocoBase workflows via MCP — create/update/delete workflows, add and configure nodes, inspect executions and job results. Use when users want to build, edit, test, or analyze workflow automation logic in NocoBase.
argument-hint: "[task: create|list|get|update|delete|revision|execute|node-create|node-update|node-move|node-copy|node-delete|node-test|execution-list|execution-get|execution-cancel|jobs-get]"
allowed-tools: All MCP tools provided by NocoBase server
---

# Goal

Help users orchestrate NocoBase workflows end-to-end through NocoBase MCP tools: design trigger logic, build node chains, manage versions, and inspect execution results.

# Dependency Gate

- Related helper skills: `nocobase-mcp-setup`, `nocobase-data-modeling`.
- Check whether NocoBase MCP tools are available before planning write operations.
- If MCP is not configured, guide the user to use `nocobase-mcp-setup`.
- Data modeling skill may be used to understand related collections and fields when configuring workflow triggers and nodes.

# Mandatory MCP Gate

- Confirm the NocoBase MCP server is reachable and authenticated before attempting workflow operations.
- Do not proceed with any workflow mutation until the MCP server exposes the relevant workflow endpoints.

# Orchestration Process

## Planning Phase

Before making any MCP calls, clarify with the user:
1. **Trigger type** — what event starts the workflow? → see [Trigger Reference](references/triggers/index.md)
2. **Node chain** — what processing steps are needed? → see [Node Reference](references/nodes/index.md)
3. **Execution mode** — synchronous or async? See [sync vs async](references/modeling/index.md#同步与异步模式)

Summarize the plan in natural language before executing.

Then map the requested action to the corresponding MCP-exposed endpoint:
- Workflow CRUD and revisions → `workflows:*`
- Node operations → `workflows/<workflowId>/nodes:create` and `flow_nodes:*`
- Execution inspection → `executions:*`
- Job detail inspection → `jobs:get`

## Creating a New Workflow

1. **Create workflow** → `POST /api/workflows:create` with `type`, `title`, `sync`, `enabled: false`
2. **Configure trigger** → `POST /api/workflows:update?filterByTk=<id>` with `config`
3. **Add nodes in order** → `POST /api/workflows/<workflowId>/nodes:create` for each node, chaining via `upstreamId`
4. **Configure each node** → `POST /api/flow_nodes:update?filterByTk=<nodeId>` with `config`
5. **Enable workflow** → `POST /api/workflows:update?filterByTk=<id>` with `enabled: true`
6. **Test / verify** → `POST /api/workflows:execute?filterByTk=<id>&autoRevision=1`

## Editing an Existing Workflow

1. **Fetch workflow with nodes and version stats**
   → `GET /api/workflows:get?filterByTk=<id>&appends[]=nodes&appends[]=versionStats`
2. **Check if version is frozen** (`versionStats.executed > 0`)
   - **Yes → create a new revision first**:
     `POST /api/workflows:revision?filterByTk=<id>&filter[key]=<key>`
     Use the returned new `id` for all subsequent operations.
   - **No → proceed directly**
3. **Edit as needed**:
   - Update trigger config → `POST /api/workflows:update?filterByTk=<id>` with `config`
   - Add node → `POST /api/workflows/<workflowId>/nodes:create`
   - Update node config → `POST /api/flow_nodes:update?filterByTk=<nodeId>`
   - Delete node → `POST /api/flow_nodes:destroy?filterByTk=<nodeId>`
   - Move node → `POST /api/flow_nodes:move?filterByTk=<nodeId>`
   - Copy node → `POST /api/flow_nodes:duplicate?filterByTk=<nodeId>`
4. **Enable (if needed)** → `POST /api/workflows:update?filterByTk=<id>` with `enabled: true`

## Diagnosing a Failed Execution

1. **List executions** to find the failed one:
   `GET /api/executions:list?filter[workflowId]=<id>&sort=-id`
2. **Get execution detail** with jobs (exclude result to reduce size):
   `GET /api/executions:get?filterByTk=<execId>&appends[]=jobs&appends[]=workflow.nodes&except[]=jobs.result`
3. **Find the failed job** — look for `job.status` values of `-1` (FAILED), `-2` (ERROR), or `-3` (ABORTED)
4. **Get full job detail** to see the error:
   `GET /api/jobs:get?filterByTk=<jobId>`
   Inspect `result` for the error message or output that caused the failure.
5. Fix the issue (update node config or create a new revision if version is frozen), then re-execute.

# Reference Index

| Topic | File |
|---|---|
| Architecture, data model & concepts | [references/modeling/index.md](references/modeling/index.md) |
| Triggers | [references/triggers/index.md](references/triggers/index.md) |
| Nodes | [references/nodes/index.md](references/nodes/index.md) |
| Endpoint mapping used through MCP | [references/http-api/index.md](references/http-api/index.md) |
