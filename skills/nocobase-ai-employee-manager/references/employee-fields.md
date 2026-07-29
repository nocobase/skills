# AI Employee Fields

## Writable Fields

| Field | Rule |
|---|---|
| `username` | Stable primary key; required on create. Do not change casually. |
| `nickname` | Human-visible name; required on create. |
| `position` | Short responsibility label. |
| `avatar` | Supported preset seed; required on create. |
| `bio` | Human-facing introduction. |
| `about` | Stable employee behavior definition. |
| `greeting` | New-conversation greeting. |
| `modelSettings` | Optional dedicated model restriction. |
| `enableKnowledgeBase` | Boolean switch for retrieval. |
| `knowledgeBase` | Retrieval settings and knowledge base keys. |
| `enabled` | Whether the employee is available. |

## Forbidden Write Fields

Reject, do not silently drop:

```text
builtIn
category
deprecated
chatSettings
dataSourceSettings
skillSettings
```

`builtIn`, `category`, and `deprecated` may appear in reads. Use `builtIn` only as a delete guard and the others only as read-only context.

## Avatar Rule

- `avatar` is a preset seed string, not a file or URL.
- If missing, empty, null, or unsupported, use `nocobase-015-male`.
- When a requested seed is uncertain, verify against the active product's supported presets before create.
- Read back and confirm the stored avatar is non-empty.

## Model Settings

```json
{
  "enabled": true,
  "models": [
    {
      "llmService": "openai-main",
      "model": "chat-model"
    }
  ]
}
```

Every service/model pair must be verified by `nocobase-ai-manager`. Use a large-language/chat model from the service's `enabledModels`; embedding models are never valid employee models and must never be added to `llm-services create/update --enabled-models`.

## Knowledge Base Settings

```json
{
  "topK": 5,
  "score": "0.5",
  "knowledgeBaseKeys": ["product-docs"]
}
```

Rules:

- set `enableKnowledgeBase=true` when binding;
- every key must exist and be enabled;
- `topK` must be a positive integer;
- employee knowledge base `score` is represented as a string in the current write schema;
- an empty key list should normally be paired with `enableKnowledgeBase=false`.

## Minimal Create Shape

```json
{
  "username": "support-assistant",
  "nickname": "Support Assistant",
  "position": "Customer support",
  "avatar": "nocobase-015-male",
  "bio": "Answers support questions for business users.",
  "about": "Answer clearly and use the configured sources.",
  "greeting": "How can I help?",
  "modelSettings": {
    "enabled": true,
    "models": [{ "llmService": "openai-main", "model": "chat-model" }]
  },
  "enableKnowledgeBase": false,
  "enabled": true
}
```

Use placeholders and protected body files for execution. Do not add undocumented fields.
