---
title: JSColumnModel 参考
description: 面向 builder 的 JSColumnModel 约束、上下文与默认代码模板。
---

# JSColumnModel

## 什么时候用

当表格里需要一个不直接绑定单一字段、而是做自定义单元格渲染的列时使用：

- 状态标签
- 多字段组合展示
- 单元格内按钮 / 链接
- 远程汇总或衍生显示

如果只是普通字段展示，不要优先用 `JSColumnModel`，应先考虑普通 `TableColumnModel + subModels.field`。

如果需求是“关联标题列点击打开详情弹窗”，也不要默认直接跳 `JSColumnModel`。
这种场景先看 [../patterns/clickable-relation-column.md](../patterns/clickable-relation-column.md)，默认优先回到原生关系列方案。

## 默认上下文

- `ctx.record`
- `ctx.recordIndex`
- `ctx.collection`
- `ctx.viewer`
- `ctx.render()`

兼容上下文：

- `ctx.element`

说明：

- `ctx.element` 在上游源码中仍然存在，但 skill 默认不接受直接写 `innerHTML`
- 表格列里要输出内容时，仍应统一交给 `ctx.render(...)`

## 默认写法

```js
const status = ctx.record?.status || '-';
ctx.render(`<span>${status}</span>`);
```

或：

```jsx
const { Tag } = ctx.libs.antd;
const status = ctx.record?.status || 'unknown';
ctx.render(<Tag color="green">{String(status)}</Tag>);
```

## 绝对不要默认生成的写法

```js
const value = record?.status || '-';
return value;
```

原因：

- `record` 不是默认推荐的上下文入口，优先用 `ctx.record`
- `return value` 不是渲染动作

也不要默认生成：

```js
ctx.element.innerHTML = '<span>...</span>';
```

这类代码简单场景可能会被 guard 自动改写，但复杂场景会直接 blocker。

如果用户明确要求用 JS column 处理“关联标题列点击弹窗”，写前审计时必须显式传：

```json
{
  "intentTags": ["js.explicit"]
}
```

否则 guard 会把它视为高风险 workaround，而不是默认推荐方案。

## 最小结构

```json
{
  "use": "JSColumnModel",
  "stepParams": {
    "tableColumnSettings": {
      "title": {
        "title": "状态"
      }
    },
    "jsSettings": {
      "runJs": {
        "version": "v2",
        "code": "const status = ctx.record?.status || '-'; ctx.render(`<span>${status}</span>`);"
      }
    }
  }
}
```

## 与 `table-column-rendering.md` 的分工

- `table-column-rendering.md` 解决普通 display field 列
- 本文解决 `JSColumnModel` 自定义 RunJS 列

不要把两者混成同一种列渲染逻辑。
