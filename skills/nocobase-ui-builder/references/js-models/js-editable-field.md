---
title: JSEditableFieldModel 参考
description: 面向 builder 的 JSEditableFieldModel 约束，覆盖可编辑字段的双向绑定和默认渲染范式。
---

# JSEditableFieldModel

## 什么时候用

当用户要的不是“只读展示”，而是“字段本身的自定义输入组件”时使用：

- 可编辑文本输入
- 自定义选择器
- 复合输入控件
- 需要和表单双向绑定的字段

如果当前需求只是字段位置的只读渲染，优先看 [js-field.md](js-field.md)。

## 常用上下文

- `ctx.getValue()`
- `ctx.setValue(v)`
- `ctx.value`
- `ctx.form`
- `ctx.formValues`
- `ctx.record`
- `ctx.render()`

补充：

- `ctx.value` 更像只读快照
- 可编辑场景默认优先用 `ctx.getValue()` / `ctx.setValue(v)` 做双向绑定

## 默认写法

```jsx
function InputView() {
  return (
    <input
      defaultValue={String(ctx.getValue?.() ?? ctx.value ?? '')}
      onInput={(e) => ctx.setValue?.(e.currentTarget.value)}
    />
  );
}

ctx.render(<InputView />);
```

## 常见辅助上下文

- `ctx.namePath`
- `ctx.disabled`
- `ctx.readOnly`

例如：

```jsx
function InputView() {
  const disabled = !!ctx.disabled || !!ctx.readOnly;
  return (
    <input
      disabled={disabled}
      defaultValue={String(ctx.getValue?.() ?? '')}
      onInput={(e) => ctx.setValue?.(e.currentTarget.value)}
    />
  );
}

ctx.render(<InputView />);
```

## 不要默认这么写

```js
ctx.element.innerHTML = '<input />';
```

简单的 `innerHTML` 赋值可能会被 guard 自动改写，但复杂场景会直接 blocker。

## 最小判断规则

- 只读展示：`JSFieldModel`
- 可编辑输入：`JSEditableFieldModel`
- 不绑定字段的表单辅助区域：`JSItemModel`
