# LLM Service Workflow

## Contents

- [Writable Contract](#writable-contract)
- [Critical Model Boundary](#critical-model-boundary)
- [Protected Payload Shape](#protected-payload-shape)
- [Create](#create)
- [Update](#update)
- [Delete](#delete)
- [Readiness Result](#readiness-result)

## Writable Contract

Allowed create/update fields:

| Field | Rule |
|---|---|
| `name` | Stable primary key; required on create. |
| `title` | Human-visible title. |
| `provider` | Must come from `list-llm-providers`. |
| `options` | Provider settings; may contain secrets. |
| `enabledModels` | `{ mode, models }`; mode is `provider` or `custom`, and every model must be a large-language/chat model. |
| `enabled` | Boolean availability state. |

Reject `modelOptions`. Never use `enabledModels.mode=recommended`.

## Critical Model Boundary

- For both `nb api ai llm-services create` and `nb api ai llm-services update`, `--enabled-models` accepts **only large-language/chat models**.
- Never place an embedding model in `enabledModels.models`, even when the provider exposes that embedding model.
- Discover embedding models separately, for example with `list-models --model EMBEDDING`, and use the selected identifier only in knowledge base `embeddingModel` / `--embedding-model` configuration.
- Before every create/update, classify each requested model and reject the entire write if any `enabledModels.models[]` item is an embedding model.

## Protected Payload Shape

Use placeholders only in documentation:

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
    "models": [
      { "label": "chat-model", "value": "chat-model" }
    ]
  },
  "enabled": true
}
```

Write this payload to a mode-600 temporary file and use `--body-file`. For secret-bearing creates or updates, add `--no-json-output` when supported so the response body cannot echo secrets.

## Create

1. Discover the provider.
2. Use unsaved settings with `list-provider-models` and classify models by type.
3. Select only large-language/chat models for `enabledModels`; record embedding models separately for knowledge base configuration.
4. Run `test-flight` with the chosen chat model.
5. Query exact `name` before create.
6. If absent, create once.
7. Read back safe fields, verify every `enabledModels.models[]` item is a chat model, and separately list available embedding models for KB use.

Idempotency:

- absent: create;
- present and equal on safe fields: report satisfied;
- present and different: show safe-field diff and ask `update` or `skip`;
- never auto-convert create into update.

## Update

1. Read the current safe fields.
2. If provider, credentials, base URL, or chat models change, rerun model discovery and `test-flight` first. Reject the update if `enabledModels` contains any embedding model.
3. Check employee and knowledge base dependencies.
4. Require confirmation for provider/model replacement or disabling a referenced service.
5. Update by exact service name.
6. Read back `name`, `title`, `provider`, `enabled`, and `enabledModels`.

Do not reconstruct an update body from a full server response. It may include read-only or secret-bearing data.

## Delete

1. Resolve the exact service.
2. List knowledge bases and employees and build a dependency list.
3. If dependencies exist, stop by default and describe migration or unbinding steps.
4. After dependencies are cleared, show the exact service, environment, and that deletion is not recoverable without the original secrets.
5. Obtain a fresh explicit secondary confirmation immediately before this specific `destroy`. The original delete request, an earlier plan approval, or a batch cleanup confirmation is not sufficient.
6. Destroy only that confirmed service by exact name and verify it is absent.

## Readiness Result

A successful prerequisite result should contain only:

```text
environment
service name
title
provider
enabled state
enabled chat model identifiers from enabledModels
separately discovered embedding model identifiers for knowledge base use (never from enabledModels)
unresolved employee or knowledge base dependencies
```

Never include provider `options`, API keys, tokens, or copied secret values.
