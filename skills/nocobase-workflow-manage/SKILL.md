---
name: nocobase-workflow-manage
description: Use when users need to inspect, create, revise, enable, or diagnose NocoBase workflows through MCP, including trigger selection, node-chain changes, version safety checks, and execution troubleshooting.
argument-hint: "[action: inspect|create|update|enable|diagnose|delete-node|delete-branch] [target: workflow|node|execution] [workflow-id|workflow-key|title] [options]"
allowed-tools: "MCP(workflows:list|get|create|update|revision|execute, workflows/<workflowId>/nodes:create, flow_nodes:update|destroy|destroyBranch|move|duplicate|test, executions:list|get, jobs:get), Read(local skill references only)"
---

# Goal

Orchestrate NocoBase workflows end-to-end: design trigger logic, build node chains, manage versions, and inspect execution results.

# Scope

- Handle: inspect workflow definitions, nodes, version state, executions, and failed jobs.
- Handle: create new workflows for business targets, then configure triggers and nodes sequentially.
- Handle: update existing workflows by creating a new revision first when the current version is frozen.
- Handle: enable workflows, move/duplicate/delete nodes or branches, and execute workflows only after explicit high-risk confirmation.
- Handle: diagnose failed executions and identify the failed job, node, or configuration mismatch.

# Non-Goals

- Do not handle MCP installation, login, or token recovery. Hand off to `nocobase-mcp-setup`.
- Do not design data models, collections, or field schemas from scratch. Hand off to `nocobase-data-modeling`.
- Do not invent filter syntax, evaluator functions, node types, trigger types, collection names, field names, or node keys.
- Do not bypass workflow-specific MCP interfaces with generic CRUD or local source edits.
- Do not delete whole workflows in this skill. If a user explicitly wants workflow deletion, stop and request a separately reviewed path.

# Transport Preferences

Prefer the transport in this order:

- Use the `nocobase-ctl` CLI whenever it is available
- If the CLI is available but not authenticated for the target app, stop and guide the user to authenticate the CLI instead of switching to MCP.
- Only fall back to MCP or another transport when the CLI itself is unavailable.
- If MCP is not configured, guide the user to use `nocobase-mcp-setup`.
- If MCP tools return authentication errors such as `Auth required`, stop and ask the user to complete MCP authentication or refresh the MCP connection before continuing.

# Dependency Gate

- CLI or MCP must be available and authenticated to perform workflow operations. If neither is available, stop and guide the user to set up the necessary transport.
- Related helper skills: `nocobase-data-modeling`, `nocobase-utils`.
- Data modeling skill may be used to understand related collections and fields when configuring workflow triggers and nodes.
- When configuring `expression` fields in Calculation, Condition, or Multi-condition nodes, consult `nocobase-utils` for the authoritative function list of each engine. **Never fabricate function names** — verify against [formula.js reference](references/nodes/../../../../../skills/skills/nocobase-utils/references/evaluators/formulajs.md) or [math.js reference](references/nodes/../../../../../skills/skills/nocobase-utils/references/evaluators/mathjs.md).

# Mandatory Clarification Gate

- Max clarification rounds: `2`
- Max questions per round: `3`
- Mutation preconditions:
- CLI or MCP is reachable and authenticated.
- The requested action is confirmed.
- The target workflow is uniquely resolved for non-create actions.
- For `create`, the trigger type and initial node chain are confirmed.
- For `update`, `delete-node`, and `delete-branch`, the exact target node or branch and intended end state are confirmed.
- If the existing workflow version has `versionStats.executed > 0`, a new revision is created before any node or trigger mutation.
- If any precondition is missing or ambiguous, stop and report what is missing instead of guessing.

# Hard Rules

1. **Never create a workflow with `enabled: true`** — always create with `enabled: false`, complete all trigger and node configuration, then enable.
2. **Never edit a frozen version directly** — if `versionStats.executed > 0`, create a new revision first via `workflows:revision`. The `filter` parameter **must** include `{"key":"<key>"}` (the workflow's `key`) to ensure the new version belongs to the same workflow; omitting `key` will create an independent copy instead. Use the returned new `id` for all subsequent operations; discard the old `id`.
3. **Never use an empty `filter`** — update and destroy nodes require `filter` with at least one condition. Confirm the filter is non-empty before calling the API.
4. **Always chain nodes via `upstreamId`** — every node (except the first) must reference its upstream node. Do not skip or leave `upstreamId` unset.
5. **Never create nodes concurrently** — node creation calls must be executed one at a time, sequentially. Wait for the previous node to be fully created before creating the next one, because the server adjusts internal link relationships during each creation. Batch/parallel node creation is not supported.
6. **Always wrap filter in `$and` or `$or`** — the root of any filter object must be a condition group. Full operator reference: [nocobase-utils / Filter Condition Format](../nocobase-utils/references/filter/index.md).
7. **Always reference node results by `key`, not `id`** — use `{{$jobsMapByNodeKey.<nodeKey>.<path>}}` where `nodeKey` is the node's `key` property (a short random string). Never use the numeric `id`, never invent a key — always read the actual `key` from the node record after creating it. See [Common Conventions - Variable Expressions](references/conventions/index.md#variable-expressions).
8. **Always verify after mutation** — after creating, updating, or deleting a workflow or node, read back the result to confirm the change took effect.
9. **Do not auto-enable without user confirmation** — always ask the user before setting `enabled: true`.

# Orchestration Process

## Planning Phase

Before making any API (CLI or MCP) calls, clarify with the user:
1. **Trigger type** — what event starts the workflow? → see [Trigger Reference](references/triggers/index.md)
2. **Node chain** — what processing steps are needed? → see [Node Reference](references/nodes/index.md)
3. **Execution mode** — synchronous or async? See [sync vs async](references/modeling/index.md#synchronous-vs-asynchronous-mode)
4. **Key parameters** — collection names, filter conditions, field mappings, variable expressions

Summarize the complete plan in natural language and confirm with the user before making any API calls.

Then map the requested action to the corresponding endpoint in the [Endpoint Reference](references/http-api/index.md) to understand which API calls will be needed.

## Creating a New Workflow

1. **Create workflow** → `POST /api/workflows:create` with `type`, `title`, `sync`, `enabled: false`
2. **Configure trigger** → `POST /api/workflows:update?filterByTk=<id>` with `config`
3. **Add nodes in order** → `POST /api/workflows/<workflowId>/nodes:create` for each node, chaining via `upstreamId`
4. **Configure each node** → `POST /api/flow_nodes:update?filterByTk=<nodeId>` with `config`
5. **Verify** → read back the workflow with nodes to confirm trigger config, node count, order, and each node's config are correct
6. **Enable workflow** → confirm with the user, then `POST /api/workflows:update?filterByTk=<id>` with `enabled: true`
7. **Test / verify** → `POST /api/workflows:execute?filterByTk=<id>&autoRevision=1`

## Editing an Existing Workflow

1. **Fetch workflow with nodes and version stats**
   → `GET /api/workflows:get?filterByTk=<id>&appends[]=nodes&appends[]=versionStats`
2. **Check if version is frozen** (`versionStats.executed > 0`)
   - **Yes → create a new revision first**:
     `POST /api/workflows:revision?filterByTk=<id>&filter={"key":"<key>"}`
     The `key` is the workflow's `key` field (obtained from the workflow record in step 1). It **must** be provided to create a revision of the same workflow. Omitting `key` creates an independent copy instead.
     Use the returned new `id` for all subsequent operations. Discard the old `id`.
   - **No → proceed directly**
3. **Edit as needed**:
   - Update trigger config → `POST /api/workflows:update?filterByTk=<id>` with `config`
   - Add node → `POST /api/workflows/<workflowId>/nodes:create`
   - Update node config → `POST /api/flow_nodes:update?filterByTk=<nodeId>`
   - Delete node → `POST /api/flow_nodes:destroy?filterByTk=<nodeId>`
   - Move node → `POST /api/flow_nodes:move?filterByTk=<nodeId>` with body `{ "values": { "upstreamId": <targetId>, "branchIndex": null } }` (`upstreamId: null` moves to the front; `branchIndex` specifies a branch, `null` for the main chain)
   - Copy node → `POST /api/flow_nodes:duplicate?filterByTk=<nodeId>` with body `{ "values": { "upstreamId": <targetId>, "branchIndex": null } }`
4. **Verify** → read back modified nodes to confirm changes took effect
5. **Enable (if needed)** → confirm with the user, then `POST /api/workflows:update?filterByTk=<id>` with `enabled: true`

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

## Error Handling

- **API returns 400/422**: Read the error message carefully. Common causes: invalid node `type`, missing required config fields, referencing a non-existent `upstreamId`. Fix the parameter and retry.
- **MCP returns 401/403**: Stop all operations. Ask the user to re-authenticate or refresh the MCP connection.
- **Node creation fails**: Do not continue adding downstream nodes. Fix or remove the failed node first, then resume.
- **Revision creation fails**: The original workflow may be in an inconsistent state. Re-fetch the workflow to verify its current state before retrying.

## Verification Checklist

After completing any workflow operation, verify:

1. Workflow exists and has the correct `type`, `title`, and `sync` mode
2. Trigger `config` matches the planned configuration
3. Node count and order match the plan (check `upstreamId` chain)
4. Each node's `type` and `config` are correct
5. Filter conditions are non-empty where required (update, destroy nodes)
6. `enabled` status matches the intended state
7. For edits on frozen versions: the new revision `id` is being used, not the old one

# References

- [Workflow architecture and data model](references/modeling/index.md): use when deciding sync mode, revision rules, status codes, or variable groups.
- [Workflow conventions](references/conventions/index.md): use when building `collection`, `filter`, `appends`, and variable expressions.
- [Workflow HTTP API index](references/http-api/index.md): use when mapping MCP resource actions and then narrowing to a single endpoint reference.
- [Workflow triggers](references/triggers/index.md): use when selecting the correct trigger type, then load the single matching trigger file.
- [Workflow nodes](references/nodes/index.md): use when selecting node types, branching behavior, or node-specific config files.
- [NocoBase filter condition format](../nocobase-utils/references/filter/index.md): use when writing workflow filters or trigger conditions.
- [NocoBase evaluator references](../nocobase-utils/references/evaluators/index.md): use when configuring formula or math expressions.
- [Official handbook - Workflow](https://docs.nocobase.com/handbook/workflow): use when local references do not fully cover current product semantics. [verified: 2026-04-09]
- [Official handbook - Workflow revisions](https://docs.nocobase.com/handbook/workflow/advanced/revisions): use when confirming frozen-version revision behavior. [verified: 2026-04-09]
