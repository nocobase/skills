---
title: "LLM"
description: "Use when a workflow should call a configured LLM directly to summarize, classify, extract, analyze text or images, or produce structured output."
---

# LLM

## Node Type

`llm`

## Node Description

Calls a configured LLM service and waits for the model response. The node is registered by `@nocobase/plugin-ai` and is available only in asynchronous workflows.

## Business Scenario Example

Use an LLM to summarize a submitted record, classify a customer request, extract fields from text, or analyze images and return content for downstream workflow nodes.

## Configuration List

| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| llmService | string | None | Yes | Name of the configured LLM service (`llmServices.name`). The server resolves it and loads the matching provider. Should select from the list of `llmServices:list` API. |
| model | string | Provider-specific | Usually | Model id. This is part of the provider model options and is normally configured by the selected provider's settings form. The available models can be retrieved from `ai:listModels` API with parameter `llmService` set to the selected LLM service name. |
| responseFormat | string/object | Provider-specific | No | Provider-specific response format. Common values include text mode, JSON object mode, or JSON schema mode, depending on provider/model support. |
| messages | array | `[{ role: "user", content: [{ type: "text" }] }]` | Yes | Prompt message list. See [Message Format](#message-format). |
| structuredOutput | object | None | No | Structured output options. See [Structured Output](#structured-output). |
| ignoreFail | boolean | false | No | If true, a failed LLM call is treated as resolved when the workflow resumes. |
| ...modelOptions | any | Provider-specific | No | Additional model options such as temperature, max tokens, top-p, and other provider-specific parameters. The node passes all config fields other than `llmService`, `messages`, and `structuredOutput` into the provider as model options. |

## Message Format

`messages` is an ordered array. Each item has a `role`:

- `system`: uses `message` as plain text.
- `assistant`: uses `message` as plain text.
- `user`: uses `content`, an array of text or image parts.

User content item formats:

```json
{ "type": "text", "content": "Summarize {{$context.data.description}}" }
```

```json
{ "type": "image_url", "image_url": { "url": "{{$context.data.image.url}}" } }
```

```json
{ "type": "image_base64", "image_url": { "url": "{{$context.data.image.url}}" } }
```

Notes:

- If a user message has exactly one text content item, the server sends it as a plain string `HumanMessage`.
- If a user message has multiple content items or any image item, the server sends a multimodal content array.
- `image_url` sends remote HTTP URLs as URLs. Local non-HTTP paths are read from the app working directory and encoded as base64 data URLs.
- `image_base64` always fetches or reads the image and sends it as a base64 data URL. Use this when the LLM service cannot access the image URL directly.
- Image URL fields may be a string, `{ url }`, or an array of either form.

## Structured Output

`structuredOutput` can be configured when the response should be parsed into structured content.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| schema | object/string | Yes | JSON Schema describing the expected structured response. JSON5-style strings may be accepted by the UI, but server/provider code receives the parsed value or string from workflow parsing. |
| name | string | No | Name of the schema/object for providers that support it. |
| description | string | No | Description to help the model understand the schema. |
| strict | boolean | No | Strict schema mode for providers/models that support it. |

Provider behavior depends on the selected provider and model:

- Text-only structured output may be implemented through tool binding.
- JSON object response format requires the prompt to explicitly ask for JSON and usually returns JSON in `content`.
- JSON schema response format can use the configured schema directly.
- Some local providers, such as Ollama, may pass the schema as a provider-specific `format` option.

## Branch Description

Does not support branches.

## Test Support

Not supported. The server-side instruction does not implement `test()`.

## Example Configuration

### Text classification

```json
{
  "llmService": "openai",
  "model": "gpt-4o-mini",
  "temperature": 0,
  "messages": [
    {
      "role": "system",
      "message": "Classify the request. Respond with short labels only."
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "content": "Request: {{$context.data.description}}"
        }
      ]
    }
  ],
  "structuredOutput": {
    "name": "classification",
    "schema": {
      "type": "object",
      "properties": {
        "category": { "type": "string" },
        "priority": { "type": "string" }
      },
      "required": ["category", "priority"]
    },
    "strict": true
  },
  "ignoreFail": false
}
```

### Multimodal image analysis

```json
{
  "llmService": "openai",
  "model": "gpt-4o",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "content": "Describe the issue shown in this image."
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "{{$context.data.screenshot.url}}"
          }
        }
      ]
    }
  ]
}
```

## Output Variables

The variable selector exposes a tree with these children:

- `content`: model response content.
- `structuredContent`: parsed structured output, when `structuredOutput` is configured and the provider returns parsed content.
- `additionalKwargs`: provider/LangChain additional keyword data.

Example references:

- `{{$jobsMapByNodeKey.llm_summary.content}}`
- `{{$jobsMapByNodeKey.llm_summary.structuredContent}}`
- `{{$jobsMapByNodeKey.llm_summary.additionalKwargs}}`

These roots do not automatically expose every nested response field. If a downstream node needs a child inside `structuredContent` or `additionalKwargs` that is absent from the variable tree, you must follow the LLM node with `json-variable-mapping` or `json-query`, model the required fields, and make later nodes use only that JSON node's outputs. Do not manually append unmodeled child paths to the LLM result.
