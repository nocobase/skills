---
name: nocobase-notification-manage
description: "Use when users need to configure, inspect, test, or troubleshoot NocoBase notification management, including in-app message channels, email SMTP channels, workflow notification nodes, and notification send logs."
argument-hint: "[action: inspect|configure-channel|test-channel|configure-workflow|diagnose] [channel: in-app-message|email|name] [env?: name]"
allowed-tools: Bash, Read, Grep
owner: platform-tools
version: 1.0.0
last-reviewed: 2026-06-12
risk-level: medium
---

# Goal

Guide NocoBase notification management work end-to-end: inspect notification plugins and channels, configure in-app message or email channels, wire workflow notification nodes, test delivery, and diagnose send logs.

# Scope

- Handle: notification manager usage, including channels in `notificationChannels` and send logs in `notificationSendLogs`.
- Handle: in-app message channels (`notificationType: in-app-message`) and their workflow message fields.
- Handle: email channels (`notificationType: email`) using SMTP transport.
- Handle: workflow notification node guidance for node type `notification`.
- Handle: delivery diagnosis using send logs, workflow job results, and channel configuration readback.

# Non-Goals

- Do not install, enable, or disable plugins directly. Use `nocobase-plugin-manage` for plugin state changes.
- Do not design a complete workflow from scratch. Use `nocobase-workflow-manage` for trigger and node-chain authoring.
- Do not create new notification channel types. Use plugin development guidance for custom providers.
- Do not send real external email tests without explicit confirmation of recipients.
- Do not expose or echo SMTP passwords, app passwords, or other channel secrets.

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `action` | yes | `inspect` | one of `inspect/configure-channel/test-channel/configure-workflow/diagnose` | "Which action should I run: inspect, configure-channel, test-channel, configure-workflow, or diagnose?" |
| `channel` | configure/test: yes | none | existing channel name or one of `in-app-message/email` | "Which channel name or channel type should I use?" |
| `env` | no | current CLI env | configured `nb` env name | "Which NocoBase CLI env should I target?" |
| `workflow` | configure-workflow/diagnose: sometimes | none | workflow id/key/title resolved uniquely | "Which workflow or notification node should I inspect?" |
| `recipients` | test-channel: yes | none | explicit user ids or email addresses | "Which safe test recipients should receive the notification?" |
| `mode` | no | `safe` | one of `safe/fast` | "Use safe mode with readback, or fast mode?" |

Rules:

- If any required input is missing, stop mutation and ask clarification.
- If user says "you decide", use documented defaults.
- Resolve channel names from `notificationChannels`; do not guess generated `s_` names.
- Prefer safe mode for all configuration and test work.

# Mandatory Clarification Gate

- Max clarification rounds: `2`
- Max questions per round: `3`
- Mutation preconditions:
- `action` is confirmed.
- `nb` CLI reachability and authentication are confirmed for application operations.
- For channel writes, channel type and required provider fields are known.
- For tests, recipients are explicit and approved.
- For workflow edits, exact workflow or node ownership is resolved.
- If preconditions are not met, stop and report missing inputs/capabilities.

# Workflow

1. Confirm `nb` CLI reachability and plugin state; if plugin enablement is required, hand off to `nocobase-plugin-manage`.
2. Inspect `notificationChannels` and registered channel types before changing anything.
3. Select the correct path:
- `inspect`: list channels and recent `notificationSendLogs`.
- `configure-channel`: create or update only the requested channel type.
- `test-channel`: send to explicit safe recipients, then read logs.
- `configure-workflow`: guide or delegate workflow node edits for type `notification`.
- `diagnose`: correlate channel config, send logs, workflow jobs, and server logs.
4. Read the relevant reference file before producing field-level guidance.
5. For mutations, execute one write at a time and read back `notificationChannels`.
6. For delivery tests, inspect `notificationSendLogs.status`, `reason`, `message`, `triggerFrom`, and `channelName`.
7. Report the final state, evidence, and any remaining risk.

# Reference Loading Map

Use this section to prevent vague reference usage. Each entry should say exactly when to read it.

| Reference | Use When | Notes |
|---|---|---|
| [Channel configuration](references/channel-configuration.md) | Creating, updating, or reviewing in-app message and email channels. | Includes channel types, fields, and secret handling. |
| [Workflow notifications](references/workflow-notification.md) | Adding or reviewing workflow notification nodes. | Includes node type and per-channel message fields. |
| [Diagnostics](references/diagnostics.md) | Investigating failed or missing notifications. | Includes collections, status fields, and common failure causes. |

Reference rules:

- Use relative Markdown links for local files.
- Use `/` path separators in links.
- Keep references one hop from `SKILL.md` where possible.
- If a reference file exceeds 100 lines, add a TOC in that file.

# Safety Gate

- High-risk actions require secondary confirmation before execution.
- High-risk actions include:
- sending real email to external recipients
- changing SMTP host/account/password/from values
- deleting notification channels or send logs
- changing workflow notification nodes in an enabled or previously executed workflow
- enabling/disabling notification-related plugins

Secondary confirmation template:

- "Confirm execution: `{{action}}` for notification channel `{{channel}}`. Expected impact: {{impact}}. Type `confirm` to continue."

Rollback guidance:

- Trigger rollback when readback does not match the requested channel or workflow configuration.
- Rollback steps:
- restore the previous `notificationChannels` record values
- restore the previous workflow revision or node config through `nocobase-workflow-manage`
- verify by readback and a safe test send when appropriate

# Verification Checklist

- Target channel or workflow node exists and is uniquely resolved.
- `nb` authentication state is valid.
- Required notification plugins are enabled or a handoff is made.
- Input values pass validation rules.
- Every write has immediate readback verification.
- Channel `notificationType` matches the intended provider.
- Email channel has SMTP `host`, `port`, `secure`, `account`, `password`, and `from` configured without printing secrets.
- In-app message channel has a display title and can be selected by workflow notifications.
- Workflow notification node uses type `notification` and a real `channelName`.
- Send logs show expected `status`, `triggerFrom`, `channelName`, and `reason` when failed.
- Errors and partial successes are reported separately.
- Final output includes CLI env and app context used.

# Minimal Test Scenarios

1. Inspect-only: list notification channels and recent send logs.
2. Configure in-app message channel and verify it appears in `notificationChannels`.
3. Configure email SMTP channel, redact secrets in output, and verify readback.
4. Test channel with explicit recipients and verify `notificationSendLogs`.
5. Missing recipient for a real test blocks sending.
6. Workflow node change on an executed workflow hands off to `nocobase-workflow-manage` revision rules.

# Output Contract

Final response must include:

- What was requested.
- What was executed.
- What was verified.
- What failed or remains unclear.
- Which defaults/assumptions were applied.
- Notification channel name/type and CLI env used.
- Exact next actions for user if blocked.

# References

- [Channel configuration](references/channel-configuration.md): use for notification channel configuration fields and provider rules.
- [Workflow notifications](references/workflow-notification.md): use for workflow notification node behavior and message fields.
- [Diagnostics](references/diagnostics.md): use for logs, failure reasons, and troubleshooting sequence.
