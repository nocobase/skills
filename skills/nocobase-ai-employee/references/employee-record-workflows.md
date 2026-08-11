# AI Employee CLI Record Workflows

These workflows implement the record-management chapter of `nocobase-ai-employee` through `nb api ai employees`.

## Inspect and Reuse

1. Verify the employee command surface.
2. List employees and compare username, nickname, position, bio, model restrictions, specialist-provided state, and enabled state.
3. Do not run model or specialist prerequisite workflows merely to display existing records.
4. Reuse an existing employee when it already satisfies the requested role.
5. If several candidates match, stop and ask the user to choose.

## Create

1. Prove exact username absence.
2. Validate required profile fields and normalize avatar fallback.
3. If `modelSettings` is requested, consume core readiness from `nocobase-ai-manager`.
4. If a specialist handoff is requested, consume its verified employee-field payload without duplicating the specialist's validation rules.
5. Reject protected fields.
6. Put structured data in a protected body file.
7. Create once and suppress unnecessary raw output.
8. Get by username and compare every intended writable field.

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
6. For disabling, model changes, or specialist-provided field changes, explain impact and obtain confirmation.
7. Update once by exact username.
8. Read back all changed fields.

Unmentioned fields must be preserved. Do not build a replacement body from a full server response.

## Knowledge-Base Handoff

1. Use `nocobase-ai-knowledge-base-manager` for all capability, resource, retrieval, prompt, and binding preparation.
2. Accept only its verified employee-field handoff; do not reconstruct or partially apply the payload.
3. Read the current employee, show any user-facing impact, and obtain confirmation when required.
4. Apply the handed-off employee fields once, preserve unrelated fields, and read back the result.
5. If the handoff is blocked, unavailable, or stale, stop and return to the specialist skill.


## Disable

1. Read the current enabled state and explain how availability will change.
2. Obtain fresh impact confirmation.
3. Update only `enabled=false` unless other changes were explicitly requested.
4. Read back and verify.

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
- Duplicate username: offer inspect, update, or another username.
- Missing model: return to the AI manager.
- Missing or unavailable specialist handoff: return to the originating skill; never guess or synthesize its payload.
- 401/403: stop and report auth/ACL recovery.
- Timeout/5xx: treat write state as unknown and perform one readback before retry decisions.
- Delete restoration: recreate only from an approved safe snapshot.