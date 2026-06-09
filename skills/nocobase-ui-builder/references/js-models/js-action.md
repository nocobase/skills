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

如果当前需求其实是在 action 槽位里渲染一个自定义 item，而不是普通点击按钮，改看 `JSItemActionModel` / `jsItem` action 路径，不要继续走 `JSActionModel`。

## 关键区别

`JSActionModel` 不是渲染型 JS model。

默认关注：

- `ctx.resource`
- `ctx.record`
- `ctx.form`
- `ctx.message`
- `ctx.notification`

而不是 `ctx.render(...)`。

这类 action 默认写到 `clickSettings.runJs`。

`JSActionModel` 可以作为 popup / drawer / dialog / drilldown 的触发动作，但 final RunJS 只能调用已落库的 popup-capable FlowModel：先通过配置层或 flow-surfaces 创建/定位模板优先的 popup host，再用 `ctx.openView(triggerUid, ...)` 打开它。`triggerUid` 通常是 popup host FlowModel uid；host 的 `popupSettings.openView.uid`（targetUid）优先指向模板 target，并保留 `popupTemplateUid` / `popupTemplateMode="reference"`。不要把 ChildPage、page、tab、popup subtree 或临时 uid 当作触发目标，也不要只写 action 空壳或让 JS 临时造弹窗结构。

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

- 如果动作是打开 popup / openView：继续看 `../patterns/popup-openview.md` 和 `../js-snippets/safe/global/open-popup-flow-model.md`，先解析模板优先的 popup-capable FlowModel，再输出受限的 `ctx.openView(triggerUid, ...)` final JS
- 如果动作里还要写渲染代码：再回看 [rendering-contract.md](rendering-contract.md)
