---
name: nocobase-ai-manager
description: "Use when users need to inspect or maintain NocoBase core AI prerequisites through nb api, including LLM providers, saved services, chat models, embedding discovery, secure credentials, and dependency-safe changes."
argument-hint: "[action: inspect|configure|update|delete|verify] [target: llm-provider|llm-service] [consumer?: core-ai|employee|knowledge-base] [env?: name]"
allowed-tools: Bash, Read, Grep
owner: platform-tools
version: 2.0.0
last-reviewed: 2026-08-01
risk-level: high
---

# Goal

Prepare and maintain the core NocoBase AI runtime and saved LLM services required by AI employees and, after the commercial capability gate has passed, knowledge bases. Keep chat-model configuration, embedding-model discovery, credentials, dependency checks, and verification separate and explicit.

# Scope

- Confirm the target `nb` environment, authentication, runtime refresh, and generated `ai` command surface.
- Discover LLM providers, unsaved provider models, saved services, chat models, and embedding models.
- Test provider settings and create, update, enable, disable, verify, or safely delete saved LLM services.
- Produce a structured core-AI readiness result for `nocobase-ai-employee-manager`.
- Produce conditional LLM/embedding prerequisites for `nocobase-ai-knowledge-base-manager` only after that skill has confirmed knowledge-base capability.
- Check employee and knowledge-base dependencies before disruptive LLM service changes.

# Non-Goals

- Do not maintain AI employee records; use `nocobase-ai-employee-manager`.
- Do not determine knowledge-base licensing, install or enable `@nocobase/plugin-ai-knowledge-base`, or maintain knowledge-base resources; use `nocobase-ai-knowledge-base-manager`.
- Do not treat a missing `kb` command as proof of Community Edition.
- Do not manage AI tools, skills, global settings, roles, employee templates, or move operations.
- Do not enable or disable plugins directly; use the plugin-management workflow.
- Do not use curl, direct database mutation, hidden actions, or values copied from secret-bearing responses when a supported `nb api` command exists.

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `action` | yes | `inspect` | one of `inspect/configure/update/delete/verify` | "Which AI prerequisite action should I perform?" |
| `target` | mutation: yes | `llm-provider` for inspect | one of `llm-provider/llm-service` | "Should I inspect providers or manage a saved LLM service?" |
| `consumer` | no | `core-ai` | one of `core-ai/employee/knowledge-base` | "Is this readiness check for core AI, an AI employee, or a knowledge base?" |
| `env` | no | current env from `nb env list` | configured, reachable, authenticated | "Which NocoBase CLI environment should I target?" |
| `identifier` | update/delete/verify: yes as applicable | none | exact saved LLM service `name` | "What is the exact LLM service name?" |
| `payload` | configure/update: yes | none | allowed fields only; secrets supplied by the user | "Which provider, chat models, options, and enabled state should be used?" |
| `knowledgeBaseCapability` | `consumer=knowledge-base`: yes before mutation | none | readiness result from `nocobase-ai-knowledge-base-manager` with `runtimeCapability=available` | "Has the knowledge-base edition/plugin capability preflight passed?" |
| `confirmation` | high-risk action: yes | none | fresh explicit confirmation after exact target and impact are shown | "Confirm this exact disruptive LLM service change?" |

Rules:

- If required input or capability evidence is missing, stop mutation and ask clarification.
- If the user says "you decide", inspect and recommend only; do not create, update, disable, or delete.
- Never invent credentials, provider keys, service names, model identifiers, base URLs, or hidden IDs.
- `enabledModels.models` accepts only large-language/chat models. Never place an embedding model there.
- Discover embedding models separately and return them only for knowledge-base configuration.
- Do not silently convert create into update.

# Mandatory Clarification Gate

- Max clarification rounds: `2`.
- Max questions per round: `3`.
- Before mutation, confirm environment, exact service name, provider, intended chat models, enabled state, secret source, consumer, and dependency impact.
- For a knowledge-base consumer, require a current capability result from `nocobase-ai-knowledge-base-manager`; this skill does not perform or bypass the commercial edition gate.
- Before disable, provider replacement, chat-model removal, or delete, inspect all readable employee and knowledge-base dependencies.
- If knowledge-base dependencies cannot be inspected, treat dependency state as `unknown` and block disruptive service changes.
- Before every service deletion, show the exact service, environment, dependencies, and irreversibility, then obtain a fresh secondary confirmation immediately before `destroy`.
- Never execute a secret-bearing command until protected temporary-file handling is ready.

# Workflow

1. Resolve the target environment with `nb env list`; use `nb env info <env>` only for environment, API, database, and authentication context, not edition detection.
2. Run `nb env update <env> --verbose`, then verify `nb api ai --help`, `nb api ai llm-providers --help`, and `nb api ai llm-services --help`.
3. Read the [command map](references/command-map.md) and select only commands confirmed by current help.
4. Inspect providers and models. Classify every discovered model as chat/LLM or embedding before building any write.
5. For new or changed provider settings, use a protected body file, discover unsaved models, and run `test-flight` with a chat model before saving.
6. Query the exact service name. If absent, create; if present and equivalent on safe fields, report satisfied; if different, show the safe diff and ask update or skip.
7. When `consumer=knowledge-base`, consume the passed capability result and discover embedding models separately. Never add them to the saved service's `enabledModels`.
8. Before disable, provider/model replacement, or delete, inspect employee references. Inspect knowledge-base references only through an available KB capability; if that dependency read is unavailable, stop the disruptive mutation.
9. Execute one requested mutation at a time. Suppress secret-bearing response output and never echo provider `options`.
10. Read back safe fields and verify `name`, `title`, `provider`, `enabled`, and chat-only `enabledModels`.
11. Return a structured readiness contract separating `coreAI` from conditional `knowledgeBasePrerequisites`.
12. Remove protected temporary files on success, failure, interruption, or rollback.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [Command map](references/command-map.md) | Selecting exact environment, provider, service, model, employee, or KB dependency commands. | Includes excluded command surface and capability boundaries. |
| [LLM service workflow](references/llm-services.md) | Testing, creating, updating, disabling, deleting, or verifying a saved service. | Defines chat/embedding separation, idempotency, readiness, and dependency behavior. |
| [Security and troubleshooting](references/security-and-troubleshooting.md) | Handling credentials or runtime, auth, provider, capability, timeout, or rollback failures. | Defines protected files and safe output. |
| [AI employee manager](../nocobase-ai-employee-manager/SKILL.md) | Core AI readiness is complete and employee work should begin. | Downstream owner of all employee writes. |
| [AI knowledge base manager](../nocobase-ai-knowledge-base-manager/SKILL.md) | A request needs knowledge-base licensing, plugin capability, vector resources, documents, or retrieval. | Owner of the Professional+ capability gate. |

# Safety Gate

High-impact actions are the high-risk actions listed below:

- every LLM service deletion, including rollback or cleanup deletion;
- disabling a service used by employees or knowledge bases;
- changing provider, credentials, or enabled chat models on a referenced service;
- proceeding when knowledge-base dependency state is unreadable;
- exposing provider `options`, API keys, access tokens, or secret-bearing response bodies.

Secondary confirmation template:

- "Confirm execution: `<action>` on LLM service `<name>` in `<env>`. Expected impact: `<employee/knowledge-base dependency and availability impact>`. Type `confirm` to continue."

Rollback guidance:

- Create verification failure: preserve evidence; deleting the new service requires a separate fresh confirmation.
- Update mismatch: restore the previous safe fields; credentials must be re-supplied and must not be recovered from logs.
- Delete: restoration is impossible without the original provider secrets and model configuration.
- Unknown KB dependency state: do not mutate; restore capability visibility first instead of guessing.

# Verification Checklist

- Target environment, API base URL, and authentication context are confirmed.
- Runtime refresh completed and required `ai` command groups exist.
- Provider and requested model identifiers were discovered from the target environment.
- Every requested `enabledModels.models[]` item is a chat/LLM model.
- No embedding model appears in `enabledModels`.
- Knowledge-base consumers supplied an available capability result before LLM/embedding mutation.
- Changed provider settings passed `test-flight` with a chat model.
- Write payload contains only documented writable service fields and excludes `modelOptions`.
- Every create/update has independent safe-field readback.
- Employee dependencies were inspected before disruptive changes.
- KB dependencies were inspected, or the disruptive action was blocked because that state was unknown.
- Every `destroy` received fresh confirmation for that exact service immediately before execution.
- Secrets and full `options` are absent from command summaries and final output.
- At least one allowed configuration and one denied case are reported correctly.
- Errors, partial success, rollback limits, and remaining handoffs are separated.

# Minimal Test Scenarios

1. Inspect-only: refresh runtime and list providers and saved services without mutation.
2. Configure: test unsaved settings, save chat-only `enabledModels`, read back, and separately report embedding models for an already capability-approved KB consumer.
3. Missing input: omit provider credentials, service name, or required KB capability evidence and verify mutation is blocked.
4. Auth/runtime failure: refresh or `ai` help fails and the skill stops with actionable recovery guidance.
5. Dependency safety: KB dependency visibility is unavailable during a service delete and the delete is blocked even if employee references are empty.
6. High-risk delete: a dependency-free service is destroyed only after fresh exact-target confirmation and absence verification.

# Output Contract

Final response must include:

- target environment, requested action, target, and consumer;
- runtime/help capability checked;
- provider, service name, chat models, and separately discovered embedding models;
- commands executed without secret values;
- safe-field readback;
- structured `coreAI` and conditional `knowledgeBasePrerequisites` readiness;
- dependency status, including any unknown KB visibility;
- guarded actions, partial success, rollback limits, and handoffs;
- defaults or assumptions applied.

# References

- [NocoBase official documentation](https://docs.nocobase.com/): use when checking current AI plugin and CLI behavior. [verified: 2026-08-01]
- [Command map](references/command-map.md): use for the supported `nb env` and `nb api ai` surface.
- [LLM service workflow](references/llm-services.md): use for provider discovery, testing, CRUD, readiness, and dependency checks.
- [Security and troubleshooting](references/security-and-troubleshooting.md): use for secret handling, capability failures, safe output, and rollback.
- [AI employee manager](../nocobase-ai-employee-manager/SKILL.md): downstream owner of employee lifecycle and bindings.
- [AI knowledge base manager](../nocobase-ai-knowledge-base-manager/SKILL.md): owner of edition/plugin preflight and KB resources.