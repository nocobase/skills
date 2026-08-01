# LLM Service Workflow

## Contents

- [Writable Contract](#writable-contract)
- [Model Classification](#model-classification)
- [Protected Payload](#protected-payload)
- [Inspect and Create](#inspect-and-create)
- [Update](#update)
- [Disable or Delete](#disable-or-delete)
- [Readiness Contracts](#readiness-contracts)

## Writable Contract

Allowed create/update fields:

| Field | Rule |
|---|---|
| `name` | Stable primary key; required on create. |
| `title` | Human-visible title. |
| `provider` | Must come from provider discovery. |
| `options` | Provider settings; may contain secrets. |
| `enabledModels` | `{ mode, models }`; mode is `provider` or `custom`; all models must be chat/LLM models. |
| `enabled` | Boolean service availability. |

Reject `modelOptions`. Never use `enabledModels.mode=recommended`.

Do not reconstruct an update payload from a full service response. Reads may contain read-only, compatibility, or secret-bearing fields.

## Model Classification

Before every service create/update:

1. Discover the provider and its models.
2. Classify each requested identifier by provider model type.
3. Put only chat/LLM models in `enabledModels.models`.
4. Reject the entire write if any requested enabled model is an embedding model.
5. Discover embeddings separately only when a capability-approved knowledge-base consumer requests them.

An embedding model is not an employee chat model and is not part of the saved service's enabled chat-model list. The selected embedding identifier is written later to a KB's `embeddingModel` field.

## Protected Payload

Documentation may show placeholders only:

```json
{
  "name": "openai-main",
  "title": "OpenAI Main",
  "provider": "openai",
  "options": {
    "apiKey": "${OPENAI_API_KEY}",
    "baseURL": "${OPENAI_BASE_URL}"
  },
  "enabledModels": {
    "mode": "custom",
    "models": [{ "label": "chat-model", "value": "chat-model" }]
  },
  "enabled": true
}
```

Write real secret-bearing payloads to a mode-600 temporary file and use `--body-file`. Add `--no-json-output` when current help supports it.

## Inspect and Create

1. Confirm environment and `ai` command capability.
2. Discover the provider and unsaved models.
3. Select a chat model and run `test-flight` with unsaved settings.
4. Query the exact service `name`.
5. If absent, create once; if present, do not silently update.
6. Read back safe fields and verify chat-only `enabledModels`.
7. If a KB consumer requested readiness and supplied an available capability result, discover embedding identifiers separately.

Idempotency:

- absent: create;
- present and equal on safe fields: report satisfied;
- present and different: show a safe-field diff and ask update or skip;
- present with ambiguous identity: stop.

## Update

1. Read a safe snapshot.
2. Compare intended and current safe fields.
3. If provider, credentials, base URL, or chat models change, rediscover models and rerun `test-flight`.
4. Inspect employee dependencies.
5. Inspect KB dependencies only through available KB capability.
6. If KB dependencies cannot be read, block provider replacement, model removal, disable, and delete.
7. Explain user-facing impact and obtain confirmation for disruptive referenced changes.
8. Update once by exact service name.
9. Read back and compare `name`, `title`, `provider`, `enabled`, and `enabledModels`.

Changing credentials without changing safe fields still requires protected input and connectivity testing; do not claim credentials were verified from readback because secrets are not readable.

## Disable or Delete

1. Resolve the exact service.
2. Build employee and KB dependency results separately.
3. If references exist, stop by default and describe migration or unbinding work.
4. If the KB dependency result is unknown, stop; do not assume no knowledge bases exist.
5. Show the exact service, environment, availability impact, and restoration limits.
6. Obtain a fresh explicit confirmation immediately before the one requested disruptive action.
7. Execute only that action.
8. For delete, verify the service is absent; for disable, verify `enabled=false`.

A successful backend dependency rejection is a safety result, not a reason to bypass the guard.

## Readiness Contracts

Core AI readiness:

```yaml
coreAI:
  status: ready | blocked | unknown
  environment: <env>
  serviceName: <name>
  provider: <provider>
  enabled: true | false
  chatModels: []
  employeeDependencies: []
```

Conditional knowledge-base prerequisites:

```yaml
knowledgeBasePrerequisites:
  requested: true | false
  capabilityInput: available | missing | stale
  status: ready | blocked | not-requested
  embeddingModels: []
  knowledgeBaseDependencies: [] | unknown
```

Rules:

- Never include provider `options`, API keys, tokens, or copied secret values.
- `knowledgeBasePrerequisites.status=ready` requires capability input from the KB manager and at least one separately discovered embedding model when the target KB type needs one.
- Core AI readiness can be ready while KB prerequisites are blocked or not requested.