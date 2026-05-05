---
title: "Approval"
description: "Explains the configuration items, negotiation/sequential approval rules, and the meaning of branch indices for the approval node."
---

# Approval

This page only covers the `approval` node schema. Cross-cutting topics (notifications, UID-backed config, UI authoring) live under [../approval/](../approval/index.md).

## Node Type

`approval`

Approval node type can only be used in approval workflows, which trigger type is `approval`.

## Node Description
Initiates an approval task, waits for the approval result to continue the workflow, and can branch based on the approval outcome.

## Business Scenario Examples
An expense report goes through an approval process after submission. The branching mode is similar to if/else.

## Configuration Items
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| branchMode | boolean | false | Yes | Passing mode: `false` for direct (termination upon rejection/return), `true` for branching mode. |
| assignees | array | [] | Yes | List of approvers, specified as an array of user IDs or user queries. User IDs could be found by query `users:list` API, or use variables of user IDs form upstream. The query object will contains a `filter` object to describe the query condition of users collection.  See [Common Conventions - filter](../conventions/index.md#the-filter-field-in-trigger-and-node-configuration). |
| negotiation | number | 0 | No | Multi-person negotiation mode: `0` means any one pass/reject takes effect; `1` means all must pass to pass; `0<value<1` is a voting threshold (e.g., 0.6 means pass rate >60% is required to pass). |
| order | boolean | false | No | Whether to approve in sequence (when sequential, subsequent approvers are initially set to `Assigned`). |
| endOnReject | boolean | false | No | In branching mode, whether to terminate the workflow immediately after the rejection branch ends. |
| title | string | Node Title | No | Task title, supports variable templates. |
| approvalUid | string | None | No | Approver interface configuration UID. See [approval/uid-config.md](../approval/uid-config.md). |
| taskCardUid | string | None | No | "My Approvals" card configuration UID. See [approval/uid-config.md](../approval/uid-config.md). |
| notifications | array | [] | No | Notifications sent to **approvers** when a task is assigned. Built-in template `type` for this surface is `todo`. Entry shape, system vs custom templates, and channel-specific custom payloads are documented in [approval/notifications.md](../approval/notifications.md). |

## Cross-cutting References

- UI authoring (approver interface schema, blocks/actions/fields, blueprint vs. incremental edits): [approval/ui-config/index.md](../approval/ui-config/index.md).
- UID generation rules for `approvalUid` / `taskCardUid`: [approval/uid-config.md](../approval/uid-config.md).
- Notifications configuration (system templates vs. custom, channel-specific shapes): [approval/notifications.md](../approval/notifications.md).

## Branch Description
Branching is enabled when `branchMode=true`:
- `branchIndex=2`: Approved
- `branchIndex=-1`: Rejected
- `branchIndex=1`: Returned

No branches are generated when `branchMode=false`.

Only add strong related nodes in branches, for example, to update approving record status or send notifications. Other process nodes could be add after the approval node. In most case, should not use nested approval nodes (in branches), better to add approval nodes one after another (as direct downstream).

## Test Support
Not supported. This node cannot use CLI `workflow flow-nodes test` or HTTP `flow_nodes:test`, because the server-side instruction does not implement `test()`.

## Example Configuration
```json
{
  "branchMode": true,
  "assignees": ["{{ $context.data.ownerId }}", { "filter": { "$and": [{ "role.name": "manager" }]} }, 123],
  "negotiation": 1,
  "order": false,
  "endOnReject": true,
  "title": "{{ $context.data.title }} - Approval",
  "approvalUid": "<pre-generated uid if missing>",
  "taskCardUid": "<pre-generated uid if missing>"
}
```

Before finalizing the payload, generate any missing UID values per [approval/uid-config.md](../approval/uid-config.md).

## Output Variables
The variable selector for this node is a tree array of `{ label, value, children? }`. At runtime, join the `value` segments with `.` and prepend `$jobsMapByNodeKey.<nodeKey>`.

- Exposed roots under the node: `nodeTitle`, `title`, `status`, `data`, `records`.
- `data` follows the workflow trigger collection schema; any trigger-level `appends` become nested children under `data`.
- `records` is the approval-record array, with per-item fields `id`, `userId`, `status`, `comment`, and `updatedAt`.
- Example references: `{{$jobsMapByNodeKey.approval_step.status}}`, `{{$jobsMapByNodeKey.approval_step.title}}`, `{{$jobsMapByNodeKey.approval_step.data.amount}}`.
- If you need to process individual items in `records`, usually pass `{{$jobsMapByNodeKey.<nodeKey>.records}}` into a `loop` or JSON-processing node.

## Other Notes

- Approval nodes are not supported to be added in parallel branches for now.
- Commonly, do not recommend to use nested approval nodes (e.g., an approval node in the branch of another approval node), as it will make the flow complex and hard to maintain. Better to add approval nodes one after another (as direct downstream), and use branches for other related processing (e.g., update status, send notifications) if needed.
- If using branching mode, commonly set the ``endOnReject=true`` to terminate the workflow immediately when rejected.
