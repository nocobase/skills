---
name: nocobase-workflow-manage
description: Use when users need to inspect, create, revise, enable, or diagnose NocoBase workflows through the `nb` CLI, including trigger selection, node-chain changes, version safety checks, and execution troubleshooting.
argument-hint: "[action: inspect|create|update|enable|diagnose|delete-node|delete-branch|build-approval-ui] [target: workflow|node|execution|approval-surface] [workflow-id|workflow-key|node-id|title] [options]"
allowed-tools: "shell, Read(local skill references only), nb(workflows:list|get|create|update|revision|execute, workflows/<workflowId>/nodes:create, flow_nodes:get|update|destroy|destroyBranch|move|duplicate|test, executions:list|get, jobs:get, flowSurfaces:get|catalog|applyApprovalBlueprint|addBlock|addField|addAction|compose|configure|setLayout)"
---

# Goal

Use the `nb api workflow` command surface to orchestrate workflows end-to-end: design trigger logic, build node chains, manage versions, and inspect execution results.

CLI usage rules:

1. Use `nb api workflow` as the canonical command namespace for workflow operations.
2. If the CLI is available but not authenticated for the target app, stop and guide the user to authenticate the CLI before continuing.
3. Before using an `nb api workflow` subcommand you have not used yet in the current task, run its `-h` once and follow the generated help text for flags and examples.

# Scope

- Handle: inspect workflow definitions, nodes, version state, executions, and failed jobs.
- Handle: create new workflows for business targets, then configure triggers and nodes sequentially.
- Handle: update existing workflows by creating a new revision first when the current version is frozen.
- Handle: enable workflows, move/duplicate/delete nodes or branches, and execute workflows only after explicit high-risk confirmation.
- Handle: diagnose failed executions and identify the failed job, node, or configuration mismatch.
- Handle: approval initiator, approver, and task-card UI authoring through `flowSurfaces` when the UI is bound to workflow or approval-node config.

# Non-Goals

- Do not handle `nb` installation or login bootstrap in this skill.
- Do not design data models, collections, or field schemas from scratch. Hand off to `nocobase-data-modeling`.
- Do not handle ordinary Modern page, tab, popup, or route-backed surface authoring. Hand off to `nocobase-ui-builder`.
- Do not invent filter syntax, evaluator functions, node types, trigger types, collection names, field names, or node keys.
- Do not bypass workflow-specific CLI interfaces with generic CRUD or local source edits.
- Do not delete whole workflows in this skill. If a user explicitly wants workflow deletion, stop and request a separately reviewed path.
- Do not treat approval schema wiring as part of this skill's v1 approval UI flow.

# Execution Preconditions

## Environment and Tooling

1. `nb` CLI must be available and authenticated to perform workflow operations.
   - Stop and ask the user to fix auth when the CLI returns `401`, `403`, `Auth required`, or equivalent access errors.
2. Before using an `nb api workflow` command you have not used yet in the current task, run `nb api workflow workflows -h`, `nb api workflow flow-nodes -h`, or the matching `nb api workflow <topic> <subcommand> -h` once and follow the generated help text.
3. When configuring `expression` fields in Calculation, Condition, or Multi-condition nodes, consult `nocobase-utils` for the authoritative function list of each engine. **Never fabricate function names** — verify against [formula.js reference](references/nodes/../../../../../skills/skills/nocobase-utils/references/evaluators/formulajs.md) or [math.js reference](references/nodes/../../../../../skills/skills/nocobase-utils/references/evaluators/mathjs.md).
4. Related helper skills: `nocobase-data-modeling`, `nocobase-utils`.
   - Use [`nocobase-data-modeling`](../nocobase-data-modeling/SKILL.md) according to the [Collection Resolution Gate](#collection-resolution-gate) whenever a workflow trigger or node configuration depends on `collection`.

## Clarification and Mutation Preconditions

- Max clarification rounds: `2`
- Max questions per round: `3`
- Default execution bias:
  - If the intended action path is at least `70%` confident and the remaining uncertainty is in fields that can be safely revised after creation, proceed without asking. For example, nodes in editable (or new) workflow could always be updated (or moved/deleted) later, so if the only uncertainty is about node config details, proceed with the best guess and verify after mutation. Even more, newly created workflow will be in `enabled: false` state by default, so trigger config can be updated and nodes can be added/edited/moved/deleted freely until the user explicitly enables it, which means most uncertainties in a new workflow can be safely resolved after creation without blocking on questions.
  - Ask the user only when the unresolved choice affects a create-time commitment or another field that should not be guessed, or when the action is destructive/high-risk.
- Mutation preconditions:
  - CLI is reachable and authenticated.
  - The requested action is confirmed.
  - The target workflow is uniquely resolved for non-create actions.
  - For `create`, the trigger type and initial node chain are confirmed.
  - For `update`, `delete-node`, and `delete-branch`, the exact target node or branch and intended end state are confirmed.
  - If the existing workflow version has `versionStats.executed > 0`, a new revision is created before any node or trigger mutation.
  - For approval UI edits, the exact owner (`workflowId`, `nodeId`, or existing root `uid`) and whether the task is first-time / replace or localized edit are confirmed.
- Do not guess fields that behave like immutable or hard-to-reverse create-time decisions. Examples include workflow (trigger) `type`, and collection-bound trigger `config.collection` such as data collection event triggers.
- If uncertainty is limited to later-editable details, proceed with the best-supported choice and verify after mutation.
- If a required create-time commitment, destructive target, or approval UI owner/edit mode is still unresolved, stop and report exactly what is missing instead of guessing.

## Collection Resolution Gate

When a requested workflow depends on `collection` and the correct existing collection is not explicit from the user request or current context:

1. Use [`nocobase-data-modeling`](../nocobase-data-modeling/SKILL.md) to inspect existing collections first and inspect fields when needed.
2. Apply this gate to collection triggers and collection-bound operation triggers such as `collection`, `action`, `request-interception`, `approval`, `custom-action` with a bound collection, and `schedule` in collection time-field mode, as well as nodes whose config requires `collection`.
3. If an existing collection matches the business requirement with at least `70%` confidence, continue with that collection instead of asking the user.
4. Only ask the user how to proceed when no existing collection reaches that confidence threshold or when the unresolved collection choice is a create-time commitment that should not be guessed. Offer concrete next steps such as letting the user specify the collection, create it manually, or hand off collection creation to `nocobase-data-modeling`.

# Final Command Surface

Use only this final workflow operation surface. Discover exact flags from `-h` instead of keeping large command-shape reminders in context:

- Inspect workflows: `nb api workflow workflows list`
- Inspect one workflow (with nodes and version stats): `nb api workflow workflows get`
- Create a workflow: `nb api workflow workflows create`
- Update a workflow: `nb api workflow workflows update`
- Delete workflows: `nb api workflow workflows destroy`
- Create a new revision: `nb api workflow workflows revision`
- Re-register triggers: `nb api workflow workflows sync`
- Execute a workflow manually: `nb api workflow workflows execute`
- Create a node under a workflow: `nb api workflow workflows nodes create`
- Inspect one node: `nb api workflow flow-nodes get`
- Update a node configuration: `nb api workflow flow-nodes update`
- Delete a node: `nb api workflow flow-nodes destroy`
- Delete a branch: `nb api workflow flow-nodes destroy-branch`
- Move a node: `nb api workflow flow-nodes move`
- Duplicate a node: `nb api workflow flow-nodes duplicate`
- Test a node: `nb api workflow flow-nodes test`
- List executions: `nb api workflow executions list`
- Inspect one execution (with jobs): `nb api workflow executions get`
- Inspect a node job: `nb api workflow jobs get`
- List node jobs: `nb api workflow jobs list`
- Resume a waiting job: `nb api workflow jobs resume`
- Inspect an approval surface: `flowSurfaces get`
- Discover approval capabilities: `flowSurfaces catalog`
- Bootstrap or replace an approval surface: `flowSurfaces applyApprovalBlueprint`
- Localized approval edits: `flowSurfaces addBlock`, `flowSurfaces addField`, `flowSurfaces addAction`, `flowSurfaces compose`, `flowSurfaces configure`, `flowSurfaces setLayout`

Prefer learning exact flags from help:

```
nb api workflow -h
nb api workflow workflows -h
nb api workflow workflows list -h
nb api workflow workflows create -h
nb api workflow workflows nodes create -h
nb api workflow flow-nodes -h
nb api workflow executions -h
nb api workflow jobs -h
```

Use [Workflow CLI index](references/cli/index.md) as the stable CLI family map and parameter guide.

Consult [Workflow HTTP API index](references/http-api/index.md) only when you need the exact underlying endpoint and parameter shapes.

# Approval UI Entry

- Approval initiator, approver, and task-card surfaces are not ordinary route-backed pages. They are bound to workflow or approval-node config.
- Page-like approval grids may host approval blocks plus the fixed generic blocks currently exposed by the approval runtime catalog: `markdown` and `jsBlock`.
- Task-card remains `fields + layout` on the blueprint route and still has no standalone block-authoring path.
- When switching an approval association field component, read the live wrapper contract from `catalog.node.configureOptions.fieldComponent.enum` instead of guessing from ordinary page semantics.
- First-time setup or whole-surface replacement uses `flowSurfaces applyApprovalBlueprint`.
- Localized approval edits require resolving the bound `approvalUid` or `taskCardUid` first, then using the localized `flowSurfaces` operations.
- Ordinary Modern page, tab, popup, and route-backed surface work still belongs to `nocobase-ui-builder`.
- Full route selection, payload, and verification guidance lives in [Approval UI authoring index](references/ui-config/approval/index.md).

# Hard Rules

1. **Never create a workflow with `enabled: true`** — always create with `enabled: false`, complete all trigger and node configuration, then enable.
2. **Never edit a frozen version directly** — if `versionStats.executed > 0`, create a new revision first via `nb api workflow workflows revision`. The `filter` parameter **must** include `{"key":"<key>"}` (the workflow's `key`) to ensure the new version belongs to the same workflow; omitting `key` will create an independent copy instead. Use the returned new `id` for all subsequent operations; discard the old `id`.
3. **Never omit the target identifier on destructive or mutating calls** — pass a concrete `--filter-by-tk` or a reviewed non-empty `--filter` before calling update, destroy, revision, move, duplicate, or branch-deletion APIs.
4. **Always chain nodes via `upstreamId`** — every node (except the first) must reference its upstream node. Do not skip or leave `upstreamId` unset.
5. **Never create nodes concurrently** — node creation calls must be executed one at a time, sequentially. Wait for the previous node to be fully created before creating the next one, because the server adjusts internal link relationships during each creation. Batch/parallel node creation is not supported.
6. **Always wrap filter in `$and` or `$or`** — the root of any filter object must be a condition group. Full operator reference: [nocobase-utils / Filter Condition Format](../nocobase-utils/references/filter/index.md).
7. **Always reference node results by `key`, not `id`** — use `{{$jobsMapByNodeKey.<nodeKey>.<path>}}` where `nodeKey` is the node's `key` property (a short random string). Never use the numeric `id`, never invent a key — always read the actual `key` from the node record after creating it. See [Common Conventions - Variable Expressions](references/conventions/index.md#variable-expressions).
8. **Always verify after mutation** — after creating, updating, or deleting a workflow or node, read back the result to confirm the change took effect.
9. **Do not auto-enable without user confirmation** — always ask the user before setting `enabled: true`.
10. **Resolve collection names by inspection, not guesswork** — follow the [Collection Resolution Gate](#collection-resolution-gate) for any collection-bound trigger or node config that requires `collection`.
11. **Use `applyApprovalBlueprint` for first-time or whole-surface approval setup** — do not bootstrap a brand-new approval surface with `compose`.
12. **Do not invent `approvalUid` or `taskCardUid`** — for localized approval edits, resolve the bound root from workflow or node config first.

# Orchestration Process

## Planning Phase

Before making any CLI calls, clarify with the user:
1. **Trigger type** — what event starts the workflow? → see [Trigger Reference](references/triggers/index.md)
2. **Node chain** — what processing steps are needed? → see [Node Reference](references/nodes/index.md)
3. **Execution mode** — synchronous or async? See [workflow execution mode](references/modeling/workflows.md#execution-mode)
4. **Key parameters** — collection names, filter conditions, field mappings, variable expressions

If the workflow still depends on an unresolved `collection` after this clarification, follow the [Collection Resolution Gate](#collection-resolution-gate) before asking the user to decide.

Summarize the complete plan in natural language and confirm with the user before making any CLI calls.

Then map the requested action to the corresponding operation in the [Final Command Surface](#final-command-surface) to understand which calls will be needed. Consult [Endpoint Reference](references/http-api/index.md) only when the underlying API shape itself matters.

For approval UI requests, first decide whether the task is:
- first-time setup or whole-surface replacement
- a localized edit on an existing bound approval surface

Then follow [Approval UI authoring index](references/ui-config/approval/index.md) for owner resolution, route selection, and verification.

## Creating a New Workflow

0. **Resolve collection dependencies first** — follow the [Collection Resolution Gate](#collection-resolution-gate) before creating the workflow whenever any trigger or node config still has an unresolved `collection`.
1. **Create workflow** — `nb api workflow workflows create` with `type`, `title`, `sync`, `enabled: false`
2. **Configure trigger** — `nb api workflow workflows update` with `config`
3. **Add nodes in order** — `nb api workflow workflows nodes create` for each node, chaining via `upstreamId`; wait for each node to be fully created before creating the next
4. **Configure each node** — `nb api workflow flow-nodes update` with `config`
5. **Verify** — read back the workflow with nodes to confirm trigger config, node count, order, and each node's config are correct
6. **Enable workflow** — confirm with the user, then `nb api workflow workflows update` with `enabled: true`
7. **Test / verify** — `nb api workflow workflows execute` with `autoRevision=1`

## Editing an Existing Workflow

1. **Fetch workflow with nodes and version stats** — `nb api workflow workflows get` with `appends[]=nodes` and `appends[]=versionStats`
2. **Check if version is frozen** (`versionStats.executed > 0`)
   - **Yes → create a new revision first**: `nb api workflow workflows revision`
     The `key` parameter is the workflow's `key` field (obtained from the workflow record in step 1). It **must** be provided to create a revision of the same workflow. Omitting `key` creates an independent copy instead.
     Use the returned new `id` for all subsequent operations. Discard the old `id`.
   - **No → proceed directly**
3. **Edit as needed**:
    - Update trigger config → `nb api workflow workflows update` with `config`
    - Add node → `nb api workflow workflows nodes create`
    - Update node config → `nb api workflow flow-nodes update`
    - Delete node → `nb api workflow flow-nodes destroy`
    - Move node → `nb api workflow flow-nodes move` with `upstreamId` and optional `branchIndex` (`upstreamId: null` moves to the front; `branchIndex: null` for main chain)
    - Copy node → `nb api workflow flow-nodes duplicate` with `upstreamId` and optional `branchIndex`
4. **Verify** — read back modified nodes to confirm changes took effect
5. **Enable (if needed)** — confirm with the user, then `nb api workflow workflows update` with `enabled: true`

## Diagnosing a Failed Execution

1. **List executions** to find the failed one: `nb api workflow executions list` filtered by `workflowId`, sorted by `-id`
2. **Get execution detail** with jobs (exclude result to reduce size): `nb api workflow executions get` with `appends[]=jobs`, `appends[]=workflow`, `appends[]=workflow.nodes`, `except[]=jobs.result`
3. **Find the failed job** — look for `job.status` values of `-1` (FAILED), `-2` (ERROR), or `-3` (ABORTED)
4. **Get full job detail** to see the error: `nb api workflow jobs get` — inspect `result` for the error message or output that caused the failure
5. Fix the issue (update node config or create a new revision if version is frozen), then re-execute.

## Error Handling

- **API returns 400/422**: Read the error message carefully. Common causes: invalid node `type`, missing required config fields, referencing a non-existent `upstreamId`. Fix the parameter and retry.
- **CLI returns auth error**: Stop all operations. Guide the user to restore CLI authentication.
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
8. For approval UI edits: the bound workflow or node config points at the expected `approvalUid` or `taskCardUid`, and the FlowModel readback matches the intended route

# References

- [Approval UI authoring index](references/ui-config/approval/index.md): use when the task is about approval initiator, approver, or task-card surfaces bound to workflow or approval-node config.
- [Workflow architecture and data model](references/modeling/index.md): use when understanding the overall model structure, revision rules, status codes, or variable groups.
- [Workflow data model - workflows](references/modeling/workflows.md): use when deciding sync mode, workflow field semantics, or workflow-level execution constraints.
- [Workflow conventions](references/conventions/index.md): use when building `collection`, `filter`, `appends`, and variable expressions.
- [Workflow CLI index](references/cli/index.md): use when running through `nb api workflow` — maps workflow tasks to canonical command families, argument placement, and body shapes.
- [Workflow HTTP API index](references/http-api/index.md): use when you need the underlying endpoint and parameter shapes.
- [Workflow triggers](references/triggers/index.md): use when selecting the correct trigger type, then load the single matching trigger file.
- [Workflow nodes](references/nodes/index.md): use when selecting node types, branching behavior, or node-specific config files.
- [NocoBase filter condition format](../nocobase-utils/references/filter/index.md): use when writing workflow filters or trigger conditions.
- [NocoBase evaluator references](../nocobase-utils/references/evaluators/index.md): use when configuring formula or math expressions.
- [NocoBase data modeling skill](../nocobase-data-modeling/SKILL.md): use together with the [Collection Resolution Gate](#collection-resolution-gate) when a workflow needs a collection but the correct existing collection is unclear.
- [Official handbook - Workflow](https://docs.nocobase.com/handbook/workflow): use when local references do not fully cover current product semantics. [verified: 2026-04-09]
- [Official handbook - Workflow revisions](https://docs.nocobase.com/handbook/workflow/advanced/revisions): use when confirming frozen-version revision behavior. [verified: 2026-04-09]
