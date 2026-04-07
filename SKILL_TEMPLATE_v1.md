# SKILL Template v1

Use this template to create new skills under `skills/<skill-name>/SKILL.md`.

Reference standards:

- [`SKILL_SPEC_v1.md`](./SKILL_SPEC_v1.md)
- [`skill-lint-checklist.md`](./skill-lint-checklist.md)

```md
---
name: your-skill-name
description: Use when users need to {{core objective}} in NocoBase, including {{scope-a}} and {{scope-b}}.
argument-hint: "[action: inspect|create|update|delete] [target] [options]"
allowed-tools: MCP, Read
owner: {{team-or-person}}
version: 1.0.0
last-reviewed: 2026-04-07
risk-level: medium
---

# Goal

Deliver {{one-sentence objective}} with deterministic steps, explicit safety gates, and verifiable outputs.

# Scope

- Handle: {{capability-a}}
- Handle: {{capability-b}}
- Handle: {{capability-c}}

# Non-Goals

- Do not handle: {{boundary-a}}
- Do not handle: {{boundary-b}}
- Do not handle: {{boundary-c}}

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `action` | yes | `inspect` | one of `inspect/create/update/delete` | "Which action do you want: inspect, create, update, or delete?" |
| `target` | yes | none | non-empty string | "Please provide the target name or identifier." |
| `dataSource` | no | `main` | must exist in enabled data sources | "Use `main` data source, or specify another one?" |
| `mode` | no | `safe` | one of `safe/fast` | "Do you prefer safe mode (recommended) or fast mode?" |

Rules:

- If any required input is missing, stop mutation and ask clarification.
- If user says "you decide", use documented defaults.
- Never assume hidden identifiers; resolve from real metadata first.

# Mandatory Clarification Gate

- Max clarification rounds: `2`
- Max questions per round: `3`
- Mutation preconditions:
- `action` and `target` are confirmed.
- Authentication and tool reachability are confirmed.
- Required capability/tool exists in current MCP schema.
- If preconditions are not met, stop and report missing inputs/capabilities.

# Workflow

1. Confirm reachability and authentication.
2. Resolve target from metadata.
3. Inspect current state and constraints.
4. Build minimal execution plan in plain language.
5. Execute one mutation at a time (if needed).
6. Read back immediately after each write.
7. Compare result with intended state.
8. Summarize done items and unresolved gaps.
9. Provide next-step options if relevant.

# Safety Gate

- High-risk actions require secondary confirmation before execution.
- High-risk actions include:
- destructive delete
- overwrite/replace operations
- permission elevation
- publish/release-like operations
- migration affecting production data

Secondary confirmation template:

- "Confirm execution: {{action}} on {{scope}}. Expected impact: {{impact}}. Type `confirm` to continue."

Rollback guidance:

- Trigger rollback when {{failure condition}}.
- Rollback steps:
- restore from {{backup source}}
- verify {{critical checks}}
- report {{incident summary fields}}

# Verification Checklist

- Target exists and is uniquely resolved.
- Authentication state is valid.
- Tool/capability required by this task is available.
- Input values pass validation rules.
- Every write has immediate readback verification.
- Result matches intended state for at least one allowed case.
- Denied/guarded behavior is validated for at least one negative case.
- Side effects are documented (data/permission/route/config impact).
- Errors and partial successes are reported separately.
- Final output includes data source/context used.

# Minimal Test Scenarios

1. Happy path: complete inputs, inspect-only.
2. Happy path: complete inputs, mutation + readback success.
3. Missing required input: clarification gate blocks mutation.
4. Auth/tool failure: stop with actionable recovery message.
5. High-risk action: secondary confirmation is required and enforced.

# Output Contract

Final response must include:

- What was requested.
- What was executed.
- What was verified.
- What failed or remains unclear.
- Which defaults/assumptions were applied.
- Exact next actions for user (if blocked).

# References

- Official docs: {{url-1}}
- Official docs: {{url-2}}
- Internal reference: `references/{{topic}}.md`
```

## Optional Variant: High-Risk Skills

If `risk-level: high`, add these extra sections in the generated skill file:

- `# Change Window`
- `# Approval Chain`
- `# Rollback Drill`
- `# Post-Change Audit`

And require explicit secondary confirmation for all mutation actions.
