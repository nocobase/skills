---
title: "AI Employee"
description: "Use when an AI employee should complete a business task inside an async workflow, return structured output, and optionally wait for human approval."
---

# AI Employee

## Node Type

`ai-employee`

## Node Description

Runs an AI employee as a workflow task and returns structured data to the workflow. The node is registered by `@nocobase/plugin-ai` and is available only in asynchronous workflows.

The server forces the AI employee to finish by calling the internal workflow task output tool (`aiEmployeeWorkflowTaskOutput`). The workflow job resolves only when that tool submits a `result` value that matches the configured structured output schema, or errors/aborts if the task cannot complete.

## Business Scenario Example

Assign an AI employee to read a submitted document, query permitted business data, produce a structured review result, and optionally send the result to human assignees for approval before downstream workflow nodes run.

## Configuration List

| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| username | string | `atlas` in UI defaults | Yes | AI employee username (`aiEmployees.username`). Should select from the list of `aiEmployees:listByUser` API. |
| model | object | None | Yes | Model override for this task: `{ "llmService": "<service name>", "model": "<model id>" }`. Must be one of the models available to the selected AI employee. The available models can be retrieved from `ai:listAllEnabledModels` API. |
| userId | number/string | None | Yes | Operator user id. The AI employee uses this user's permissions when accessing data. If the upstream trigger/input already provides an operator user, that user takes precedence. |
| message.system | string/object | None | No | Background/system prompt appended to the AI employee definition. Objects are JSON-stringified by the server. |
| message.user | string/object | None | Yes | Task description sent as the user message. Objects are JSON-stringified by the server. |
| files | array | [] | No | Attachments sent with the user message. See [Files](#files). |
| skillSettings | object | Preset employee settings | No | Limits available skills/tools for this task. See [Skill and Tool Settings](#skill-and-tool-settings). |
| webSearch | boolean | false | No | Enables web search when the selected service/model supports it. |
| structuredOutput.schema | object/string | Default result schema in UI | Yes | JSON Schema for the final task result. See [Structured Output](#structured-output). |
| requiresApproval | string | `no_required` | No | Approval mode: `no_required`, `ai_decision`, or `human_decision`. |
| assignees | array | [] | Required when approval is enabled | User ids, user id arrays from variables, or user filter objects used as approval/notification assignees. |

## Files

`files` is an array. Each item has a `type` and `value`.

| Type | Required fields | Description |
| --- | --- | --- |
| `attachments` | `value` | Uses an existing attachment value, typically selected from an attachment field variable. |
| `file_id` | `collection`, `value` | Loads file records by id from a file-template collection. `value` may be one id or an array of ids. The collection must exist and contain matching records. |
| `file_url` | `value` | Downloads file(s) from URL, creates file records in `aiFiles` using the AI settings storage, and sends them as attachments. `value` may be one URL or an array of URLs. |

Example:

```json
[
  {
    "type": "file_id",
    "collection": "attachments",
    "value": "{{$context.data.documentId}}"
  },
  {
    "type": "file_url",
    "value": "{{$context.data.externalFileUrl}}"
  }
]
```

## Skill and Tool Settings

`skillSettings` can limit what the AI employee may use in this task:

```json
{
  "skills": ["data-metadata", "data-query", "business-analysis-report", "document-search"],
  "tools": ["dispatch-sub-agent-task", "list-ai-employees", "get-ai-employee", "chartGenerator", "formFiller", "getSkill", "suggestions"]
}
```

Notes:

- By default, omit `skills` or `tools` to use the AI employee preset for that category.
- Use an empty array to disable skills or tools for that category.
- If you can not make sure what skills or tools are available, DO NOT set `skillSettings` and the AI employee will use their preset skills and tools.

## Structured Output

The node requires a JSON Schema under `structuredOutput.schema`. The server wraps it as the `result` property of the internal output tool. The AI employee must call the tool and submit:

```json
{
  "result": "<value matching structuredOutput.schema>"
}
```

Default UI schema:

```json
{
  "type": "object",
  "properties": {
    "result": {
      "title": "Response result",
      "type": "string",
      "description": "The text message sent to the user"
    }
  }
}
```

## Approval Modes

| Mode | Behavior |
| --- | --- |
| `no_required` | The output tool is allowed automatically. When the AI submits `result`, the job resolves and the workflow continues. |
| `human_decision` | The output tool requires human approval. After the AI submits an output, the task becomes `pending_acceptance`; any configured assignee can approve, revise, or reject from the AI employee task UI. |
| `ai_decision` | The output tool schema includes `requiresApproval: boolean`. If the AI submits `requiresApproval: false`, the server auto-approves and the workflow continues. Otherwise the task becomes `pending_acceptance` for assignees. |

Assignee parsing supports:

- Plain user ids, validated against the `users` collection.
- Arrays of user ids, such as variables that resolve to an array.
- Filter objects with a valid `filter`, for example `{ "filter": { "id": { "$in": [1, 2] } } }`.

Only one assignee needs to approve for the workflow to continue. Rejecting aborts the workflow task. Revising keeps the conversation open and lets the AI produce a new approval card.

## Branch Description

Does not support branches.

## Test Support

Not supported. The server-side instruction does not implement `test()`.

## Example Configuration

```json
{
  "username": "atlas",
  "model": {
    "llmService": "openai",
    "model": "gpt-4o"
  },
  "userId": 1,
  "message": {
    "system": "You are reviewing reimbursement requests. Follow company policy strictly.",
    "user": "Review this request and return a decision. Request: {{$context.data}}"
  },
  "files": [
    {
      "type": "attachments",
      "value": "{{$context.data.receipts}}"
    }
  ],
  "webSearch": false,
  "structuredOutput": {
    "schema": {
      "type": "object",
      "properties": {
        "decision": {
          "title": "Decision",
          "type": "string"
        },
        "reason": {
          "title": "Reason",
          "type": "string"
        },
        "amount": {
          "title": "Approved amount",
          "type": "number"
        }
      },
      "required": ["decision", "reason"]
    }
  },
  "requiresApproval": "human_decision",
  "assignees": [1, { "filter": { "id": { "$in": [2, 3] } } }]
}
```

## Output Variables

The variable selector is generated from `structuredOutput.schema.properties`.

For this schema:

```json
{
  "type": "object",
  "properties": {
    "decision": { "title": "Decision", "type": "string" },
    "detail": {
      "type": "object",
      "properties": {
        "reason": { "title": "Reason", "type": "string" }
      }
    }
  }
}
```

Example references:

- `{{$jobsMapByNodeKey.ai_review.decision}}`
- `{{$jobsMapByNodeKey.ai_review.detail.reason}}`

If `structuredOutput.schema` is missing, the client exposes no output variables for this node. Do not manually reference child paths that only the server can resolve. Add `json-variable-mapping` or `json-query`, use the whole raw result as its source when available, explicitly model the required fields, and make later nodes use only that JSON node's outputs. Prefer defining `structuredOutput.schema` so the AI Employee node itself provides the frontend variable model.
