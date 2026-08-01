---
name: nocobase-workflow-manage
description: Use when users need to inspect, create, update, copy, enable, or diagnose NocoBase workflows through `nb`, including version-safe edits, node changes, approval surfaces, and execution troubleshooting.
argument-hint: "[inspect|create|update|copy|enable|diagnose] [workflow-id|workflow-key|node-id|title] [options]"
allowed-tools: "shell, Read(local skill references only), nb(workflows:list|get|create|update|revision|execute, workflows/<workflowId>/nodes:create, flow_nodes:get|update|destroy|destroyBranch|move|duplicate|test, executions:list|get, jobs:get, flowSurfaces:get|catalog|applyApprovalBlueprint|addBlock|addField|addAction|compose|configure|setLayout)"
owner: platform-tools
version: 1.0.0
last-reviewed: 2026-08-01
risk-level: high
---

# Goal

Manage NocoBase workflows end to end through `nb api workflow`.

1. Require an authenticated `nb` CLI.
2. Run `-h` once before first using a subcommand in the current task.
3. Use only workflow-specific CLI interfaces; do not substitute generic CRUD or source edits.

# Scope

- Inspect, create, update, version, copy, enable, and diagnose workflows.
- Configure triggers and sequential node chains.
- Move, duplicate, test, or delete nodes and branches.
- Inspect executions and failed jobs.
- Author workflow-bound approval surfaces through `flowSurfaces`.

# Non-Goals

- `nb` installation or authentication setup.
- Data-model design; use `nocobase-data-modeling`.
- Ordinary pages, tabs, popups, or routes; use `nocobase-ui-builder`.
- Whole-workflow deletion.
- Approval schema wiring.
- Invented types, fields, keys, filters, or evaluator functions.

# Input Contract

## Environment and Tooling

- Stop on authentication or authorization errors.
- For `expression`, load the matching [formula.js](../nocobase-utils/references/evaluators/formulajs.md) or [math.js](../nocobase-utils/references/evaluators/mathjs.md) reference; never invent functions.

## Commercial Plugin Capability Gate

Verify the required plugin is installed and enabled before mutation:

| Capability | Plugin |
|---|---|
| Approval and approval surfaces | `@nocobase/plugin-workflow-approval` |
| Webhook | `@nocobase/plugin-workflow-webhook` |
| Subflow | `@nocobase/plugin-workflow-subflow` |

If unavailable, name the prerequisite and stop that path. Never replace requested approval semantics with a `manual` node. See [commercial plugin gate](references/commercial-plugin-gate.md).

# Mandatory Clarification Gate

- Ask only about unresolved create-time, destructive, high-risk, or owner choices; at most two rounds and three questions per round.
- Proceed when later-editable details are at least 70% certain; verify them after mutation.
- Require a unique target and exact intended end state before mutation.
- Do not ask which copy mode the user means; infer it through the following gate and state the chosen outcome before mutation.

## Workflow Update and Copy Intent Gate

Users usually describe a change, not a technical revision. Route by desired outcome:

| Intent | Signals | Route and consequence |
|---|---|---|
| Modify the existing workflow | Update/adjust logic, trigger, condition, or nodes | Fetch `nodes` and `versionStats`. If `versionStats.executed > 0`, create a same-workflow revision first; otherwise edit in place. Never create an independent workflow. |
| Create a new version | Explicit new version/revision, preserved history, or successor version | Create a revision with the same `key`. Version executions start at zero; history and key-level aggregate statistics remain. |
| Copy the workflow entity | Copy/clone/save as, another process/template, renamed copy, reset statistics, or bare “copy this workflow” | Create an independent workflow with a new `key`; execution count and history start empty. |

Precedence: explicit version continuity → revision; explicit separate identity → independent copy; concrete behavior change → update; bare workflow copy → independent copy.

Use exactly these revision calls:

```bash
# Same workflow, new version
nb api workflow workflows revision \
  --filter-by-tk <source-id> \
  --filter '{"key":"<source-key>"}'

# Independent workflow
nb api workflow workflows revision \
  --filter-by-tk <source-id>
```

- Same-workflow mode requires the exact top-level control object `{"key":"..."}`. Never nest it in `$and`/`$or`, put it in the body, or use an empty filter.
- Omit `filter` for an independent copy.
- Read back before further mutation: revision means new `id` and unchanged `key`; independent copy means both differ.
- The CLI sends `filter` as one JSON query object; the repository switches mode only on direct `filter.key`.

## Collection Resolution Gate

For any required but unclear `collection`:

1. Inspect existing collections and fields with `nocobase-data-modeling`.
2. Use a match at 70% confidence or higher.
3. Otherwise ask the user to identify or create the collection.

This applies to collection-bound triggers, operations, schedules, and nodes. See [workflow conventions](references/conventions/index.md#the-collection-field-in-trigger-and-node-configuration).

# Reference Loading Map

- Version and copy operations: [workflows CLI](references/cli/workflows.md)
- HTTP transport: [workflows HTTP API](references/http-api/workflows.md)
- Keys, versions, and statistics: [workflow model](references/modeling/workflows.md)
- Authoring: [triggers](references/triggers/index.md), [nodes](references/nodes/index.md), and [conventions](references/conventions/index.md)
- Approval UI: [approval UI index](references/approval/ui-config/index.md) and [surface constraints](references/approval/ui-config/surfaces.md)

## Final Command Surface

- Workflows: `workflows list|get|create|update|revision|sync|execute`
- Nodes: `workflows nodes create`; `flow-nodes get|update|destroy|destroy-branch|move|duplicate|test`
- Diagnostics: `executions list|get`; `jobs list|get|resume`
- Approval surfaces: `flowSurfaces get|catalog|applyApprovalBlueprint|addBlock|addField|addAction|compose|configure|setLayout`

Use [CLI index](references/cli/index.md) for flags and [HTTP API index](references/http-api/index.md) only for underlying request shapes.

# Approval UI Entry

- Approval surfaces are bound by `approvalUid` or `taskCardUid`; they are not ordinary pages.
- Initiator UI requires `ApplyFormModel`; approver UI requires both `ApprovalDetailsModel` and `ProcessFormModel`.
- Use only actions and blocks returned by the live catalog; do not patch reconciled node action config manually.
- Use `applyApprovalBlueprint` for first setup or replacement.
- Resolve the bound root before localized operations.
- Task cards support `fields + layout`; use `setLayout` for layout-only edits.
- Read field-component options from `catalog.node.configureOptions.fieldComponent.enum`.
- Load the [approval UI index](references/approval/ui-config/index.md) before authoring; load [surface constraints](references/approval/ui-config/surfaces.md) for payload rules.

# Safety Gate

1. Create workflows disabled; require confirmation before enabling.
2. Apply the [update and copy gate](#workflow-update-and-copy-intent-gate) before editing or copying.
3. Pass a concrete target to every mutation or destructive call.
4. Create nodes sequentially and chain them with `upstreamId`.
5. Wrap data/query filters in `$and` or `$or`; see the intent gate for revision control.
6. Reference node results by the returned node `key`, never its numeric `id`.
7. Model raw JSON with `json-variable-mapping` or `json-query` before downstream use.
8. Read back every mutation.
9. Require confirmation before manual execution.

# Workflow

## Planning Phase

Resolve intent, trigger, node chain, sync mode, collections, filters, mappings, variables, and raw JSON modeling. State the plan and any history/statistics consequence.

For approval UI, classify the request as whole-surface setup/replacement or localized editing, then load the approval UI reference.

## Creating a New Workflow

1. Resolve collections.
2. Create with `enabled: false`.
3. Configure the trigger.
4. Build the node chain under the [Safety Gate](#safety-gate).
5. Complete the [Verification Checklist](#verification-checklist).

## Editing an Existing Workflow

1. Fetch the workflow with `nodes` and `versionStats`.
2. Apply the [update and copy gate](#workflow-update-and-copy-intent-gate).
3. Mutate only the resolved editable `id`.
4. Complete the [Verification Checklist](#verification-checklist).

## Diagnosing a Failed Execution

1. List executions by `workflowId`, newest first.
2. Fetch the execution with jobs, workflow, and nodes; omit job results initially.
3. Find status `-1` (failed), `-2` (error), or `-3` (aborted).
4. Fetch the failed job and inspect `result`.
5. Fix the configuration, then follow the [Safety Gate](#safety-gate).

## Error Handling

- `400/422`: correct the reported type, field, or link error, then retry.
- Authentication error: stop and request restored access.
- Node creation failure: fix or remove it before creating downstream nodes.
- Revision failure: re-fetch state before retrying.

# Verification Checklist

Verify:

1. Workflow type, title, sync mode, and enabled state.
2. Trigger configuration.
3. Node count, order, types, configs, and `upstreamId` chain.
4. Required mutation filters are non-empty.
5. Revision/copy `id` and `key` match the selected mode.
6. Approval roots and surface readback match the intended route.
7. Raw JSON is modeled before downstream use.
8. Required commercial plugins are enabled.
9. The returned mutation state matches the requested outcome.

# Plugin version control revision rule

- Load `nocobase-revision` every round. If unavailable, ignore this section and disclose nothing about it.
- Reveal no revision information until that skill confirms `nb revision create` is available.
- If available, make one revision decision immediately before the final reply; report a created revision or the concrete reason none was created.

# References

- [Commercial plugin gate](references/commercial-plugin-gate.md)
- [Approval UI index](references/approval/ui-config/index.md) and [surface constraints](references/approval/ui-config/surfaces.md)
- [Workflow model](references/modeling/index.md) and [workflow fields](references/modeling/workflows.md)
- [Conventions](references/conventions/index.md)
- [CLI](references/cli/index.md) and [HTTP API](references/http-api/index.md)
- [Triggers](references/triggers/index.md) and [nodes](references/nodes/index.md)
- [Filter format](../nocobase-utils/references/filter/index.md) and [evaluators](../nocobase-utils/references/evaluators/index.md)
- [Data modeling skill](../nocobase-data-modeling/SKILL.md)
- [Official workflow handbook](https://docs.nocobase.com/handbook/workflow) and [revision guide](https://docs.nocobase.com/handbook/workflow/advanced/revisions) [verified: 2026-04-09]
