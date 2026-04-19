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

## CLI 创建

在表单里创建非字段绑定辅助项时，用 `flow-surfaces add-field --type jsItem`，不要传 `fieldPath`。当前 `settings` 支持 `label`、`tooltip`、`extra`、`showLabel`、`labelWidth`、`labelWrap`、`code`、`version`，不支持 `title`。

```bash
nocobase-ctl flow-surfaces add-field -e <env> -j \
  --target '{"uid":"<create-form-uid>"}' \
  --type jsItem \
  --settings '{"label":"角色治理提示","showLabel":false,"extra":"选择角色后显示角色治理说明","version":"v2","code":"const roles = ctx.formValues?.roles; const selected = Array.isArray(roles) ? roles.length > 0 : Boolean(roles); if (!selected) { ctx.render(null); return; } ctx.render(\"已选择角色，可查看角色治理提示。\");"}'
```

如果它是“默认隐藏、选择后显示”的表单辅助区域，优先把显隐写进 JSItem 自身：`ctx.render(null)` 表示不显示内容；满足条件后再 `ctx.render(...)`。不要默认用 `setFieldState` 控制 JSItem，除非 `get-reaction-meta.targetFields` 明确列出了该 JSItem。

## 不要默认这么写

```js
ctx.element.innerHTML = '<div>Preview</div>';
```

简单的 `innerHTML` 赋值可能会被 guard 自动改写，复杂场景则会直接 blocker。

## 最小判断规则

- 需要字段值同步但不占字段槽位：`JSItemModel`
- 需要字段位置的只读展示：`JSFieldModel`
- 需要字段本身的可编辑输入：`JSEditableFieldModel`
