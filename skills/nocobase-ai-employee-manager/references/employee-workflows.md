# AI Employee Workflows

## Inspect and Reuse

1. Verify prerequisites through `nocobase-ai-manager`.
2. List employees and compare username, nickname, position, bio, model restrictions, and enabled state.
3. Reuse an existing employee when it already satisfies the requested role.
4. If several candidates match, stop and ask the user to choose.

## Create

1. Check exact username absence.
2. Validate required fields and replace an invalid/missing avatar with `nocobase-015-male`.
3. Validate model service/model and any knowledge base keys.
4. Reject forbidden fields.
5. Put structured data in a protected body file.
6. Create once, preferably suppressing the raw response body.
7. Get by username and compare all intended writable fields.

Idempotency:

- absent: create;
- present and equal: report satisfied;
- present but different: show safe-field diff and ask update or skip;
- never auto-update a duplicate username.

## Update or Bind

1. Read current employee and preserve a safe snapshot of writable fields.
2. If `builtIn=true`, allow only supported configuration changes; never change identity or delete.
3. Validate each new model and knowledge base reference.
4. Show the effect of disabling or changing answer sources.
5. Obtain confirmation for user-facing impact.
6. Update by exact username.
7. Read back `modelSettings`, `enableKnowledgeBase`, `knowledgeBase`, `enabled`, avatar, and requested profile fields.

Employee-centric binding example fields:

```text
enableKnowledgeBase=true
knowledgeBase={topK,score,knowledgeBaseKeys}
```

Use `nocobase-ai-knowledge-base-manager` when the knowledge base itself, documents, independently requested re-vectorization/retry, or hit testing must be prepared. Normal document uploads vectorize automatically, so do not ask the user whether to vectorize after upload.

## Delete

1. Get the exact employee.
2. If absent, report already absent.
3. If `builtIn=true`, refuse.
4. Explain the exact availability impact and recreation limits.
5. Obtain a fresh explicit secondary confirmation immediately before this specific `destroy`; the original request or any earlier/batch confirmation is not sufficient.
6. Destroy only that confirmed username.
7. Verify list/get no longer returns the employee.

## Rollback

- Create verification failure: request a separate secondary confirmation immediately before deleting the newly created custom employee.
- Update mismatch: restore the previous writable-field snapshot and verify.
- Never include forbidden read-only/internal fields in rollback payloads.
- Delete restoration: recreate only from an approved safe snapshot; do not claim automatic rollback.

## Failure Handling

| Failure | Response |
|---|---|
| Duplicate username | Stop; offer inspect, update, or a different username. |
| Model service/model missing | Return to `nocobase-ai-manager`. |
| Knowledge base key missing | Return to `nocobase-ai-knowledge-base-manager`. |
| Forbidden field requested | Refuse the field and explain the current CLI boundary. |
| 401/403 | Stop and report env/auth/ACL recovery. |
| Timeout/5xx | Treat write state as unknown; perform one readback before retry decisions. |
