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

## Entry Shape

```jsonc
{
  "channel": "<channel.name>",          // required — name field from notificationChannels
  "templateType": "template" | "custom", // default "template"
  "template": <id> | <object>            // required — see below
}
```

Each entry sends one message through one channel. Multiple entries are allowed but each `channel` may only appear once per surface.

`channel` is the `name` of an enabled notification channel. Look up channels via `notificationChannels:list` (e.g. `in-app-message`, `email`).

## Option A — System Template (`templateType = "template"`)

Use this when a reusable template already exists in the Notification Manager. Most general-purpose approvals should pick this option.

- `template` is the numeric template `id`.
- Fetch candidate templates via `approvalMsgTpls:list`. Filter by:
  - `notificationType` — must equal the channel's `notificationType` (e.g. `in-app-message`, `email`). Get this from the `notificationChannels` record by `channel.name`.
  - `type` — `done` for triggers (initiator-facing), `todo` for nodes (approver-facing).
- If no suitable template exists, either (1) create one in the Notification Manager and reference its ID, or (2) inline a custom template (Option B).

Example (trigger, initiator notification):
```json
{
  "channel": "in-app-message",
  "templateType": "template",
  "template": 1
}
```

## Option B — Custom Template (`templateType = "custom"`)

Use this when the workflow needs bespoke wording and there is no reusable template to create in the Notification Manager. The template is stored inline in the workflow config.

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

When unsure which option to pick, prefer Option A (system template) and ask the user for the template ID instead of inventing a custom payload.

## Variable Scope by Surface

The same template body uses different variable roots depending on where the notification is configured:

- **Trigger notifications** are evaluated in the trigger's `$context` scope. Roots: `data`, `applicant`, `approvalId`. See [triggers/approval.md - Output Variables](../triggers/approval.md#output-variables).
- **Node notifications** are evaluated in the node's scope. The node's own variables live under `$jobsMapByNodeKey.<nodeKey>` (`nodeTitle`, `title`, `status`, `data`, `records`); upstream trigger variables remain available under `$context`. See [nodes/approval.md - Output Variables](../nodes/approval.md#output-variables).
