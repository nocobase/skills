# AI Employee Actions

Use this file when a page or localized edit asks for an AI employee, AI assistant, AI analysis button, AI helper, or task-driven AI shortcut inside a Modern page surface.

AI employee authoring is public `flow-surfaces` action authoring. Do not write raw `props`, `stepParams`, `flowModels`, or database rows. Use `type: "aiEmployee"` with public `settings`.

## UI Builder vs AI Employee Skill

`nocobase-ui-builder` remains the entry point when the user is building or editing a page, block, form, table, or record action. It should judge whether an AI employee action is the right UI behavior, and it should place the action when an existing visible employee is enough.

Use `nocobase-ai-employee` first when any of these are true:

- no existing employee clearly matches the requested business role;
- the task requires creating a dedicated AI employee;
- the employee prompt, profile, model restriction, skill binding, tool binding, or knowledge base needs to be designed;
- choosing between candidate employees is a business-role decision rather than a simple username lookup.

After `nocobase-ai-employee` returns an employee username and task contract, come back to this file and perform the actual `flow-surfaces` write.

Do not use `nocobase-ai-employee` for ordinary deterministic UI behavior. Built-in actions, JS actions, reactions, and workflows should stay on their normal routes.

## Settings Shape

```json
{
  "username": "dex",
  "auto": false,
  "workContext": [{ "target": "self" }],
  "tasks": [
    {
      "title": "Analyze current record",
      "prompt": "Analyze the current record and suggest next steps.",
      "message": {
        "system": "Use the current UI context.",
        "workContext": [{ "target": "self" }]
      },
      "autoSend": false,
      "skillSettings": null,
      "model": null,
      "webSearch": false
    }
  ],
  "style": { "size": 40, "mask": false }
}
```

Rules:

- `username` is required and must be a visible row from `aiEmployees.username`.
- Discover usernames with the user-visible AI employee list when available, for example the `aiEmployees:listByUser` public read path. If you must fall back to `aiEmployees` list data, filter candidates to `enabled=true`, `deprecated=false`, `category!="developer"`, and current-role-visible before choosing one.
- `workContext` and `tasks[].message.workContext` may use `{ "target": "self" }`; `type` is optional and defaults to `"flow-model"`.
- `tasks[].prompt` is accepted as an alias for `tasks[].message.user`. Use one or the other, not both in the same task patch.
- For preset employee skills/tools, omit `tasks[].skillSettings` or set it to `null`. Do not use `{ "skills": [], "tools": [] }` as a default. To intentionally disable all skills/tools, use `{ "skills": [], "tools": [], "skillsVersion": 2, "toolsVersion": 2 }`.
- In `applyBlueprint` and `compose`, `target` may also be a same-run block key such as `"employeesTable"` or `"employeeForm"`.
- Localized existing-surface edits should use `target: "self"` for the owning block/form, or a persisted `{ "uid": "<live-flow-model-uid>" }` read from live structure.
- The backend resolves all public targets to real Flow Model `uid` values before persistence. Do not persist `target`, block keys, or `"self"` manually.

## Whole-page applyBlueprint

Plan AI employee buttons as normal page structure, not as a later conditional prompt repair. Put the button in the owning block's `actions` for block/table toolbar work or `recordActions` for row/current-record work when that placement is already part of the page design. In one action container, keep one visible button per `settings.username`; when the same employee needs multiple prompts, merge the prompts into that button's `tasks[]` instead of adding another same-employee button beside it.

```json
{
  "version": "1",
  "mode": "create",
  "tabs": [
    {
      "key": "main",
      "title": "Overview",
      "blocks": [
        {
          "key": "employeeForm",
          "type": "createForm",
          "collection": "employees",
          "fields": ["nickname"],
          "actions": [
            {
              "key": "formAssistant",
              "type": "aiEmployee",
              "settings": {
                "username": "dex",
                "auto": false,
                "workContext": [{ "target": "self" }],
                "tasks": [
                  {
                    "title": "Check current form",
                    "message": {
                      "system": "Use the current form context.",
                      "user": "Review this form and suggest improvements.",
                      "workContext": [{ "target": "self" }]
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
          ]
        },
        {
          "key": "employeesTable",
          "type": "table",
          "collection": "employees",
          "fields": ["nickname", "status"],
          "actions": [
            {
              "key": "tableInsights",
              "type": "aiEmployee",
              "settings": {
                "username": "dex",
                "auto": false,
                "workContext": [{ "target": "self" }],
                "tasks": [
                  {
                    "title": "Analyze table data",
                    "message": {
                      "system": "Use the current table context.",
                      "user": "Summarize table risks and opportunities.",
                      "workContext": [{ "target": "employeesTable" }]
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
          ],
          "recordActions": [
            {
              "key": "recordInsights",
              "type": "aiEmployee",
              "settings": {
                "username": "dex",
                "auto": false,
                "workContext": [{ "target": "self" }],
                "tasks": [
                  {
                    "title": "Analyze current record",
                    "message": {
                      "system": "Use the current record context.",
                      "user": "Analyze this record and suggest next steps.",
                      "workContext": [{ "target": "self" }]
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
          ]
        }
      ],
      "layout": { "rows": [["employeeForm"], ["employeesTable"]] }
    }
  ]
}
```

## Localized Add

Use `catalog` first if the target slot is uncertain. Then add through the relevant public action.

Before adding an AI employee action to an existing surface, read the live structure with `flow-surfaces get` or `describe-surface` when the target may already contain actions. If the same action container already has an AI employee action with the intended `username`, use `configure` on that action UID and update/merge `tasks[]`; only add a new action when no suitable same-container action exists. The same employee may still appear in different containers, such as one toolbar action and one row action, when those are distinct user workflows.

Block or form action:

```json
{
  "target": { "uid": "table-block-uid" },
  "type": "aiEmployee",
  "settings": {
    "username": "dex",
    "auto": false,
    "workContext": [{ "target": "self" }],
    "tasks": [
      {
        "title": "Analyze table data",
        "message": {
          "system": "Use the current table context.",
          "user": "Summarize table risks and opportunities.",
          "workContext": [{ "target": "self" }]
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

Record action:

```json
{
  "target": { "uid": "table-block-uid" },
  "type": "aiEmployee",
  "settings": {
    "username": "dex",
    "auto": false,
    "workContext": [{ "target": "self" }],
    "tasks": [
      {
        "title": "Analyze current record",
        "message": {
          "system": "Use the current record context.",
          "user": "Analyze this record and suggest next steps.",
          "workContext": [{ "target": "self" }]
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

## Reconfiguration

Use `configure` for existing AI employee action nodes. `changes` uses the same public keys as create-time settings.

```json
{
  "target": { "uid": "ai-employee-action-uid" },
  "changes": {
    "tasks": [
      {
        "title": "Generate table insights",
        "message": {
          "user": "Summarize risks and recommended next steps.",
          "workContext": [{ "target": "self" }]
        },
        "autoSend": true,
        "webSearch": false
      }
    ]
  }
}
```

Partial task updates merge by task index and preserve existing unrelated task fields. To clear a list such as `skills` or `tools`, set that list explicitly to `[]`.
