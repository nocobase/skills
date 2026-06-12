# Channel Configuration

## Core Model

- Channel collection: `notificationChannels`.
- Primary key/filter target: `name`; generated values usually start with `s_`.
- Display field: `title`.
- Provider field: `notificationType`.
- Provider configuration field: `options`.
- Send log collection: `notificationSendLogs`.

## In-App Message

- Channel type: `in-app-message`.
- Plugin: `@nocobase/plugin-notification-in-app-message`.
- Installation: built in; no extra install step is normally required.
- Channel configuration form has no provider secrets. Configure `title` and optional `description`.
- Runtime messages are persisted to `notificationInAppMessages` and pushed to users over websocket events.

Use this when users need application-local notifications, unread/read tracking, or links back to NocoBase pages.

## Email

- Channel type: `email`.
- Plugin: `@nocobase/plugin-notification-email`.
- Installation: preset plugin; it must be enabled before the channel type appears.
- Transport: SMTP only.
- Required `options`: `transport: smtp`, `host`, `port`, `secure`, `account`, `password`, `from`.
- `secure` is commonly `true` for port `465`; other ports commonly use `false`, but verify with the provider.

Never print SMTP passwords or app passwords. When reporting readback, redact `password` and any token-like values.

## nb Resource Commands

Use direct resource commands for channel records:

```bash
nb api resource list --resource notificationChannels --filter '{}' --sort createdAt -j
nb api resource get --resource notificationChannels --filter-by-tk <channelName> -j
```

Create an in-app channel:

```bash
nb api resource create --resource notificationChannels --values '{"name":"s_ops_inbox","title":"Ops inbox","notificationType":"in-app-message","description":"Operational alerts","options":{}}' -j
```

Create an email channel only after confirming SMTP secrets with the user:

```bash
nb api resource create --resource notificationChannels --values '{"name":"s_ops_email","title":"Ops email","notificationType":"email","options":{"transport":"smtp","host":"smtp.example.com","port":465,"secure":true,"account":"ops@example.com","password":"<secret>","from":"Ops <ops@example.com>"}}' -j
```

Update by channel `name` and read back immediately:

```bash
nb api resource update --resource notificationChannels --filter-by-tk <channelName> --values '{"title":"New title"}' -j
nb api resource get --resource notificationChannels --filter-by-tk <channelName> -j
```

Delete only after explicit confirmation:

```bash
nb api resource destroy --resource notificationChannels --filter-by-tk <channelName> -j
```

## Plugin State Handoff

If `email` or `in-app-message` does not appear as an available channel type:

1. Inspect plugin state.
2. Use `nocobase-plugin-manage` for enable or disable operations.
3. Return to this skill only after channel type registration is visible.

## Safe Configuration Steps

1. Inspect existing `notificationChannels`.
2. Resolve whether the request is create or update.
3. Confirm high-risk provider changes, especially SMTP credentials.
4. Write the channel record.
5. Read back the channel by `name`.
6. For email, run only an explicitly approved test send.
