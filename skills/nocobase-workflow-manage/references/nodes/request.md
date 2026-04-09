---
title: "HTTP Request"
description: "Explains the method, parameters, request body format, and examples for the HTTP Request node."
---

# HTTP Request

## Node Type

`request`
Please use the `type` value above to create the node; do not use the documentation filename as the type.

## Node Description
Sends an HTTP request to a specified URL and returns the response.

## Business Scenario Example
Calling external system interfaces such as payment or logistics.

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
- `multipart/form-data`: Array `[{ name, valueType: 'text'|'file', text?, file? }]`; files support attachment records or arrays.
- `application/xml` / `text/plain`: String.

## Branch Description
Does not support branches.

## Example Configuration
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

## Output Variables
The variable selector for this node is a tree array of `{ label, value, children? }`. At runtime, join the `value` segments with `.` and prepend `$jobsMapByNodeKey.<nodeKey>`.

- When `onlyData=false`, the node exposes `status`, `data`, and `headers`.
- When `onlyData=true`, only the node root is exposed, so reference the whole result as `{{$jobsMapByNodeKey.<nodeKey>}}`.
- The selector does not expand nested fields inside `data`; if the response body is structured JSON and you need named child variables, follow this node with `json-query` or `json-variable-mapping`.
- Example references: `{{$jobsMapByNodeKey.http_call.status}}`, `{{$jobsMapByNodeKey.http_call.data}}`, `{{$jobsMapByNodeKey.http_call.headers}}`.
