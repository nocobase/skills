# AI Employee CLI Record Field Contract

This contract applies to record writes through `nb api ai employees`. Other confirmed resource actions may expose broader fields, but they do not expand this CLI safe-field list.

## Contents

- [Writable Fields](#writable-fields)
- [Forbidden Write Fields](#forbidden-write-fields)
- [Avatar Rule](#avatar-rule)
- [Model Settings](#model-settings)
- [Knowledge-Base Employee Fields](#knowledge-base-employee-fields)
- [Minimal Create Shape](#minimal-create-shape)

## Writable Fields

| Field | Rule |
|---|---|
| `username` | Stable primary key; required on create; do not change after creation. |
| `nickname` | Human-visible name; required on create. |
| `position` | Short responsibility label. |
| `avatar` | Supported preset seed; required on create. |
| `bio` | Human-facing introduction. |
| `about` | Stable employee behavior definition. |
| `greeting` | New-conversation greeting. |
| `modelSettings` | Optional dedicated chat-model restriction. |
| `enableKnowledgeBase` | Boolean retrieval switch. |
| `knowledgeBasePrompt` | Required when KB retrieval is enabled; must contain `{knowledgeBaseData}`. |
| `knowledgeBase` | KB keys, `topK`, and score threshold. |
| `enabled` | Whether the employee is available. |

## Forbidden Write Fields

Reject rather than silently drop:

```text
builtIn
category
deprecated
chatSettings
dataSourceSettings
skillSettings
```

`builtIn`, `category`, and `deprecated` may appear in reads. Use `builtIn` only as a protection guard and the others as read-only context.

## Avatar Rule

- `avatar` is a preset seed, not a file or URL.
- If missing, empty, null, or unsupported on create, use `nocobase-015-male`.
- When a requested seed is uncertain, verify it against the active product presets.
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

Rules:

- Every pair must be verified through `nocobase-ai-manager`.
- The service must be enabled.
- The model must be a chat/LLM identifier allowed by that service.
- Embedding models are never valid employee chat models.
- Preserve an existing restriction when a request does not mention model changes.

## Knowledge-Base Employee Fields

The employee record surface may store `enableKnowledgeBase`, `knowledgeBasePrompt`, and `knowledgeBase`, but their business validation belongs to `nocobase-ai-knowledge-base-manager`.

Rules:

- Accept only a verified employee-field handoff from that skill; do not rediscover capability, keys, retrieval ranges, or prompt rules here.
- Apply the handed-off fields together, preserve unrelated employee fields, and read back the stored result.
- If the handoff is unavailable or blocked, do not write partial knowledge-base state.
- Unbinding follows the same handoff rule; do not invent whether prompt or settings should be preserved.


## Minimal Create Shape

```json
{
  "username": "support-assistant",
  "nickname": "Support Assistant",
  "position": "Customer support",
  "avatar": "nocobase-015-male",
  "bio": "Answers support questions for business users.",
  "about": "Answer clearly using configured sources.",
  "greeting": "How can I help?",
  "modelSettings": {
    "enabled": true,
    "models": [{ "llmService": "openai-main", "model": "chat-model" }]
  },
  "enabled": true
}
```

Use placeholders in documentation and protected body files for execution. Do not add fields outside this contract.