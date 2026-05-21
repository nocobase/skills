# AI Employee API Reference

Load this file when concrete employee fields, resource names, or create/update payloads are needed.

## Core Collection

Collection: `aiEmployees`

Important fields:

| Field | Meaning |
| --- | --- |
| `username` | Primary key. Stable identifier used by AI employee actions. |
| `nickname` | Human-visible name. Required in the admin form. |
| `position` | Short responsibility label. |
| `avatar` | Preset avatar seed. |
| `bio` | Human-facing introduction shown on profile cards; not the main prompt. |
| `about` | Custom role setting used in the final system prompt. |
| `defaultPrompt` | Built-in employee default prompt. |
| `greeting` | First message when a new conversation starts. |
| `chatSettings` | Prompt mode and feature switches. |
| `skillSettings.skills` | Bound skill names. |
| `skillSettings.tools` | Bound tool settings `{ name, autoCall }`. |
| `modelSettings` | Dedicated model restriction. |
| `enabled` | Whether users can use the employee. |
| `builtIn` | Whether registered by code loader. |
| `category` | Usually `business` or `developer`. |
| `deprecated` | Hidden from normal list when true. |

## Useful Resources

Use the available NocoBase API/CLI transport in the current environment.

- Admin list: `aiEmployees:list`
- User-visible list: `aiEmployees:listByUser`
- Create: `aiEmployees:create`
- Update: `aiEmployees:update`
- Per-user prompt: `aiEmployees:updateUserPrompt`
- Tools list: `aiTools:list`
- Skills list: `aiSkills:list`
- Enabled models: `ai:listAllEnabledModels`

Prefer `listByUser` for selecting a username to bind to a user-facing action.

## Create Payload Shape

Minimal business employee:

```json
{
  "username": "contract-reviewer",
  "nickname": "Contract Reviewer",
  "position": "Contract review assistant",
  "avatar": "nocobase-015-male",
  "bio": "Reviews contract text and summarizes risks for business users.",
  "about": "You review contract text, extract key obligations, summarize risks, and suggest next actions. Use the user's language.",
  "greeting": "Send me a contract or select a record and I will summarize risks and next steps.",
  "category": "business",
  "enabled": true,
  "skillSettings": {
    "skills": [],
    "tools": []
  },
  "modelSettings": {
    "enabled": false,
    "models": []
  }
}
```

Dedicated model restriction:

```json
{
  "modelSettings": {
    "enabled": true,
    "models": [
      { "llmService": "openai-main", "model": "gpt-4.1" }
    ]
  }
}
```

Custom tool permission:

```json
{
  "skillSettings": {
    "tools": [
      { "name": "workflowCaller-contract-risk-workflow", "autoCall": false }
    ]
  }
}
```

## Prompt Semantics

- `about` is inserted into the final system prompt as the employee definition.
- `bio` is for human discovery and profile cards.
- `greeting` starts a new chat but does not define behavior.
- `chatSettings.systemPromptMode = "raw"` means use `about`/default prompt directly instead of the full NocoBase prompt wrapper.
- `chatSettings.enableSkills = false` or `enableTools = false` hides those capabilities at runtime.

## Creation Rules

1. Choose `category: "business"` by default.
2. Use stable, lowercase, hyphen-safe usernames.
3. Keep `about` specific enough for behavior, but do not hard-code one page/block UID in the employee if the task belongs in the action's task message.
4. Put block-specific instructions in the AI action task, not in the employee persona, unless the employee is dedicated to that exact domain.
5. After creation, verify the employee appears in the intended visible list or handle role ACL separately.
