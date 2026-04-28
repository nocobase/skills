---
title: JSActionModel 参考
description: 面向 builder 的 JSActionModel 约束，覆盖按钮点击逻辑、resource/record/form 上下文与常见动作模板。
---

# JSActionModel

## 什么时候用

当用户要的是“按钮点击后执行逻辑”，而不是页面内渲染时使用：

- 接口请求
- 批量处理
- 记录级操作
- 触发 popup / drawer / dialog 配置之外的点击逻辑
- 处理完后刷新资源

## 关键区别

`JSActionModel` 不是渲染型 JS model。

默认关注：

- `ctx.resource`
- `ctx.record`
- `ctx.form`
- `ctx.message`
- `ctx.notification`

而不是 `ctx.render(...)`。

`ctx.openView(...)` 是上游能力参考，不是 skill-mode final RunJS 输出。需要打开 popup / drawer / dialog 时，改配置层的 popup action / field popup / openView，不要在 JSAction 代码里直接调用。

## 默认写法

### 集合级按钮

```js
const rows = ctx.resource?.getSelectedRows?.() || [];
if (!rows.length) {
  ctx.message.warning(ctx.t('Please select records'));
  return;
}
await ctx.resource.refresh?.();
```

### 记录级按钮

```js
const record = await ctx.getVar('ctx.record');
if (!record) {
  ctx.message.error(ctx.t('No record'));
  return;
}

ctx.message.success(ctx.t('Record action completed'));
await ctx.resource?.refresh?.();
```

## 何时回看别的文档

- 如果动作是打开 popup / openView：继续看 `../patterns/popup-openview.md`，在配置层实现，不要输出 `ctx.openView(...)` final JS
- 如果动作里还要写渲染代码：再回看 [rendering-contract.md](rendering-contract.md)
