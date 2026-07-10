---
title: "HTTP Request"
description: "Use when a workflow must call an external HTTP service, send JSON or form data, and use the response in downstream logic."
---

# HTTP Request

## Node Type

`request`

## Node Description
Sends an HTTP request to a specified URL and returns the response.

## Business Scenario Example
Calling HTTP API of external system such as payment or logistics.

## Configuration List
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| method | string | POST | Yes | HTTP Method: GET/POST/PUT/PATCH/DELETE. |
| url | string | None | Yes | Request URL, supports variable templates. |
| contentType | string | application/json | No | Request body type: `application/json`, `application/x-www-form-urlencoded`, `multipart/form-data`, `application/xml`, `text/plain`. |
| headers | array | [] | No | List of request headers, each item `{ name, value }`. `Content-Type` will be ignored. |
| params | array | [] | No | List of URL parameters, each item `{ name, value }`. |
| data | any | None | No | Request body, format varies with `contentType`, see description below. |
| timeout | number | 5000 | No | Timeout (milliseconds). |
| ignoreFail | boolean | false | No | Whether to ignore request failure and continue the process. |
| onlyData | boolean | false | No | Return only the `data` field (interface response body); defaults to returning full response information. |

### Data Format Description
- `application/json`: Object or array.
- `application/x-www-form-urlencoded`: Array `[{ name, value }]`.
- `multipart/form-data`: Array `[{ name, valueType: 'text'|'file', text?, file? }]`; files support records from file collection (or built-in `attachments` collection).
- `application/xml` / `text/plain`: String.

## Branch Description
Does not support branches.

## Test Support
Supported. This node can use CLI `workflow flow-nodes test` and HTTP `flow_nodes:test`, because the server-side instruction implements `test()`.

## Example Configuration

### JSON body example

```json
{
  "method": "POST",
  "url": "https://api.example.com/v1/orders",
  "contentType": "application/json",
  "headers": [
    { "name": "Authorization", "value": "Bearer {{ $context.data.token }}" }
  ],
  "params": [
    { "name": "sync", "value": "true" }
  ],
  "data": {
    "title": "{{ $context.data.title }}",
    "amount": 100
  },
  "timeout": 10000,
  "ignoreFail": false
}
```

### File upload example

```json
{
  "method": "POST",
  "url": "https://api.example.com/v1/upload",
  "contentType": "multipart/form-data",
  "data": [
    { "name": "description", "valueType": "text", "text": "File upload" },
    { "name": "file", "valueType": "file", "file": "{{$context.data.fileRecord}}" }
  ]
}
```

## Output Variables
The variable selector for this node is a tree array of `{ label, value, children? }`. At runtime, join the `value` segments with `.` and prepend `$jobsMapByNodeKey.<nodeKey>`.

- When `onlyData=false`, the node exposes `status`, `data`, and `headers`.
- When `onlyData=true`, only the node root is exposed, so reference the whole result as `{{$jobsMapByNodeKey.<nodeKey>}}`.
- The selector does not expand nested fields inside `data`. If the response body is structured JSON and any downstream node needs a child field, you must follow this node with `json-variable-mapping` or `json-query`, pass `{{$jobsMapByNodeKey.<nodeKey>.data}}` (or the root when `onlyData=true`) as its source, and define the required output fields.
- Only the JSON modeling node may consume the raw response object. All later nodes must reference the modeled JSON node output; do not manually configure paths such as `{{$jobsMapByNodeKey.http_call.data.order.id}}` even if the server can resolve them, because those paths are absent from the frontend variable tree.
- Example references: `{{$jobsMapByNodeKey.http_call.status}}`, `{{$jobsMapByNodeKey.http_call.data}}`, `{{$jobsMapByNodeKey.http_call.headers}}`.
