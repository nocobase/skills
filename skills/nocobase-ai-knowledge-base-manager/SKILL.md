---
name: nocobase-ai-knowledge-base-manager
description: "Use when users need to inspect, configure, update, verify, or safely remove NocoBase vector databases, knowledge bases, documents, retrieval tests, and AI employee knowledge base bindings through nb api kb."
argument-hint: "[action: inspect|create|update|upload|vectorize|test|bind|delete] [target: vector-db|knowledge-base|document|employee] [env?: name]"
allowed-tools: Bash, Read, Grep
owner: platform-tools
version: 1.0.0
last-reviewed: 2026-07-26
risk-level: high
---

# Goal

Maintain NocoBase vector databases, knowledge bases, documents, retrieval tests, and knowledge base bindings through the supported `nb api kb` surface after `nocobase-ai-manager` has prepared the required LLM and embedding configuration.

# Required Dependency

- Invoke or load [`nocobase-ai-manager`](../nocobase-ai-manager/SKILL.md) before creating or changing a `LOCAL` or `READONLY` knowledge base.
- Consume its readiness result: environment, enabled LLM service, chat models configured in that service's `enabledModels`, and embedding models discovered separately for knowledge base use.
- An embedding model must never be added to `llm-services create/update --enabled-models`; it is selected separately through the knowledge base `embeddingModel` / `--embedding-model` field.
- If the separately discovered embedding prerequisite is missing or unverified, stop the knowledge base mutation and return to `nocobase-ai-manager`.
- Use `nocobase-ai-employee-manager` for employee-centric lifecycle work; this skill may perform the narrow KB binding update after the employee is uniquely resolved.

# Scope

- Discover, test, create, update, verify, and safely delete vector database configurations.
- Create and maintain `LOCAL`, `READONLY`, and `EXTERNAL` knowledge bases.
- List, get, upload, explicitly re-vectorize/retry, and delete knowledge base documents; normal uploads start vectorization automatically.
- Run independent knowledge base hit tests.
- Bind existing knowledge base keys to an existing AI employee and verify the employee readback.
- Enforce no-poll upload semantics and reverse dependency cleanup.

# Non-Goals

- Do not configure LLM providers or services; use `nocobase-ai-manager`.
- Do not create or broadly maintain AI employee profiles; use `nocobase-ai-employee-manager`.
- Do not manage knowledge base segments, async tasks, task status, or hidden vector-store change actions.
- Do not automatically poll indexing, segmentation, ZIP import, or vectorization status.
- Do not ask the user whether to vectorize after a successful document upload; the service starts vectorization automatically.
- Do not bypass ACL, vector database dependency protection, or existing-table confirmation.
- Do not use direct database mutation or curl when a supported `nb api` command exists.

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `action` | yes | `inspect` | one of `inspect/create/update/upload/vectorize/test/bind/delete` | "Which knowledge base action should I perform?" |
| `target` | mutation: yes | infer for inspect only | one of `vector-db/knowledge-base/document/employee` | "Which resource type should I manage?" |
| `env` | no | readiness env from `nocobase-ai-manager` | configured, reachable, authenticated | "Which NocoBase CLI environment should I target?" |
| `identifier` | update/get/delete: yes | none | exact vector key, KB key/id, document id, or employee username | "What is the exact target identifier?" |
| `payload` | create/update/test/bind: yes | none | type-specific required fields and allowed values | "Which vector, knowledge base, retrieval, or binding values should be used?" |
| `file` | upload: yes | none | readable ordinary file or ZIP path | "Which file should be uploaded to which knowledge base key?" |
| `confirmation` | every delete and other high-risk action: yes | none | explicit secondary confirmation after the exact target and impact are shown; the original request is not sufficient | "Confirm deletion of this exact vector database, knowledge base, or document?" |

Rules:

- If required input or prerequisite readiness is missing, stop mutation and ask clarification.
- If the user says "you decide", inspect providers and existing resources only; do not create, upload, vectorize, bind, update, or delete.
- Resolve identifiers through real list/get results; never guess IDs or keys.
- Do not silently convert create into update.
- Treat ordinary upload success, ZIP task submission, independently requested re-vectorization acceptance, and hit-test results as distinct outcomes.
- Every vector database, knowledge base, and document `destroy` requires its own fresh explicit secondary confirmation immediately before execution, including rollback and cleanup deletes. Never reuse one blanket confirmation across multiple targets.
- After upload, state that vectorization is automatic and do not offer, suggest, or ask about manual vectorization.

# Mandatory Clarification Gate

- Max clarification rounds: `2`.
- Max questions per round: `3`.
- Before mutation, confirm environment, target type, exact identifier, type-specific fields, dependencies, and secret source.
- Before `skipTableExistedCheck=true`, require the server's `TABLE_ALREADY_EXISTS` result and explicit table-reuse confirmation.
- Before every vector database, knowledge base, or document delete, display the exact target, environment, dependencies, and impact, then obtain a fresh secondary confirmation immediately before that specific `destroy`. A prior request, plan approval, or batch cleanup confirmation does not count.
- Before vector dependency changes or employee binding changes, display the exact impact and obtain secondary confirmation.
- If runtime help, plugin capability, LLM/embedding readiness, storage discovery, or target resolution fails, stop before writing.

# Workflow

1. Run `nocobase-ai-manager`; retain the verified environment and LLM service, the chat-only `enabledModels`, and the separately discovered embedding model when the target knowledge base type requires it.
2. Run `nb env update <env> --verbose`; verify `nb api kb --help`, `nb api kb vector-databases --help`, and `nb api kb documents --help`.
3. Read the [command map](references/command-map.md) and discover current vector databases, knowledge bases, documents, storage, and relevant employees.
4. For vector databases, follow [vector database workflow](references/vector-databases.md): discover provider, use a protected body file for `test-connection`, then create/update and read back safe fields.
5. For knowledge bases, follow [knowledge base and document workflow](references/knowledge-bases-and-documents.md); validate conditional fields for `LOCAL`, `READONLY`, or `EXTERNAL`.
6. For `LOCAL`, discover storage with `nb api file-manager storages list` and require `storageId`, vector database key, LLM service, and embedding model.
7. For document upload, run one multipart upload. Report ordinary files as "upload succeeded; automatic vectorization started/queued"; for ZIP responses with `taskId`, report "task submitted" and explain that imported documents are vectorized automatically. Do not poll or claim processing completion, and do not ask whether to vectorize.
8. Run document `vectorization` only for an independently requested re-vectorization/retry operation, never as the normal post-upload follow-up. Run KB `run-hit-test` only when explicitly requested. A hit-test empty result does not retroactively mean upload failed.
9. For AI employee binding, read [employee binding](references/ai-employee-binding.md), resolve the employee, verify KB keys, update only `enableKnowledgeBase` and `knowledgeBase`, then read back.
10. For cleanup, follow reverse dependency order, but treat each deletion as a separate high-risk action: freshly confirm each document before its `destroy`, then freshly confirm the knowledge base, vector database, and LLM service immediately before each respective `destroy`. Never use one blanket cleanup confirmation.
11. Report partial success, accepted asynchronous work, rollback limits, and cleanup status separately.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [Command map](references/command-map.md) | Selecting exact `kb`, vector database, document, file storage, or employee-binding commands. | Includes excluded command surface. |
| [Vector databases](references/vector-databases.md) | Testing or changing PGVector configuration. | Covers sensitive connection data, table validation, table reuse, readback, and dependencies. |
| [Knowledge bases and documents](references/knowledge-bases-and-documents.md) | Creating KB types, uploading documents, explicitly re-vectorizing/retrying, hit testing, or deleting. | Defines automatic post-upload vectorization and no-poll semantics. |
| [AI employee binding](references/ai-employee-binding.md) | Binding or unbinding existing knowledge bases to an existing employee. | Narrow cross-resource update with employee field guards. |
| [AI manager](../nocobase-ai-manager/SKILL.md) | A KB requires saved LLM and embedding prerequisites. | Required dependency. |
| [AI employee manager](../nocobase-ai-employee-manager/SKILL.md) | Employee creation or broader profile maintenance is required. | Collaborating skill. |

# Safety Gate

High-risk actions:

- every vector database deletion;
- every knowledge base deletion;
- every knowledge base document deletion;
- reusing an existing PGVector table with `skipTableExistedCheck=true`;
- changing vector database, LLM service, embedding model, or external vector-store configuration;
- exposing database passwords or `vectorStoreProps[].value`;
- changing an AI employee's knowledge base binding.

Secondary confirmation template:

- "Confirm execution: `<action>` on `<resource identifier>` in `<env>`. Expected impact: `<table/data/retrieval/employee dependency impact>`. Type `confirm` to continue."

Rollback guidance:

- If vector or KB create verification fails, request a separate secondary confirmation immediately before deleting the newly created object; confirmation for one object cannot authorize another deletion.
- If update verification differs, restore the previously read non-secret fields; secret connection or external-store values must be re-supplied by the user.
- Upload, ZIP task submission, automatic vectorization, explicit re-vectorization, and other accepted asynchronous work may not be reversible; never claim automatic rollback.
- If deletion is blocked by service dependencies, stop and preserve the object; do not bypass the guard.

# Verification Checklist

- `nocobase-ai-manager` prerequisite is complete when LLM/embedding configuration is required; its LLM service `enabledModels` contains chat models only.
- The knowledge base embedding model was discovered separately and is not present in the LLM service `enabledModels`.
- Target environment and all required `kb` command groups are verified.
- Vector provider, storage, LLM service, embedding model, KB key, document ID, and employee username are resolved as applicable.
- PGVector connection test succeeds before create/update.
- Existing table reuse occurs only after `TABLE_ALREADY_EXISTS` and explicit confirmation.
- Knowledge base type-specific required fields are present.
- Every vector database and knowledge base create/update has independent readback.
- Ordinary upload is reported as endpoint success with automatic vectorization started/queued; ZIP upload is reported only as task submission when `taskId` exists.
- The skill never asks whether to vectorize after upload and never presents manual vectorization as the normal next step.
- The `vectorization` command is used only for an independently requested re-vectorization/retry operation; hit test is also independent and never auto-chained.
- At least one allowed configuration matches intended safe fields.
- Every vector database, knowledge base, and document `destroy` was preceded by a fresh secondary confirmation for that exact target immediately before execution.
- No blanket cleanup confirmation was reused across multiple deletes.
- Secrets, passwords, and external vector-store values are absent from output.
- Employee KB binding is read back and contains only existing enabled keys.
- Errors, partial success, asynchronous uncertainty, rollback limits, and cleanup are reported separately.

# Minimal Test Scenarios

1. Inspect-only: list vector providers, vector databases, knowledge bases, and documents without mutation.
2. Happy path: test PGVector, create a local KB, upload an ordinary file, report automatic vectorization without polling, and verify that no manual-vectorization question is asked.
3. Missing input: omit storage, embedding model, file path, or exact identifier and verify mutation is blocked.
4. Auth/capability failure: `kb` help or API authorization fails and the skill stops with recovery guidance.
5. High-risk case: attempt vector database, knowledge base, and document deletes and verify each exact target requires a separate fresh secondary confirmation immediately before its `destroy`.

# Output Contract

Final response must include:

- target environment, requested action, resource type, and exact identifiers;
- prerequisite LLM/embedding result consumed;
- commands executed without secret values;
- safe-field readback for configuration writes;
- upload and ZIP task outcomes, including the automatic-vectorization statement, plus any independently requested re-vectorization or hit-test result;
- employee binding readback when applicable;
- guarded operations, dependency errors, partial success, rollback limits, and remaining cleanup;
- defaults or assumptions applied.

# References

- [NocoBase official documentation](https://docs.nocobase.com/): use when checking current AI knowledge base plugin and CLI behavior. [verified: 2026-07-26]
- [AI manager](../nocobase-ai-manager/SKILL.md): required prerequisite for LLM service and embedding model readiness.
- [Command map](references/command-map.md): use for the supported `nb api kb` command surface.
- [Vector databases](references/vector-databases.md): use for provider discovery, PGVector testing, CRUD, table reuse, and dependencies.
- [Knowledge bases and documents](references/knowledge-bases-and-documents.md): use for KB types, documents, vectorization, hit tests, deletion, and no-poll semantics.
- [AI employee binding](references/ai-employee-binding.md): use to bind or unbind knowledge bases on an existing employee.
- [AI employee manager](../nocobase-ai-employee-manager/SKILL.md): use for broader employee lifecycle maintenance.
