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

- `ctx.form`
- `ctx.blockModel`
- `ctx.record`
- `ctx.collection`
- `ctx.render()`

## 默认写法

```jsx
const render = () => {
  const { price = 0, quantity = 1 } = ctx.form.getFieldsValue();
  const total = Number(price) * Number(quantity);
  ctx.render(<div>Total: {total}</div>);
};

render();
ctx.blockModel?.on?.('formValuesChange', render);
```

## 不要默认这么写

```js
ctx.element.innerHTML = '<div>Preview</div>';
```

## 最小判断规则

- 需要字段值同步但不占字段槽位：`JSItemModel`
- 需要读写某个字段值本身：`JSFieldModel`
