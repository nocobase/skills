# Block AI Employee Action Payload

Load this file when placing or updating an AI employee action on a NocoBase Modern page/block.

## Handoff

Use `nocobase-ui-builder` for the actual page/block/action write. This skill decides and prepares the employee/action contract; `nocobase-ui-builder` performs the Flow Surfaces mutation.

## Public Shape

Use only:

```json
{
  "key": "aiReview",
  "type": "aiEmployee",
  "settings": {
    "username": "dex",
    "auto": false,
    "workContext": [{ "type": "flow-model", "target": "self" }],
    "tasks": [
      {
        "title": "Analyze current record",
        "message": {
          "system": "Use the current record context. Be concise and cite uncertainty.",
          "user": "Analyze this record and suggest next actions.",
          "workContext": [{ "type": "flow-model", "target": "self" }]
        },
        "autoSend": false,
        "skillSettings": null,
        "model": null,
        "webSearch": false
      }
    ],
    "style": { "size": 40, "mask": false }
  }
}
```

## Placement Rules

- Root/table/form action: put the action in the block's `actions`.
- Per-record action: put the action in `recordActions`.
- Create/edit form helper: put the action in that form's action area unless the user asks for a separate helper block.
- Whole-page creation: include the AI employee action in the first `applyBlueprint`.
- Localized edit: inspect or use `catalog` when the target slot is uncertain, then add/configure the action through public Flow Surfaces operations.

## Work Context

- Default to `{ "type": "flow-model", "target": "self" }`.
- In whole-page `applyBlueprint` or `compose`, same-run block keys may be used as targets.
- In localized edits, use `self` or a persisted Flow Model `uid` read from the live surface.
- Do not persist `"self"` or block keys manually; backend authoring resolves them.

## Safety Rules

- `settings.username` must be an existing visible employee username.
- Preset skills/tools are represented by omitting `tasks[].skillSettings` or setting it to `null`.
- Do not use `{ "skills": [], "tools": [] }` as a default. To intentionally disable all skills/tools, use `{ "skills": [], "tools": [], "skillsVersion": 2, "toolsVersion": 2 }`.
- Avoid `auto: true` or `autoSend: true` unless the user explicitly wants immediate AI execution.
- Do not write raw `props`, `stepParams`, `flowModels`, internal model names, or direct database rows for shortcuts.
- Keep task text concrete and bounded to the current surface.
- If the employee requires workflow execution, verify workflow tool availability before binding.
