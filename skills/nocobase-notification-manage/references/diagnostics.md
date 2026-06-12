# Diagnostics

## Evidence Sources

- Channels: `notificationChannels`.
- Send logs: `notificationSendLogs`.
- In-app message records: `notificationInAppMessages`.
- Current-user inbox resources: `myInAppMessages` and `myInAppChannels`.
- Workflow node jobs: workflow execution jobs for node type `notification`.
- Server logs: notification manager logger under `notification-manager`.

## Send Log Fields

Check these fields first:

- `status`: `success` or `failure`.
- `reason`: provider error, missing channel, queue/publish failure, or send exception.
- `channelName`: must match an existing `notificationChannels.name`.
- `channelTitle`: confirms which display channel was used.
- `notificationType`: confirms provider type.
- `triggerFrom`: `workflow`, `sendToUsers`, or another caller.
- `message`: rendered message payload and receiver metadata.

## nb Resource Commands

Read recent send logs:

```bash
nb api resource list --resource notificationSendLogs --filter '{}' --sort -createdAt --page-size 20 -j
```

Filter logs for one channel or failures:

```bash
nb api resource list --resource notificationSendLogs --filter '{"channelName":"<channelName>"}' --sort -createdAt --page-size 20 -j
nb api resource list --resource notificationSendLogs --filter '{"status":"failure"}' --sort -createdAt --page-size 20 -j
```

Inspect current user in-app inbox state:

```bash
nb api resource list --resource myInAppChannels --filter '{"status":"all"}' -j
nb api resource list --resource myInAppMessages --filter '{"status":"unread"}' -j
```

Inspect raw in-app message records only when permissions allow it:

```bash
nb api resource list --resource notificationInAppMessages --filter '{"channelName":"<channelName>"}' --sort -receiveTimestamp --page-size 20 -j
nb api resource get --resource notificationInAppMessages --filter-by-tk <messageId> -j
```

`notificationInAppMessages:updateMyOwn` and `messages:send` are custom actions, not generic `nb api resource update/create` calls. Use their swagger-generated runtime commands when available; otherwise call the API directly through the app client.

## Common Failures

- `channel not found`: node or API uses a stale or guessed `channelName`.
- Missing email delivery but success log: SMTP accepted the message; inspect provider-side spam, bounce, or recipient policy.
- Email failure with auth or connection reason: verify `host`, `port`, `secure`, `account`, `password`, and provider app-password rules.
- In-app message not visible: verify `receivers` resolve to existing user ids and inspect `notificationInAppMessages`.
- Workflow stopped: inspect notification job result and `ignoreFail`.

## Triage Sequence

1. Confirm plugin state and available channel types.
2. Read the channel record and redact secrets in reports.
3. Inspect recent `notificationSendLogs` filtered by `channelName`.
4. For workflow sends, inspect the notification node job result.
5. For in-app sends, confirm per-user records exist.
6. For email sends, separate SMTP submission success from mailbox delivery success.
