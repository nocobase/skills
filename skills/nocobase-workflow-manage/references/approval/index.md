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

## Mandatory UI Coverage

When an agent is asked to build a usable approval workflow, do not stop after creating the trigger and approval node config. The human-facing approval experience has required surfaces, and missing them is a setup failure:

- **Initiator side:** configure the trigger-bound initiator surface (`workflow.config.approvalUid`) with an `approvalInitiator` / `ApplyFormModel` block bound to the trigger collection. It must expose the default submit action (`approvalSubmit`) so the applicant can submit from the approval center, resubmit after withdrawal/return, or use centralized initiation when enabled.
- **Page data-block entry:** when the approval should start from an application page, also bind the workflow to the create/edit form submit button on that page. This is separate from the trigger-bound initiator surface.
- **Approver side:** configure every approval node's approver surface (`node.config.approvalUid`) with both:
  - `approvalInformation` / `ApprovalDetailsModel` so the approver can read the original submitted data in a read-only block.
  - `approvalApprover` / `ProcessFormModel` so the approver can submit the handling result through approval actions and, when required, edit approval data fields before approving/rejecting/returning.
- **Task cards:** configure `taskCardUid` surfaces when the workflow needs meaningful "My Applications" or "My Approvals" cards. Task cards improve list/card detail display but do not replace the initiator or approver surfaces above.

The most common failure pattern is writing `approvalUid` / `taskCardUid` values or configuring workflow/node JSON, but never creating the FlowModel tree under those UIDs. The result is an approval workflow that exists technically while the initiator or approver popup opens empty. Treat an empty approval popup as failed verification, not as a completed setup.

The reverse failure is also invalid: creating a form/detail FlowModel tree or individual form items but never saving the root uid back to the owning workflow/node config. A detached surface is invisible to the approval runtime. The trigger initiator root uid must be present in `workflow.config.approvalUid`; every approval-node approver root uid must be present in that node's `node.config.approvalUid`. Missing fields, empty strings, or roots that exist only as unbound UI records fail verification.

Another common failure is creating the right form/detail blocks but leaving their field lists empty or unrelated to the workflow's business purpose. Do not create blank applicant forms, blank approver forms, or blank read-only details. Every approval UI block should contain the fields a real user needs to understand and complete the workflow, such as title/summary, amount/date/range, reason/description, applicant/business owner, attachments, line items, and any approver-editable decision fields required by the business process. Choose the exact fields from the trigger collection and the user's stated workflow intent; if the required collection fields are unclear, inspect the collection or ask instead of shipping an empty form.

Do not use legacy v1 bindings for new approval UI work. The approval trigger initiator surface must bind through `workflow.config.approvalUid`, not `workflow.config.applyForm`; every approval-node approver surface must bind through `node.config.approvalUid`, not `node.config.applyDetail`.

For approval node topology, prefer branch mode by default when the user has no special requirement. Keep approval branches focused on immediate follow-up work such as status updates or notifications, and avoid nesting another approval node inside those branches; model multi-step approvals as sequential approval nodes in the main chain instead.

For a full approval workflow build, run and verify these UI steps in order:

1. After configuring the approval trigger, build the initiator surface with `applyApprovalBlueprint(surface="initiator", workflowId=...)`.
2. Immediately read it back with `flowSurfaces:get` and verify `ApplyFormModel`, `ApplyFormSubmitModel`, and business-required applicant fields exist.
3. After configuring each approval node, build that node's approver surface with `applyApprovalBlueprint(surface="approver", nodeId=...)`.
4. Immediately read each approver surface back with `flowSurfaces:get` and verify `ApprovalDetailsModel`, `ProcessFormModel`, expected process actions, original-data review fields, and required approver-editable fields exist.
5. Re-read the owning workflow/node config after each surface build to confirm the `approvalUid` field exists, is non-empty, and points to the returned root.

Do not report the approval workflow as complete until all required trigger and node surfaces have passed readback verification, unless the user explicitly requested config-only work.

## Completion Gate Script

When an agent believes an approval workflow build is complete, run the approval UI validation script before reporting success:

```bash
node skills/skills/nocobase-workflow-manage/scripts/validate-approval-workflow-ui.mjs --workflow-id <workflowId>
```

Use `--env <name>` when the `nb` CLI target environment must be selected. The script is read-only: it reads the workflow, approval nodes, and bound approval surfaces, then exits non-zero if required UI roots, blocks, actions, or fields are missing.

For stronger business-field validation, pass expected fields that came from the user's stated process or inspected collection schema:

```bash
node skills/skills/nocobase-workflow-manage/scripts/validate-approval-workflow-ui.mjs \
  --workflow-id <workflowId> \
  --expect-initiator-field amount \
  --expect-information-field amount \
  --expect-approver-field approvedAmount
```

If the approval process truly has no approver-editable data fields, pass `--allow-empty-approver-fields`; otherwise the process form must include at least one field plus process actions. Use `--strict-topology` when branch-mode preference and nested-approval warnings should fail the gate instead of only warning.

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
