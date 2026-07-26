---
name: nocobase-ai-manager
description: "Use when users need to prepare or maintain NocoBase AI prerequisites through nb api, including LLM provider discovery, LLM service configuration, runtime refresh, secure credentials, and dependency checks for AI employees or knowledge bases."
argument-hint: "[action: inspect|configure|update|delete|verify] [target: llm-provider|llm-service] [env?: name]"
allowed-tools: Bash, Read, Grep
owner: platform-tools
version: 1.0.0
last-reviewed: 2026-07-26
risk-level: high
---

# Goal

Prepare the shared NocoBase AI runtime and LLM configuration required by AI employees and knowledge bases, using only `nb env` and `nb api` with protected secrets, dependency-aware changes, and independent readback verification.

# Scope

- Confirm the target `nb` environment, authentication, plugin capability, and generated `ai`/`kb` command surface.
- Discover LLM providers, provider models, saved services, chat models, and embedding models.
- Test unsaved provider settings and manage saved LLM services through `nb api ai llm-providers` and `nb api ai llm-services`.
- Produce a prerequisite readiness result that downstream AI employee and knowledge base skills can consume.
- Check AI employee and knowledge base references before disabling, replacing, or deleting an LLM service.

# Non-Goals

- Do not maintain AI employee records; hand off to `nocobase-ai-employee-manager`.
- Do not maintain vector databases, knowledge bases, or documents; hand off to `nocobase-ai-knowledge-base-manager`.
- Do not manage AI tools, skills, settings, roles, employee templates, or move operations.
- Do not enable or disable plugins directly; use `nocobase-plugin-manage` when plugin state must change.
- Do not use curl, direct database mutation, hidden actions, or values copied from secret-bearing responses.

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `action` | yes | `inspect` | one of `inspect/configure/update/delete/verify` | "Which AI prerequisite action should I perform?" |
| `target` | mutation: yes | `llm-provider` for inspect | one of `llm-provider/llm-service` | "Should I inspect providers or manage a saved LLM service?" |
| `env` | no | current env from `nb env list` | configured, reachable, authenticated | "Which NocoBase CLI environment should I target?" |
| `identifier` | update/delete/get: yes | none | exact LLM service `name`, resolved uniquely | "What is the exact LLM service name?" |
| `payload` | configure/update/test: yes | none | allowed fields only; secrets supplied by the user | "Which provider, models, options, and enabled state should be used?" |
| `confirmation` | every delete and other high-risk action: yes | none | explicit secondary confirmation after the exact target and impact are shown; the original request is not sufficient | "Confirm the named LLM service deletion or other high-risk change?" |

Rules:

- If a required input is missing or a target is ambiguous, stop mutation and ask clarification.
- If the user says "you decide", inspect the current environment only; do not create, update, disable, or delete anything.
- Never invent API keys, base URLs, model names, service names, or hidden identifiers.
- Reject `enabledModels.mode=recommended` and any create/update payload containing `modelOptions`.
- For `nb api ai llm-services create/update`, `--enabled-models` may contain **only large-language/chat models**. Never include an embedding model in `enabledModels`.
- Discover embedding models separately and pass the selected embedding model only to knowledge base configuration such as `nb api kb create/update --embedding-model`.
- Use saved service `name` as the stable identifier and do not silently convert create into update.
- Every `nb api ai llm-services destroy` requires a fresh explicit secondary confirmation immediately before execution, including rollback or cleanup of a newly created test service.

# Mandatory Clarification Gate

- Max clarification rounds: `2`.
- Max questions per round: `3`.
- Before mutation, confirm environment, exact service name, provider, intended models, enabled state, secret source, and dependency impact.
- Before delete, disable, or provider/model replacement, inspect references from knowledge bases and AI employees.
- For every LLM service delete, show the exact service name, environment, dependencies, and irreversibility, then obtain a fresh secondary confirmation immediately before `destroy`. A prior request, plan approval, or batch cleanup confirmation does not count.
- If `nb env update <env> --verbose` or required help commands fail, stop and report the missing runtime/plugin capability.
- Never execute a secret-bearing command until protected temporary-file handling is ready.

# Workflow

1. Run `nb env list` and confirm the selected environment; inspect `nb env info <env>` when identity or API base URL is unclear.
2. Run `nb env update <env> --verbose`, then verify `nb api ai --help`, `nb api ai llm-providers --help`, and `nb api ai llm-services --help`.
3. Read the [command map](references/command-map.md) and select only a documented command.
4. Inspect providers with `list-llm-providers`; classify discovered models by type. Only large-language/chat models are eligible for `llm-services create/update --enabled-models`.
5. Discover embedding models separately for downstream knowledge base use; never add them to `enabledModels`. For new or changed provider settings, create a protected JSON body file and run `test-flight` with a chat model before saving.
6. Query by exact service name. If absent, create; if present and equivalent, report satisfied; if different, show safe-field differences and ask update or skip.
7. Before disable, provider/model replacement, or delete, inspect `nb api kb list` and `nb api ai employees list` for references.
8. If deleting, display the exact LLM service and impact, obtain fresh secondary confirmation, then execute that one `llm-services destroy`. Otherwise execute one requested mutation at a time. Suppress secret-bearing response bodies and never echo `options`.
9. Read back through the safe provider service list or a field-limited `llm-services` read; compare `name`, `title`, `provider`, `enabled`, and `enabledModels`.
10. Return the prerequisite readiness contract: environment, service name, provider, chat models configured in `enabledModels`, separately discovered embedding models for knowledge bases, and unresolved dependencies.
11. Clean protected temporary files on success, failure, interruption, or rollback.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [Command map](references/command-map.md) | Checking exact supported commands and excluded operations. | Covers runtime refresh, provider discovery, and LLM service CRUD. |
| [LLM service workflow](references/llm-services.md) | Testing, creating, updating, disabling, deleting, or verifying an LLM service. | Includes allowed fields, payload shapes, idempotency, and dependency checks. |
| [Security and troubleshooting](references/security-and-troubleshooting.md) | Handling credentials or recovering from runtime, auth, provider, validation, or dependency errors. | Defines protected files, safe output, cleanup, and error handling. |
| [AI employee manager](../nocobase-ai-employee-manager/SKILL.md) | The prerequisite is ready and employee maintenance should begin. | Downstream skill dependency. |
| [AI knowledge base manager](../nocobase-ai-knowledge-base-manager/SKILL.md) | The prerequisite is ready and vector/knowledge base work should begin. | Downstream skill dependency. |

# Safety Gate

High-risk actions:

- every LLM service deletion, including rollback and cleanup deletion;
- disabling an LLM service;
- changing provider, credentials, or enabled models on a referenced service;
- replacing a service configuration when the target match is ambiguous;
- exposing `options`, API keys, access tokens, or secret-bearing response bodies.

Secondary confirmation template:

- "Confirm execution: `<action>` on LLM service `<name>` in `<env>`. Expected impact: `<employee/knowledge-base dependencies and availability impact>`. Type `confirm` to continue."

Rollback guidance:

- If create succeeds but verification fails, preserve evidence, then request a separate secondary confirmation immediately before deleting the new service.
- If update verification differs, restore the previously read safe fields; the user must re-supply secret `options` because they must not be recovered from logs.
- A delete cannot be automatically rolled back without the original provider secrets and model configuration; state this before deletion.
- If dependencies reject or make rollback unsafe, stop and report the exact remaining state.

# Verification Checklist

- Target environment, API base URL, and authentication are confirmed.
- Runtime refresh completed and required `ai` commands exist.
- Provider and requested model types are actually discoverable.
- Unsaved or changed provider settings pass `test-flight`.
- LLM payload contains only `name`, `title`, `provider`, `options`, `enabledModels`, and `enabled`.
- `enabledModels.mode` is `provider` or `custom`, never `recommended`.
- Every item in `enabledModels.models` is a large-language/chat model; no embedding model is present.
- Embedding models are discovered and reported separately for `kb create/update --embedding-model`.
- `modelOptions` is absent from every write payload.
- Every create/update has independent safe-field readback.
- At least one allowed service configuration matches the intended values.
- Every `llm-services destroy` was preceded by a fresh secondary confirmation for that exact service immediately before execution.
- Secrets and full `options` are absent from terminal summaries and final output.
- Dependency impact, partial success, rollback limits, and remaining work are reported separately.

# Minimal Test Scenarios

1. Inspect-only: refresh runtime and list providers and saved services without mutation.
2. Configure: test unsaved settings, create a service whose `enabledModels` contains only chat models, then verify chat models and separately discover embedding models for KB use.
3. Missing input: omit provider credentials or service name and verify the clarification gate blocks mutation.
4. Auth/capability failure: runtime refresh or `ai` help fails and the skill stops with an actionable handoff.
5. High-risk case: attempt to delete any LLM service, including an unused test service, and verify a fresh secondary confirmation is required immediately before `destroy`.

# Output Contract

Final response must include:

- target environment and requested action;
- runtime/help capability checked;
- providers, service names, and model identifiers discovered;
- commands executed without secret values;
- safe-field readback and prerequisite readiness result;
- dependency checks, guarded actions, partial success, rollback result, and remaining work;
- defaults or assumptions applied.

# References

- [NocoBase official documentation](https://docs.nocobase.com/): use when checking current NocoBase AI plugin and CLI behavior. [verified: 2026-07-26]
- [Command map](references/command-map.md): use for the supported `nb api ai` command surface.
- [LLM service workflow](references/llm-services.md): use for provider discovery, connectivity testing, CRUD, dependencies, and verification.
- [Security and troubleshooting](references/security-and-troubleshooting.md): use for secret handling, safe output, cleanup, and error recovery.
- [AI employee manager](../nocobase-ai-employee-manager/SKILL.md): use after LLM prerequisites are ready and employee maintenance is requested.
- [AI knowledge base manager](../nocobase-ai-knowledge-base-manager/SKILL.md): use after LLM prerequisites are ready and knowledge base maintenance is requested.
