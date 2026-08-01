# AI Employee Workflows

## Inspect and Reuse

1. Verify the employee command surface.
2. List employees and compare username, nickname, position, bio, model restrictions, KB state, and enabled state.
3. Do not run model or KB prerequisites merely to display existing records.
4. Reuse an existing employee when it already satisfies the requested role.
5. If several candidates match, stop and ask the user to choose.

## Create

1. Prove exact username absence.
2. Validate required profile fields and normalize avatar fallback.
3. If `modelSettings` is requested, consume core readiness from `nocobase-ai-manager`.
4. If KB enablement is requested, consume capability and exact-key readiness from `nocobase-ai-knowledge-base-manager`.
5. Build all three KB fields together: switch, prompt, and retrieval settings.
6. Reject protected fields.
7. Put structured data in a protected body file.
8. Create once and suppress unnecessary raw output.
9. Get by username and compare every intended writable field.

Idempotency:

- absent: create;
- present and equal: report satisfied;
- present but different: show safe-field diff and ask update or skip;
- never auto-update a duplicate username.

## Update

1. Read current employee and preserve a writable safe snapshot.
2. Refuse username changes and protected field writes.
3. If `builtIn=true`, preserve identity and deletion protection; allow only documented non-identity settings.
4. Run only prerequisites required by changed fields.
5. Show a safe diff.
6. For disabling or changing/removing answer sources, explain impact and obtain confirmation.
7. Update once by exact username.
8. Read back all changed fields.

Unmentioned fields must be preserved. Do not build a replacement body from a full server response.

## Bind Knowledge Bases

The KB manager owns entitlement, plugin capability, KB resource readiness, and enabled-key validation. This employee manager owns the final employee write.

1. Consume the KB handoff contract.
2. Read the current employee.
3. Resolve or preserve `knowledgeBasePrompt`.
4. Validate `{knowledgeBaseData}`, `topK`, score, and non-empty keys.
5. Show the answer-source impact and obtain confirmation.
6. Update `enableKnowledgeBase`, `knowledgeBasePrompt`, and `knowledgeBase` together.
7. Read back and verify all three fields and that no unrelated writable field changed.

If capability is blocked, do not write partial KB state. Ask whether the user wants a separate non-KB employee operation.

## Unbind or Disable

1. Read current answer-source and enabled state.
2. Explain how responses or availability will change.
3. Obtain fresh impact confirmation.
4. For unbind, set `enableKnowledgeBase=false`; clear or preserve prompt/settings only according to explicit intent.
5. For disable, update only `enabled=false` unless other changes were explicitly requested.
6. Read back and verify.

## Delete

1. Get the exact employee.
2. If absent, report already absent.
3. If `builtIn=true`, refuse.
4. Explain availability impact and recreation limits.
5. Obtain fresh exact-target confirmation immediately before `destroy`.
6. Destroy only that username.
7. Verify it is absent.

## Rollback and Failure Handling

- Create mismatch: deleting the new employee requires separate fresh confirmation.
- Update mismatch: restore the previous writable snapshot and verify.
- KB mismatch: restore switch, prompt, and retrieval settings as one unit.
- Duplicate username: offer inspect, update, or another username.
- Missing model: return to the AI manager.
- Missing/unavailable KB: return to the KB manager; never infer an empty KB list.
- 401/403: stop and report auth/ACL recovery.
- Timeout/5xx: treat write state as unknown and perform one readback before retry decisions.
- Delete restoration: recreate only from an approved safe snapshot.