# AI Employee Field Contract

## Contents

- [Writable Fields](#writable-fields)
- [Forbidden Write Fields](#forbidden-write-fields)
- [Avatar Rule](#avatar-rule)
- [Model Settings](#model-settings)
- [Knowledge-Base Settings](#knowledge-base-settings)
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

## Knowledge-Base Settings

The three fields form one answer-source contract:

```json
{
  "enableKnowledgeBase": true,
  "knowledgeBasePrompt": "From knowledge base:\n{knowledgeBaseData}\nAnswer the user's question using this information.",
  "knowledgeBase": {
    "topK": 3,
    "score": "0.6",
    "knowledgeBaseKeys": ["product-docs"]
  }
}
```

Rules:

- Require a KB-manager capability result with `runtimeCapability=available`.
- Every key must exist and be enabled.
- `knowledgeBasePrompt` must be non-empty and contain the literal placeholder `{knowledgeBaseData}`.
- Preserve an existing custom prompt unless the user explicitly changes it.
- If enabling and no prompt exists, use the product-style default shown above or an explicit user-approved localized equivalent containing the placeholder.
- `topK` must be an integer from 1 through 100; product default is 3.
- Score must represent a number from 0 through 1; current employee writes store it as a string; product default is `"0.6"`.
- Enabling requires at least one key.
- Unbinding normally sets `enableKnowledgeBase=false`; clear or preserve prompt/settings only according to explicit user intent.
- Never silently omit KB fields because the edition/plugin capability is blocked.

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
  "enableKnowledgeBase": false,
  "enabled": true
}
```

Use placeholders in documentation and protected body files for execution. Do not add fields outside this contract.