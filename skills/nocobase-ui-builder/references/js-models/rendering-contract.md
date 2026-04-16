---
title: JS 渲染契约
description: 渲染型 JS model 的统一约束：默认用 ctx.render()，ctx.element 只作为锚点或兼容上下文说明。
---

# JS 渲染契约

## 适用模型

- `JSBlockModel`
- `JSColumnModel`
- `JSFieldModel`
- `JSEditableFieldModel`
- `JSItemModel`

## 强规则

- 对需要渲染的 JS model，默认使用 `ctx.render()`。
- 不要把 `ctx.element.innerHTML = ...` 当作默认模板；skill 会先尝试自动改写，不能安全改写时直接 blocker。
- 不要把 `return value` 当作渲染结果。

## 为什么

根据 NocoBase 源码当前实现：

- `ctx.render()` 会默认渲染到 `ctx.element`
- `ctx.render()` 统一处理 React Root、HTML 字符串和 DOM 节点
- `ctx.element` 仍然存在，但它更适合作为容器/锚点概念，而不是 skill 的默认渲染出口

## 默认模板

### HTML 字符串

```js
ctx.render('<div style="padding:12px">Hello</div>');
```

### JSX

```jsx
const { Tag } = ctx.libs.antd;
ctx.render(<Tag color="green">OK</Tag>);
```

### DOM 节点

```js
const div = document.createElement('div');
div.textContent = 'Hello';
ctx.render(div);
```

## `ctx.element` 的定位

`ctx.element` 仍然有意义，但默认只用于下面两类场景：

1. 解释“默认渲染容器是什么”
2. 作为弹层锚点拿原生 DOM，例如 `ctx.element?.__el`

只有在官方能力要求必须直接拿 DOM 时，才允许引用 `ctx.element`。即便如此，也应优先把最终输出交回给 `ctx.render()`；直接写 `innerHTML` 不属于 skill 默认允许的路径。

## 错误示例

### 错误 1：把返回值当渲染

```js
const value = ctx.record?.status || '-';
return value;
```

问题：没有发生实际渲染。

### 错误 2：把直接写 DOM 当默认路径

```js
ctx.element.innerHTML = '<div>...</div>';
```

问题：这不是 skill 允许的默认范式；guard 会优先尝试自动改写，剩余复杂场景直接阻断。

## 正确示例

```js
const value = ctx.record?.status || '-';
ctx.render(`<span>${value}</span>`);
```
