---
name: nocobase-ai-employee-manager
description: "Use when users need to inspect, create, update, enable, bind, verify, or safely delete NocoBase AI employees through nb api ai employees after AI prerequisites are ready."
argument-hint: "[action: inspect|create|update|bind|delete|verify] [employee: username] [env?: name]"
allowed-tools: Bash, Read, Grep
owner: platform-tools
version: 1.0.0
last-reviewed: 2026-07-26
risk-level: high
---

# Goal

Maintain NocoBase AI employee records through the supported `nb api ai employees` command surface after `nocobase-ai-manager` has prepared and verified the required LLM services and models.

# Required Dependency

- Invoke or load [`nocobase-ai-manager`](../nocobase-ai-manager/SKILL.md) before employee mutation.
- Consume its readiness result: target environment, saved LLM service name, enabled chat models, and unresolved dependencies.
- If model prerequisites are missing or unverified, stop employee mutation and return to `nocobase-ai-manager`.
- For knowledge-base-centric setup or document work, coordinate with `nocobase-ai-knowledge-base-manager`.

# Scope

- Inspect AI employees and resolve an exact `username`.
- Create, update, enable, disable, verify, and safely delete custom AI employees.
- Configure the writable profile fields, model restrictions, and knowledge base binding supported by `nb api ai employees`.
- Validate model and knowledge base references before writes.
- Preserve built-in employee protection and perform independent readback after configuration changes.

# Non-Goals

- Do not configure LLM providers or saved LLM services; use `nocobase-ai-manager`.
- Do not create vector databases, knowledge bases, or documents; use `nocobase-ai-knowledge-base-manager`.
- Do not manage AI tools, skills, role visibility, global AI settings, employee templates, move operations, or per-user prompts.
- Do not write `builtIn`, `category`, `deprecated`, `chatSettings`, `dataSourceSettings`, or `skillSettings`.
- Do not place AI employee actions on Modern UI surfaces; use `nocobase-ai-employee` and `nocobase-ui-builder` for that broader workflow.

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `action` | yes | `inspect` | one of `inspect/create/update/bind/delete/verify` | "Which employee action should I perform?" |
| `env` | no | readiness env from `nocobase-ai-manager` | configured, reachable, authenticated | "Which NocoBase CLI environment should I target?" |
| `username` | update/bind/delete/get: yes | none | exact stable username resolved uniquely | "What is the exact AI employee username?" |
| `profile` | create/update: yes | none | writable fields only; required create fields present | "Which nickname, role text, avatar, prompts, and enabled state should be used?" |
| `modelSettings` | create/update: conditional | disabled when omitted | references an enabled saved service and chat model | "Should this employee use a dedicated LLM service/model?" |
| `knowledgeBase` | bind: yes | disabled when omitted | existing enabled keys; valid `topK` and score string | "Which knowledge base keys and retrieval settings should be bound?" |
| `confirmation` | every delete and other high-risk action: yes | none | explicit secondary confirmation after the exact employee and impact are shown; the original request is not sufficient | "Confirm deletion of this exact AI employee?" |

Rules:

- If required input or dependency readiness is missing, stop mutation and ask clarification.
- If the user says "you decide", inspect and recommend reuse candidates only; do not create or change employees.
- Create payloads require `username`, `nickname`, and a supported `avatar`; default an absent or unsupported avatar to `nocobase-015-male`.
- Reject all six forbidden write fields rather than silently dropping them.
- Do not silently convert create to update when `username` already exists.
- Every `nb api ai employees destroy` requires a fresh explicit secondary confirmation immediately before execution, including rollback or cleanup of a newly created custom employee.

# Mandatory Clarification Gate

- Max clarification rounds: `2`.
- Max questions per round: `3`.
- Before mutation, confirm environment, exact username, intended profile values, model references, knowledge base references, and enabled state.
- Before delete, read the employee and refuse when `builtIn=true`.
- For every permitted custom employee delete, show the exact username, environment, availability impact, and recreation limits, then obtain a fresh secondary confirmation immediately before `destroy`. A prior request, plan approval, or batch cleanup confirmation does not count.
- Before disabling or changing model/knowledge base bindings, display the expected user-facing impact.
- If `nocobase-ai-manager` readiness, runtime help, or reference validation fails, stop before writing.

# Workflow

1. Run the `nocobase-ai-manager` prerequisite workflow and retain its verified environment, service, and model result.
2. Refresh runtime if needed and confirm `nb api ai employees --help`; read the [command map](references/command-map.md).
3. List employees and resolve one exact `username`; for create, check that the username is absent.
4. Read the [field contract](references/employee-fields.md); validate required fields, avatar, writable boundaries, and value types.
5. Validate every `modelSettings.models[]` entry against an enabled LLM service and chat model from the prerequisite result.
6. For knowledge base binding, verify each key with `nb api kb list --filter '{"enabled":true}'` or hand off missing setup to `nocobase-ai-knowledge-base-manager`.
7. Compare the intended safe fields with the current employee. If already equal, report satisfied; otherwise show the safe-field diff and plan one write.
8. Use a protected JSON body file for structured payloads; execute one `employees create` or `employees update` command and suppress unnecessary response output.
9. Read back with `employees get --filter-by-tk <username>` and verify profile, avatar, enabled state, `modelSettings`, `enableKnowledgeBase`, and `knowledgeBase`.
10. For delete, require `builtIn=false`, display the exact impact, obtain fresh secondary confirmation immediately before this specific `employees destroy`, execute it, then verify the username no longer appears.
11. Report partial success and rollback limits; clean all temporary files.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [Command map](references/command-map.md) | Selecting list/get/create/update/destroy commands and supported flags. | Includes exact current command surface and excluded operations. |
| [Employee fields](references/employee-fields.md) | Building or reviewing employee payloads. | Writable fields, forbidden fields, avatar, model, and knowledge base schemas. |
| [Employee workflows](references/employee-workflows.md) | Creating, updating, binding, deleting, verifying, or rolling back. | Includes idempotency and dependency checks. |
| [AI manager](../nocobase-ai-manager/SKILL.md) | Any employee mutation. | Required LLM prerequisite dependency. |
| [Knowledge base manager](../nocobase-ai-knowledge-base-manager/SKILL.md) | Knowledge base creation, documents, retrieval testing, or KB-centric employee binding. | Collaborating skill. |
| [AI employee authoring](../nocobase-ai-employee/SKILL.md) | Richer tools/skills/persona selection or UI action placement is needed. | Existing broader authoring skill; outside this CLI manager's write surface. |

# Safety Gate

High-risk actions:

- every custom AI employee deletion, including rollback and cleanup deletion;
- changing or replacing an existing username/identity;
- disabling an employee used by business users;
- changing model or knowledge base bindings that alter answers;
- attempting to mutate protected internal fields or delete a built-in employee.

Secondary confirmation template:

- "Confirm execution: `<action>` on AI employee `<username>` in `<env>`. Expected impact: `<availability/model/knowledge-base impact>`. Type `confirm` to continue."

Rollback guidance:

- If create verification fails, request a separate secondary confirmation immediately before deleting the newly created custom employee.
- If update verification fails, restore the previously read writable fields and verify again.
- Never attempt rollback by writing read-only or internal fields returned by the server.
- If a delete succeeds, restoration requires recreating the custom employee from a previously approved safe snapshot; report that limitation before deletion.

# Verification Checklist

- `nocobase-ai-manager` prerequisite readiness is complete.
- Target environment and `employees` command surface are verified.
- Username is absent for create or uniquely resolved for get/update/delete.
- Create payload contains `username`, `nickname`, and a supported non-empty `avatar`.
- Payload contains only writable employee fields.
- Every model reference points to an enabled saved service and chat model.
- Every knowledge base key exists and is enabled before binding.
- Every create/update has independent `employees get` readback.
- At least one allowed employee configuration matches the intended safe fields.
- At least one denied case is preserved: forbidden field, missing model, missing KB, duplicate username, or built-in delete.
- Every permitted `employees destroy` was preceded by a fresh secondary confirmation for that exact custom employee immediately before execution.
- `builtIn=true` employees are never deleted.
- Errors, partial success, rollback results, and remaining handoffs are reported separately.

# Minimal Test Scenarios

1. Inspect-only: list employees and read one employee without mutation.
2. Create/update: create a custom employee with a verified model, then read back all writable fields.
3. Missing input: omit username, avatar, or prerequisite model readiness and verify mutation is blocked.
4. Auth/capability failure: `employees` help or API authorization fails and the skill stops with recovery guidance.
5. High-risk case: attempt to delete a custom employee and verify fresh secondary confirmation is required immediately before `destroy`; attempt a built-in delete and verify refusal.

# Output Contract

Final response must include:

- target environment, requested action, and exact username;
- prerequisite LLM service/model result consumed;
- knowledge base keys checked when relevant;
- commands executed without secret or internal-field values;
- safe-field readback and allowed/denied validation result;
- confirmation, rollback, partial success, and remaining handoffs;
- defaults such as the avatar fallback that were applied.

# References

- [NocoBase official documentation](https://docs.nocobase.com/): use when checking current AI employee plugin behavior. [verified: 2026-07-26]
- [AI manager](../nocobase-ai-manager/SKILL.md): required prerequisite for LLM service and model readiness.
- [Command map](references/command-map.md): use for the supported `nb api ai employees` commands.
- [Employee fields](references/employee-fields.md): use for writable schemas, forbidden fields, avatar rules, and binding payloads.
- [Employee workflows](references/employee-workflows.md): use for CRUD, verification, safety, and rollback.
- [Knowledge base manager](../nocobase-ai-knowledge-base-manager/SKILL.md): use for KB resources, documents, hit tests, and KB-centric binding.
- [Existing AI employee skill](../nocobase-ai-employee/SKILL.md): use for broader employee selection, tools/skills, and UI action authoring.
