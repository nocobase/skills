# Workflow Notification

## Node Contract

- Workflow instruction type: `notification`.
- Server instruction plugin: `@nocobase/plugin-workflow-notification`.
- Required node config includes `channelName`.
- Optional behavior: `ignoreFail`; when true, workflow execution continues even if sending fails.
- Send source: workflow notifications write `triggerFrom: workflow`.

The instruction parses variables from upstream workflow scope and sends through the notification manager. Normal execution uses the manager queue when the channel type is queued. Node test uses direct `sendNow`.

## In-App Message Fields

Use these fields when the selected channel type is `in-app-message`:

- `receivers`: required; selected users or upstream variables resolving to user id or user id arrays.
- `title`: required message title.
- `content`: required message body; supports workflow variables.
- `options.url`: optional desktop details page; internal links start with `/`, external links start with `http`.
- `options.mobileUrl`: optional mobile details page; internal links start with `/m`, external links start with `http`.
- `options.duration`: optional auto-close seconds.

## Email Message Fields

Use these fields when the selected channel type is `email`:

- `to`: required unless sending by `receivers.type: userId` through lower-level APIs.
- `cc`, `bcc`: optional arrays.
- `subject`: required.
- `contentType`: `html` or `text`; default form behavior is `html`.
- `html`: required when `contentType` is `html`.
- `text`: required when `contentType` is `text`.

## nb Resource Readback

Before authoring or changing a workflow notification node, resolve channel names through resource commands:

```bash
nb api resource list --resource notificationChannels --filter '{}' -j
nb api resource get --resource notificationChannels --filter-by-tk <channelName> -j
```

After a workflow send or node test, verify delivery evidence with send logs:

```bash
nb api resource list --resource notificationSendLogs --filter '{"channelName":"<channelName>","triggerFrom":"workflow"}' --sort -createdAt --page-size 20 -j
```

Workflow node creation, update, test, execution, and revision operations belong to `nocobase-workflow-manage`; do not model them as generic `nb api resource` calls in this skill.

## Workflow Handoff Rules

Use `nocobase-workflow-manage` when the task needs trigger design, node creation, node movement, revisions, enabling, or execution diagnosis. Keep this skill focused on notification-specific config values and delivery evidence.

Before changing an existing workflow node, inspect whether the workflow version has executed. If it has, follow workflow revision rules instead of editing the frozen version directly.
