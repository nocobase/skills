---
title: JSFieldModel 参考
description: 面向 builder 的 JSFieldModel 约束，覆盖只读字段位置渲染。
---

# JSFieldModel

## 什么时候用

当“字段位置”需要自定义展示时使用：

- 详情区块里的自定义展示字段
- 表单里的自定义只读项

如果当前需求是不绑定字段的表单说明或预览块，优先看 [js-item.md](js-item.md)。
如果当前需求是“可编辑字段自定义输入”，改看 [js-editable-field.md](js-editable-field.md)。

如果当前需求是“关联标题列点击打开详情弹窗”，不要默认直接跳 `JSFieldModel`。
这种场景先看 [../patterns/clickable-relation-column.md](../patterns/clickable-relation-column.md)，默认优先回到原生关系列方案。

## 常用上下文

- `ctx.value`
- `ctx.record`
- `ctx.collection`
- `ctx.render()`

## 只读默认写法

```js
ctx.render(`<span>${String(ctx.value ?? '')}</span>`);
```

或：

```jsx
const { Tag } = ctx.libs.antd;
ctx.render(<Tag>{String(ctx.value ?? '')}</Tag>);
```

## 不要默认这么写

```js
ctx.element.innerHTML = `<a>查看详情</a>`;
```

如果需要点击交互，也优先通过 `ctx.render()` 渲染 JSX / HTML，再在必要场景下补事件逻辑。简单的 `innerHTML` 赋值可能会被 guard 自动改写，复杂场景则会直接 blocker。

如果用户明确要求用 JS field 处理“关联标题列点击弹窗”，写前审计时必须显式传：

```json
{
  "intentTags": ["js.explicit"]
}
```
