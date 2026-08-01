---
name: nocobase-ai-employee-manager
description: "Use when users need to inspect, create, update, enable, configure answer sources, verify, or safely delete NocoBase AI employees through nb api ai employees."
argument-hint: "[action: inspect|create|update|bind|unbind|delete|verify] [employee: username] [env?: name]"
allowed-tools: Bash, Read, Grep
owner: platform-tools
version: 2.0.0
last-reviewed: 2026-08-01
risk-level: high
---

# Goal

Own all supported AI employee record writes through `nb api ai employees`, using prerequisite-aware model validation, edition-aware knowledge-base handoffs, exact-field updates, independent readback, and explicit protection for built-in or business-critical employees.

# Scope

- Inspect employees and resolve one exact stable `username`.
- Create, update, enable, disable, verify, and safely delete custom AI employees.
- Configure supported profile fields and dedicated chat-model restrictions.
- Own the final employee write for knowledge-base enablement, prompt, retrieval settings, binding, and unbinding.
- Validate every model reference through `nocobase-ai-manager`.
- Validate every knowledge-base capability and key through `nocobase-ai-knowledge-base-manager` before employee binding.
- Preserve built-in identity/delete protection and perform independent readback after writes.

# Non-Goals

- Do not configure LLM providers or saved services; use `nocobase-ai-manager`.
- Do not determine knowledge-base edition entitlement or create vector databases, knowledge bases, or documents; use `nocobase-ai-knowledge-base-manager`.
- Do not silently remove a requested knowledge-base binding when the environment lacks Professional+ capability.
- Do not manage AI tools, skills, role visibility, global AI settings, employee templates, move operations, or per-user prompts.
- Do not write protected internal fields or place employee actions on UI surfaces.

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `action` | yes | `inspect` | one of `inspect/create/update/bind/unbind/delete/verify` | "Which employee action should I perform?" |
| `env` | no | current env from `nb env list` | configured, reachable, authenticated | "Which NocoBase CLI environment should I target?" |
| `username` | create/update/bind/unbind/delete/verify: yes; inspect: optional | none | exact stable username resolved uniquely when supplied | "What is the exact AI employee username?" |
| `profile` | create/update: conditional | preserve existing values | writable fields only; required create fields present | "Which supported profile fields should change?" |
| `modelSettings` | create/update: conditional | preserve existing or disabled when omitted on create | enabled saved service and chat model only | "Should this employee use a dedicated LLM service and chat model?" |
| `knowledgeBasePrompt` | bind: yes | preserve existing; otherwise product-style default | non-empty and contains `{knowledgeBaseData}` | "What prompt should wrap retrieved knowledge-base content?" |
| `knowledgeBase` | bind: yes | `topK=3`, `score="0.6"` when user leaves values open | enabled existing keys; `topK` 1..100; score 0..1 stored as string | "Which knowledge bases and retrieval settings should be bound?" |
| `confirmation` | high-risk action: yes | none | fresh confirmation after exact employee and impact are shown | "Confirm this exact employee availability or answer-source change?" |

Rules:

- If required input or dependency readiness is missing, stop mutation and ask clarification.
- If the user says "you decide", inspect and recommend reuse candidates only; do not create or change employees.
- Create requires `username`, `nickname`, and a supported avatar; default an absent or unsupported avatar to `nocobase-015-male`.
- Reject forbidden fields rather than silently dropping them.
- Never silently convert duplicate create into update.
- Do not run LLM prerequisite work for a simple read-only employee inspection unless model validation is requested.
- Do not run KB commands until the KB manager has returned `runtimeCapability=available`.

# Mandatory Clarification Gate

- Max clarification rounds: `2`.
- Max questions per round: `3`.
- Before mutation, confirm environment, exact username, intended writable fields, enabled state, model references, and any KB binding intent.
- For model changes, require a current `nocobase-ai-manager` core readiness result.
- For bind/unbind or any write to `enableKnowledgeBase`, `knowledgeBasePrompt`, or `knowledgeBase`, require a current KB capability/key result from `nocobase-ai-knowledge-base-manager`.
- If KB capability is blocked, explain the Professional+ restriction and ask whether the user wants a separate employee operation without KB; never downgrade automatically.
- Before disabling an employee or changing/removing an existing answer source, show the user-facing impact and obtain secondary confirmation.
- Before delete, read the employee, refuse `builtIn=true`, show exact impact and recreation limits, and obtain fresh confirmation immediately before `destroy`.

# Workflow

1. Resolve the environment and verify `nb api ai employees --help`; read the [command map](references/command-map.md).
2. List/get employees and resolve one exact username; for create, prove the username is absent.
3. Read the [field contract](references/employee-fields.md) and reject unsupported or protected fields.
4. Run `nocobase-ai-manager` only when creating/changing `modelSettings` or when the requested operation otherwise needs model readiness.
5. For KB binding, run `nocobase-ai-knowledge-base-manager` preflight first. Require Professional+ capability, enabled exact KB keys, and a binding handoff contract.
6. Build the complete intended employee safe-field state. For KB enablement include `enableKnowledgeBase`, `knowledgeBasePrompt`, and `knowledgeBase` together.
7. Compare intended and current safe fields. If equal, report satisfied; otherwise show the safe diff and planned one-record write.
8. Obtain confirmation for disabling or answer-source changes when required.
9. Use a protected body file for structured payloads; execute one create/update and suppress unnecessary raw output.
10. Read back by username and verify every intended writable field, including prompt placeholder and KB retrieval settings.
11. For delete, require `builtIn=false`, obtain fresh exact-target confirmation immediately before `destroy`, execute once, and verify absence.
12. Report capability state, partial success, rollback limits, and downstream work separately; remove temporary files.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [Command map](references/command-map.md) | Selecting employee commands and prerequisite handoffs. | Includes exact supported CRUD and exclusions. |
| [Employee fields](references/employee-fields.md) | Building or reviewing profile, model, or KB payloads. | Defines writable/forbidden fields, prompt, defaults, and ranges. |
| [Employee workflows](references/employee-workflows.md) | Creating, updating, binding, disabling, deleting, verifying, or rolling back. | Defines ownership and idempotency. |
| [AI manager](../nocobase-ai-manager/SKILL.md) | A model restriction is created or changed. | Supplies core AI service/chat-model readiness. |
| [Knowledge base manager](../nocobase-ai-knowledge-base-manager/SKILL.md) | Any KB capability, resource, document, hit-test, or binding preparation is needed. | Supplies Professional+ capability and enabled exact keys. |

# Safety Gate

High-impact actions are the high-risk actions listed below:

- every custom employee deletion, including rollback or cleanup deletion;
- changing username/identity;
- disabling an employee used by business users;
- changing or removing model and KB answer sources;
- enabling KB retrieval without an available Professional+ capability result;
- writing protected internal fields or deleting a built-in employee.

Secondary confirmation template:

- "Confirm execution: `<action>` on AI employee `<username>` in `<env>`. Expected impact: `<availability/model/knowledge-base impact>`. Type `confirm` to continue."

Rollback guidance:

- Create verification failure: deleting the new custom employee requires a separate fresh confirmation.
- Update mismatch: restore the previous writable safe-field snapshot and verify again.
- KB binding mismatch: restore the prior `enableKnowledgeBase`, `knowledgeBasePrompt`, and `knowledgeBase` together.
- Delete: recreation requires an approved safe snapshot; never claim automatic restoration.
- Never write read-only/internal fields during rollback.

# Verification Checklist

- Target environment and `employees` command surface are verified.
- Username is absent for create or uniquely resolved for other actions.
- Create payload contains username, nickname, and a supported avatar.
- Payload contains only documented writable employee fields.
- Every model reference points to an enabled saved service and chat model.
- KB writes consumed an available Professional+ capability result.
- Every bound KB key exists and is enabled.
- Enabled KB retrieval has a non-empty prompt containing `{knowledgeBaseData}`.
- KB `topK` is 1..100 and score is a string representing a number from 0 through 1.
- Every create/update has independent employee readback.
- Built-in employees are never deleted or identity-mutated.
- Disabling and answer-source changes received impact confirmation when required.
- Every permitted `destroy` received fresh exact-target confirmation immediately before execution.
- At least one allowed configuration and one denied case are preserved.
- Errors, partial success, rollback, capability blocks, and handoffs are reported separately.

# Minimal Test Scenarios

1. Inspect-only: list employees and read one employee without invoking unnecessary LLM/KB prerequisite workflows.
2. Create/update: configure a custom employee with a verified chat model and read back all intended fields.
3. KB bind: consume an available KB handoff, write prompt plus retrieval settings, and verify all three KB fields.
4. Edition blocked failure: KB capability is unlicensed/unavailable; no employee KB field is written, and the user is asked whether to continue separately without KB.
5. Missing/auth failure: omit username or fail employee API authorization and verify mutation stops.
6. High-risk delete: refuse a built-in delete; delete a custom employee only after fresh confirmation and absence verification.

# Output Contract

Final response must include:

- target environment, requested action, and exact username;
- model prerequisite result when used;
- KB edition/plugin capability and exact keys when relevant;
- commands executed without secret/internal values;
- safe-field readback, including `knowledgeBasePrompt` when KB is enabled;
- confirmation, rollback, partial success, and remaining handoffs;
- defaults such as avatar, `topK`, score, or product-style KB prompt that were applied.

# References

- [NocoBase official documentation](https://docs.nocobase.com/ai-employees/): use when checking current AI employee behavior. [verified: 2026-08-01]
- [Command map](references/command-map.md): use for supported employee commands and exclusions.
- [Employee fields](references/employee-fields.md): use for writable schemas, prompt rules, defaults, and protected fields.
- [Employee workflows](references/employee-workflows.md): use for CRUD, binding, verification, safety, and rollback.
- [AI manager](../nocobase-ai-manager/SKILL.md): use for saved service and chat-model readiness.
- [Knowledge base manager](../nocobase-ai-knowledge-base-manager/SKILL.md): use for Professional+ capability and KB resource readiness.