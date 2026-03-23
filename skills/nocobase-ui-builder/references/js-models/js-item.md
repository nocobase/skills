---
title: JSItemModel 参考
description: 面向 builder 的 JSItemModel 约束，覆盖表单中的非字段绑定自定义项。
---

# JSItemModel

## 什么时候用

当表单里需要一个“不绑定字段”的自定义区域时使用：

- 实时预览
- 提示信息
- 小型交互块
- 汇总说明

如果当前需求是字段位置渲染，优先看 [js-field.md](js-field.md)。

## 常用上下文

- `ctx.formValues`
- `ctx.record`
- `ctx.resource`
- `ctx.render()`
- `ctx.onRefReady()`

## 默认写法

```jsx
const values = ctx.formValues || {};
const total = Number(values.price || 0) * Number(values.quantity || 1);
ctx.render(<div>Total: {total}</div>);
```

## 不要默认这么写

```js
ctx.element.innerHTML = '<div>Preview</div>';
```

简单的 `innerHTML` 赋值可能会被 guard 自动改写，复杂场景则会直接 blocker。

## 最小判断规则

- 需要字段值同步但不占字段槽位：`JSItemModel`
- 需要字段位置的只读展示：`JSFieldModel`
- 需要字段本身的可编辑输入：`JSEditableFieldModel`
