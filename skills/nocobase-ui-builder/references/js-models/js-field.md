---
title: JSFieldModel 参考
description: 面向 builder 的 JSFieldModel 约束，覆盖只读渲染与可编辑字段的最小范式。
---

# JSFieldModel

## 什么时候用

当“字段位置”需要自定义展示或自定义输入时使用：

- 详情区块里的自定义展示字段
- 表单里的自定义只读项
- 需要自定义输入组件的可编辑字段

如果当前需求是不绑定字段的表单说明或预览块，优先看 [js-item.md](js-item.md)。

## 常用上下文

- `ctx.value`
- `ctx.record`
- `ctx.collection`
- `ctx.render()`

可编辑场景还可能用到：

- `ctx.getValue()`
- `ctx.setValue(v)`

## 只读默认写法

```js
ctx.render(`<span>${String(ctx.value ?? '')}</span>`);
```

或：

```jsx
const { Tag } = ctx.libs.antd;
ctx.render(<Tag>{String(ctx.value ?? '')}</Tag>);
```

## 可编辑最小写法

```jsx
function InputView() {
  return (
    <input
      defaultValue={String(ctx.getValue() ?? '')}
      onInput={(e) => ctx.setValue(e.currentTarget.value)}
    />
  );
}

ctx.render(<InputView />);
```

## 不要默认这么写

```js
ctx.element.innerHTML = `<a>查看详情</a>`;
```

如果需要点击交互，也优先通过 `ctx.render()` 渲染 JSX / HTML，再在必要场景下补事件逻辑。

## 来源

- `~/auto_works/nocobase/docs/docs/cn/interface-builder/fields/specific/js-field.md`
- `~/auto_works/nocobase/docs/docs/cn/runjs/context/render.md`
