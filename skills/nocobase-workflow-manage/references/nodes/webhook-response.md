---
title: "响应"
description: "说明 Webhook 响应节点的状态码、响应头与返回体配置。"
---

# 响应

## 节点类型

`response`
请使用以上 `type` 值创建节点，不要使用文档文件名作为 type。

## 节点描述
配置 Webhook 同步流程的 HTTP 响应内容并结束流程。

## 业务场景举例
Webhook 流程中直接返回校验结果或处理状态，可类比 HTTP handler 的 return。

## 配置项列表
| 字段 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| statusCode | number | 200 | 是 | HTTP 状态码。 |
| headers | array | [] | 否 | 响应头数组，每项 `{ name, value }`。 |
| body | object | {} | 否 | 响应体（仅支持 JSON）。 |

## 分支说明
不支持分支（终止节点）。

## 示例配置
```json
{
  "statusCode": 200,
  "headers": [
    { "name": "X-Request-Id", "value": "{{ $context.data.requestId }}" }
  ],
  "body": {
    "ok": true,
    "data": "{{ $context.data }}"
  }
}
```