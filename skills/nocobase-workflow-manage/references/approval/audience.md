---
title: "Approval Initiator Audience"
description: "How audienceType controls who can initiate an approval, and how to manage the role-based whitelist via approvalAudiences."
---

# Approval Initiator Audience

The `audienceType` field on the approval trigger config decides whether the approval is open to every user that can see the workflow, or restricted to a configured whitelist. Setting it to `0` (restricted) is only half of the configuration — the actual whitelist lives in a separate collection (`approvalAudiences`) and is materialized into a per-user index (`approvalAudienceUsers`) by the server.

## `audienceType` Values

| Value | Meaning | Whitelist required |
|---|---|---|
| `1` (default) | Unrestricted — any user that can see the workflow may initiate. | No |
| `0` | Restricted — only users covered by the configured scope entries may initiate. | **Yes**, via `approvalAudiences:replace` |

When `audienceType=1`, any `approvalAudiences` records that still exist for the workflow are ignored at runtime; the server clears the materialized `approvalAudienceUsers` index for that workflow.

When `audienceType=0` and no scope entries exist, the whitelist is empty — nobody can initiate.

## Scope Types

Each whitelist entry has a `type` (the scope) and a `targetKey` (the identifier inside that scope). The plugin currently ships one scope:

| `type` | `targetKey` | Resolution |
|---|---|---|
| `role` | role `name` (e.g. `admin`, `member`) — **not** the role title or id | All users currently in any of the listed roles |

## Storage Model

Two collections back this feature:

- **`approvalAudiences`** — the configured whitelist. One row per `(workflowId, type, targetKey)`. This is the **input** that you write.
- **`approvalAudienceUsers`** — the materialized per-user index `(workflowId, userId)`. This is **maintained by the server** based on `approvalAudiences` plus the live role membership / scope state. Do not write to it directly.

The server keeps `approvalAudienceUsers` in sync automatically when:

- The `approvalAudiences` whitelist changes (via `approvalAudiences:replace`).
- The workflow is enabled / disabled or its `config` changes.
- Roles are deleted, or users are added to / removed from a whitelisted role.
- A user is deleted.

If `audienceType` flips back to `1`, or the workflow is disabled, the server clears the materialized index for the workflow.

## Configuring the Whitelist

The whitelist is updated atomically through the **replace** action. The server destroys all existing entries that match `filter` and recreates the supplied `values` in a single transaction, then re-syncs the materialized index if the workflow is enabled.

Prefer the `nb` CLI for all whitelist operations. The HTTP API is documented at the bottom as a fallback for environments where the CLI is unavailable.

Before first use in a task, discover exact flag spellings via:

```bash
nb api workflow approval-audiences -h
nb api workflow approval-audiences replace -h
```

(Per [cli/index.md - Canonical Front Door](../cli/index.md#canonical-front-door): all workflow operations live under `nb api workflow ...`. If `approval-audiences` is not listed for the running build, fall back to the generic resource form `nb api resource update --resource approvalAudiences ...` or to the HTTP API.)

### Request Body

The action expects a single JSON body with two fields:

```jsonc
{
  "filter": { "workflowId": <workflowId> },          // required — scopes the destroy step
  "values": [                                        // required — full new whitelist (can be empty)
    { "type": "<scopeType>", "targetKey": "<key>" }
    // ...
  ]
}
```

- `filter.workflowId` must match the workflow whose audience you are editing. The server hard-deletes every `approvalAudiences` row matching this filter before inserting `values`.
- `values` is the **complete new state**, not a delta. To remove all whitelist entries, send `values: []`.
- Each value entry must include `type` and `targetKey`. `workflowId` is auto-injected by the server; you do not need to set it per item, but doing so is harmless.
- Returns HTTP `205 Reset Content` on success.

### CLI Example — Whitelist by Roles

For a non-trivial body, prefer `--body-file` over inline JSON (per [cli/index.md - Practical Rules](../cli/index.md#practical-rules)):

```bash
cat > /tmp/audience.json <<'JSON'
{
  "filter": { "workflowId": 12 },
  "values": [
    { "type": "role", "targetKey": "admin" },
    { "type": "role", "targetKey": "member" }
  ]
}
JSON

nb api workflow approval-audiences replace --body-file /tmp/audience.json
```

Or, for short payloads, inline:

```bash
nb api workflow approval-audiences replace \
  --body '{"filter":{"workflowId":12},"values":[{"type":"role","targetKey":"admin"},{"type":"role","targetKey":"member"}]}'
```

After this call, the trigger config should also have `"audienceType": 0` so the whitelist actually takes effect. Update the workflow config separately:

```bash
nb api workflow workflows update --filter-by-tk 12 --body '{"config":{"audienceType":0}}'
```

(Use `workflows get` first to read the existing `config`, then merge — `update` overwrites `config` wholesale.)

### CLI Example — Clear the Whitelist

```bash
nb api workflow approval-audiences replace \
  --body '{"filter":{"workflowId":12},"values":[]}'
```

Sending an empty `values` array combined with `audienceType=0` makes the workflow uninitiable. If the goal is "open to everyone", flip `audienceType` to `1` in the workflow config instead — clearing the whitelist alone is not equivalent.

## Reading the Current Whitelist

Use the standard list action on the same resource:

```bash
nb api workflow approval-audiences list \
  --filter '{"workflowId":12}' \
  --paginate false
```

Each row carries `id`, `workflowId`, `type`, `targetKey`, `createdAt`, `updatedAt`. The client groups them by `type` for the UI tabs.

To inspect who actually has access right now (after materialization), list the materialized index:

```bash
nb api resource list --resource approvalAudienceUsers --filter '{"workflowId":12}'
```

This is read-only for verification — never mutate `approvalAudienceUsers` directly.

## Authoring Order Recap

When restricting an existing approval workflow:

1. Update the workflow `config.audienceType` to `0` (`nb api workflow workflows update`).
2. Call `nb api workflow approval-audiences replace` with the desired role whitelist.
3. (Optional) verify with `nb api resource list --resource approvalAudienceUsers` that the expected user IDs were materialized — only meaningful while the workflow is enabled.

When opening it back up:

1. Update `config.audienceType` to `1`.
2. The materialized `approvalAudienceUsers` rows for the workflow are cleared automatically; existing `approvalAudiences` rows are kept but ignored. Optionally call `approvalAudiences replace` with `values: []` to also drop the configured whitelist.

## HTTP Fallback

Use this only when the `nb` CLI is not available in the target environment. The CLI form above is the canonical authoring path.

| Action | Endpoint |
|---|---|
| Replace whitelist | `POST /api/approvalAudiences:replace` |
| List whitelist | `GET /api/approvalAudiences:list` |
| Inspect materialized users | `GET /api/approvalAudienceUsers:list` |

Replace example:

```bash
curl -X POST 'http://<host>/api/approvalAudiences:replace' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "filter": { "workflowId": 12 },
    "values": [
      { "type": "role", "targetKey": "admin" },
      { "type": "role", "targetKey": "member" }
    ]
  }'
```

List example:

```
GET /api/approvalAudiences:list?filter[workflowId]=12&paginate=false
```

Body shape and response semantics (`205 Reset Content`, full-replace not delta, etc.) are identical to the CLI form documented above.
