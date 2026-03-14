---
title: "动态表达式计算"
description: "说明动态表达式计算节点如何读取表达式并执行计算。"
---

# 动态表达式计算

## 节点类型

`dynamic-calculation`
请使用以上 `type` 值创建节点，不要使用文档文件名作为 type。

## 节点描述
从“表达式集合”中读取动态表达式并执行计算，返回结果。

## 业务场景举例
根据配置表中的表达式动态计算折扣或评分。

## 配置项列表
| 字段 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| expression | string | 无 | 是 | 动态表达式来源（通常为表达式集合的变量）。解析结果需包含 `engine` 与 `expression`。 |
| scope | string | 无 | 否 | 变量数据源，作为表达式执行时的作用域。 |

## 分支说明
不支持分支。

## 示例配置
```json
{
  "expression": "{{ $context.data.expressionRecord }}",
  "scope": "{{ $context.data }}"
}
```