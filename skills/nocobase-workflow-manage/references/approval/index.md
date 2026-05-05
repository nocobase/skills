---
title: "Approval Subsystem"
description: "Cross-cutting reference for the approval workflow subsystem — trigger, node, notifications, UID-backed surfaces, and UI authoring."
---

# Approval Subsystem

The approval feature spans several pieces that are normally documented separately under `triggers/`, `nodes/`, and `ui-config/`. Because they only make sense together, this folder is the single home for cross-cutting approval rules. The per-type docs ([triggers/approval.md](../triggers/approval.md), [nodes/approval.md](../nodes/approval.md)) keep their own schema tables and minimal examples, and link here for shared rules.

## When to read this folder

- You are configuring an `approval` trigger or `approval` node and need to fill `notifications`, `approvalUid`, or `taskCardUid`.
- You are building or editing the approval initiator / approver / task-card UI.
- You need to understand how the trigger-side initiator interface relates to data-block submit buttons.

If you only need the type-specific schema (config fields, branch indices, output variables), stay in [triggers/approval.md](../triggers/approval.md) or [nodes/approval.md](../nodes/approval.md) and follow the cross-links from there.

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
