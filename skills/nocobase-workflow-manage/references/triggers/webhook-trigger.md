---
title: "Webhook 触发器"
description: "通过外部 HTTP POST 调用触发流程，支持请求解析与自定义响应。"
---

# Webhook 触发器

## 触发器类型

`webhook`
请使用以上 `type` 值创建触发器，不要使用文档文件名作为 type。

## 适用场景
- 外部系统回调（支付、消息、通知等）。
- 需要将第三方请求参数解析后用于后续节点。

## 触发时机 / 事件
- 访问系统生成的 Webhook URL（仅支持 `POST`）。
- 可选 HTTP Basic Authentication 验证。
- 同步/异步模式对响应策略不同：
  - 同步模式：由响应节点（response）决定返回内容；若未到达响应节点，默认 200/500。
  - 异步模式：直接返回触发器配置中的 `response`。

## 配置项列表
| 字段 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| basicAuthentication | false \| object | false | 否 | HTTP Basic Authentication 配置。未开启时填 `false`。 |
| basicAuthentication.username | string | - | 否 | 认证用户名（仅在启用时必填）。 |
| basicAuthentication.password | string | - | 否 | 认证密码（仅在启用时必填）。 |
| request | object | {} | 否 | 请求解析配置。 |
| request.headers | object[] | [] | 否 | 请求头解析配置（用于变量选项展示与映射）。 |
| request.headers[].key | string | - | 是 | 请求头名称（如 `x-signature`）。 |
| request.query | object[] | [] | 否 | 查询参数解析配置。 |
| request.query[].key | string | - | 是 | 查询参数路径（支持嵌套，如 `order.id`）。 |
| request.query[].alias | string | - | 否 | 变量别名（仅影响显示）。 |
| request.query[]._var | string | - | 否 | 内部变量名（由界面自动生成，如 `query_$0`）。 |
| request.body | object[] | [] | 否 | JSON 请求体解析配置（仅支持 `application/json`）。 |
| request.body[].key | string | - | 是 | JSON 路径（如 `data.id`）。 |
| request.body[].alias | string | - | 否 | 变量别名（仅影响显示）。 |
| request.body[]._var | string | - | 否 | 内部变量名（由界面自动生成，如 `body_$0`）。 |
| response | object | - | 否 | 异步模式下的响应配置；未配置时默认 200 且空响应体。 |
| response.statusCode | number | 200 | 是 | HTTP 状态码。 |
| response.headers | object[] | [] | 否 | 响应头数组，元素包含 `name` 与 `value`。 |
| response.headers[].name | string | - | 是 | 响应头名称。 |
| response.headers[].value | string | - | 是 | 响应头值（支持模板变量）。 |
| response.body | object | - | 否 | 响应体（JSON），支持模板变量。 |

## 触发器变量
- `$context.headers`：请求头对象（完整原始头）。
- `$context.query`：解析后的查询参数对象，包含原始对象及映射变量（如 `query_$0`）。
- `$context.body`：解析后的 JSON 请求体对象，包含原始对象及映射变量（如 `body_$0`）。

## 示例配置
```json
{
  "basicAuthentication": {
    "username": "webhook",
    "password": "secret"
  },
  "request": {
    "headers": [
      { "key": "x-signature" }
    ],
    "query": [
      { "key": "event", "alias": "事件", "_var": "query_$0" }
    ],
    "body": [
      { "key": "data.id", "alias": "订单ID", "_var": "body_$0" }
    ]
  },
  "response": {
    "statusCode": 200,
    "headers": [
      { "name": "content-type", "value": "application/json" }
    ],
    "body": {
      "ok": true,
      "id": "{{ $context.body.body_$0 }}"
    }
  }
}
```