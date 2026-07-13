---
title: "Approval Notifications"
description: "Shared notifications configuration for approval triggers (initiator, done) and approval nodes (approver, todo)."
---

# Approval Notifications

The `notifications` array on an approval trigger and on an approval node uses the **same entry shape**. The only differences are which user the message targets and which built-in template `type` is used:

| Surface | Audience | Built-in `type` | Variable scope |
|---|---|---|---|
| Trigger (`approval` trigger `config.notifications`) | Initiator | `done` | `{{$context.data.*}}`, `{{$context.applicant.*}}`, `{{$context.approvalId}}` |
| Node (`approval` node `config.notifications`) | Approver / assignee | `todo` | `{{$jobsMapByNodeKey.<nodeKey>.*}}`, `{{$context.data.*}}` |

`done` notifications fire when the approval ends — approved / rejected / returned / canceled / aborted. `todo` notifications fire when a task is assigned to an approver.

## Contents

- [Entry Shape](#entry-shape)
- [Channel Resolution](#channel-resolution)
- [Option A — Dedicated Approval Message Template](#option-a--dedicated-approval-message-template-templatetype--template)
- [Option B — Custom Template](#option-b--custom-template-templatetype--custom)
- [Variable Scope by Template Source](#variable-scope-by-template-source)
- [Related Notification Management References](#related-notification-management-references)

## Entry Shape

```jsonc
{
  "channel": "<channel.name>",          // required — name field from notificationChannels
  "templateType": "template" | "custom", // default "template"
  "template": <id> | <object>            // required — see below
}
```

Each entry sends one message through one channel. Multiple entries are allowed but each `channel` may only appear once per surface.

## Channel Resolution

`channel` is the `name` of an enabled notification channel, not `channel.title`. Resolve the channel through `notificationChannels` before writing config, and do not guess generated names.

Use [`nocobase-notification-manage` channel configuration](../../../nocobase-notification-manage/references/channel-configuration.md) when the channel itself does not exist yet, when an email SMTP channel must be configured, or when you need to inspect provider-specific channel fields. Return to this file after the channel exists and its `name` and `notificationType` are known.

```bash
nb api resource list --resource notificationChannels --filter '{}' -j
nb api resource get --resource notificationChannels --filter-by-tk <channelName> -j
```

## Option A — Dedicated Approval Message Template (`templateType = "template"`)

Use this when a reusable approval message template exists or should be created. Most general-purpose approvals should pick this option because the workflow config only stores the template ID and the wording remains centrally managed.

- `template` is the numeric template `id`.
- Templates are stored in `approvalMsgTpls`, not in the workflow config.
- Fetch candidate templates via `approvalMsgTpls:list`. Filter by:
  - `notificationType` — must equal the channel's `notificationType` (e.g. `in-app-message`, `email`). Get this from the `notificationChannels` record by `channel.name`.
  - `type` — `done` for triggers (initiator-facing), `todo` for nodes (approver-facing).
- If a template cannot be resolved through the API, first check those two fields.
- If no suitable template exists, create one through the `approvalMsgTpls` resource and then reference the new `id`, or inline a custom template (Option B).

Read candidate templates:

```bash
nb api resource list --resource approvalMsgTpls --filter '{"notificationType":"<notificationType>","type":"<todo|done>"}' -j
nb api resource get --resource approvalMsgTpls --filter-by-tk <templateId> -j
```

Template-management flow:

1. Resolve the channel record from `notificationChannels` and note its `name` and `notificationType`.
2. Query `approvalMsgTpls` with both `notificationType` and `type`.
3. If no template matches, create or update an `approvalMsgTpls` record with:
   - `type`: `todo` for approval-node assignee notifications, `done` for approval-trigger applicant notifications.
   - `title`: human-readable template title.
   - `notificationType`: the selected channel's provider type.
   - `template`: provider-specific message payload from `ContentConfigForm`.
4. Read back the template and copy its numeric `id`.
5. Set the workflow notification entry to `{"channel":"<channel.name>","templateType":"template","template":<approvalMsgTpls.id>}`.

Create an in-app approval message template:

```bash
nb api resource create --resource approvalMsgTpls --values '{"type":"todo","title":"Approval todo","notificationType":"in-app-message","template":{"title":"Approval todo: {{approval.workflowTitle}} (#{{approval.approvalId}})","content":"* Task: {{approval.nodeTitle}}\n* Applicant: {{applicant.nickname}}"}}' -j
```

Update an existing template and read it back:

```bash
nb api resource update --resource approvalMsgTpls --filter-by-tk <templateId> --values '{"title":"Updated approval template"}' -j
nb api resource get --resource approvalMsgTpls --filter-by-tk <templateId> -j
```

Example (trigger, initiator notification):
```json
{
  "channel": "in-app-message",
  "templateType": "template",
  "template": 1
}
```

## Option B — Custom Template (`templateType = "custom"`)

Use this when the workflow needs bespoke wording and there is no reusable `approvalMsgTpls` template to create or reuse. The template is stored inline in the workflow config.

`template` is an object whose shape is defined by the channel plugin's `ContentConfigForm`. Two common channels:

### `in-app-message` (from `plugin-notification-in-app-message`)

```json
{
  "channel": "in-app-message",
  "templateType": "custom",
  "template": {
    "title": "Your expense report has been {{$context.data.status}}",
    "content": "Hi {{{$context.applicant.nickname}}}, your report \"{{{$context.data.title}}}\" was processed.",
    "options": {
      "url": "/admin/expenses/{{$context.data.id}}",
      "mobileUrl": "/m/expenses/{{$context.data.id}}",
      "duration": 5
    }
  }
}
```

- `title` uses standard `{{ }}` delimiters.
- `content` uses triple-brace `{{{ }}}` delimiters (raw text area).
- `options.duration` is in seconds; omit it to keep the message until dismissed.
- `options.url` / `options.mobileUrl` accept internal paths starting with `/` (e.g. `/admin`, `/m`) or external URLs starting with `http`.

### `email` (from `plugin-notification-email`)

```json
{
  "channel": "email",
  "templateType": "custom",
  "template": {
    "subject": "Approval result: {{$context.data.title}}",
    "contentType": "html",
    "html": "<p>Hi {{{$context.applicant.nickname}}},</p><p>Your request \"{{{$context.data.title}}}\" was processed.</p>"
  }
}
```

For `contentType: "text"`, replace `html` with a `text` field of the same shape. Only the field matching `contentType` is required.

### Other channels

For channels not listed above (SMS, webhook, third-party, etc.), inspect the channel plugin's `ContentConfigForm` schema in `packages/plugins/@nocobase/plugin-notification-<channel>/src/client/` to learn the expected fields.

When unsure which option to pick, prefer Option A (dedicated approval message template) and ask the user for the template ID instead of inventing a custom payload.

## Variable Scope by Template Source

Dedicated approval message templates and inline workflow templates are rendered with different data objects, so their available variable roots differ.

### Dedicated `approvalMsgTpls` Templates

`approvalMsgTpls` templates pass approval-specific data directly to the notification manager.

- `todo` templates can use `{{applicant.nickname}}`, `{{approval.workflowTitle}}`, `{{approval.approvalId}}`, `{{approval.dataKey}}`, `{{approval.nodeTitle}}`, `{{approval.approvalRecordTitle}}`, `{{approval.approvalRecordId}}`, and `{{system.now}}`.
- `done` templates can use `{{statusText}}`, `{{approval.workflowTitle}}`, `{{approval.approvalId}}`, `{{approval.dataKey}}`, and `{{system.now}}`.

### Inline Custom Templates

The same template body uses different variable roots depending on where the notification is configured:

- **Trigger notifications** are evaluated in the trigger's `$context` scope. Roots: `data`, `applicant`, `approvalId`. See [triggers/approval.md - Output Variables](../triggers/approval.md#output-variables).
- **Node notifications** are evaluated in the node's scope. The node's own variables live under `$jobsMapByNodeKey.<nodeKey>` (`nodeTitle`, `title`, `status`, `data`, `records`); upstream trigger variables remain available under `$context`. See [nodes/approval.md - Output Variables](../nodes/approval.md#output-variables).
- Approval notifications also receive helper variables such as `approval.workflowTitle`, `approval.approvalId`, `approval.dataKey`, and, for `todo`, task fields such as `approval.nodeTitle`, `approval.approvalRecordTitle`, and `approval.approvalRecordId`.

## Related Notification Management References

- [`nocobase-notification-manage`](../../../nocobase-notification-manage/SKILL.md): use when the work is about notification channels, delivery tests, or send-log diagnosis rather than approval workflow structure.
- [Channel configuration](../../../nocobase-notification-manage/references/channel-configuration.md): use before selecting `channel` when the channel record or provider type is unknown.
- [Workflow notifications](../../../nocobase-notification-manage/references/workflow-notification.md): use for ordinary workflow `notification` nodes; approval trigger/node notifications still use this approval-specific reference.
- [Diagnostics](../../../nocobase-notification-manage/references/diagnostics.md): use after a send attempt when notification delivery is missing or failed.
