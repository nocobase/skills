---
title: "Approval workflow"
description: "Cross-cutting reference for the approval workflow — trigger, node, notifications, UID-backed surfaces, and UI authoring."
---

# Approval workflow

The approval feature spans several pieces that are normally documented separately under `triggers/`, `nodes/`, and `ui-config/`. Because they only make sense together, this folder is the single home for cross-cutting approval rules. The per-type docs ([triggers/approval.md](../triggers/approval.md), [nodes/approval.md](../nodes/approval.md)) keep their own schema tables and minimal examples, and link here for shared rules.

## When to read this folder

- You are configuring an `approval` trigger or `approval` node and need to fill `notifications`, `approvalUid`, or `taskCardUid`.
- You are building or editing the approval initiator / approver / task-card UI.
- You need to understand how the trigger-side initiator interface relates to data-block submit buttons.

If you only need the type-specific schema (config fields, branch indices, output variables), stay in [triggers/approval.md](../triggers/approval.md) or [nodes/approval.md](../nodes/approval.md) and follow the cross-links from there.

## Non-Optional UI Coverage

When an agent is asked to build a usable approval workflow, do not stop after creating the trigger and approval node config. The human-facing approval experience has required surfaces:

- **Initiator side:** configure the trigger-bound initiator surface (`workflow.config.approvalUid`) with an `approvalInitiator` / `ApplyFormModel` block bound to the trigger collection. It must expose the default submit action (`approvalSubmit`) so the applicant can submit from the approval center, resubmit after withdrawal/return, or use centralized initiation when enabled.
- **Page data-block entry:** when the approval should start from an application page, also bind the workflow to the create/edit form submit button on that page. This is separate from the trigger-bound initiator surface.
- **Approver side:** configure every approval node's approver surface (`node.config.approvalUid`) with both:
  - `approvalInformation` / `ApprovalDetailsModel` so the approver can read the original submitted data in a read-only block.
  - `approvalApprover` / `ProcessFormModel` so the approver can submit the handling result through approval actions and, when required, edit approval data fields before approving/rejecting/returning.
- **Task cards:** configure `taskCardUid` surfaces when the workflow needs meaningful "My Applications" or "My Approvals" cards. Task cards improve list/card detail display but do not replace the initiator or approver surfaces above.

Missing any required surface usually produces a workflow that exists technically but cannot be completed by the intended user role. Treat these surfaces as part of the approval workflow deliverable unless the user explicitly requests config-only work.

## Contents

| Topic | Document | Applies to |
|---|---|---|
| Initiator audience whitelist (`audienceType`, `approvalAudiences:replace`, role scope) | [audience.md](audience.md) | Trigger only |
| Notifications (system templates vs custom templates, channel-specific shapes) | [notifications.md](notifications.md) | Trigger (`done`) and Node (`todo`) |
| UID-backed config (`approvalUid`, `taskCardUid`) — when to keep, when to generate | [uid-config.md](uid-config.md) | Trigger and Node |
| Initiator interface (trigger-side `approvalUid` surface, data-block submit button binding, To-Do Center entry) | [initiator-interface.md](initiator-interface.md) | Trigger only |
| Approval UI authoring through `flowSurfaces` (initiator / approver / task-card surfaces) | [ui-config/index.md](ui-config/index.md) | Trigger and Node |

## Related

- [triggers/approval.md](../triggers/approval.md) — `approval` trigger schema, modes, output variables.
- [nodes/approval.md](../nodes/approval.md) — `approval` node schema, branching, output variables.
- [http-api/index.md](../http-api/index.md) — HTTP / MCP endpoint mapping for `flowSurfaces` and workflow APIs.
