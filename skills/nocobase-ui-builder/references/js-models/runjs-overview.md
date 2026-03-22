---
title: RunJS 概览
description: 面向 nocobase-ui-builder 的 RunJS 最小必备知识，覆盖顶层 await、模块导入与容器渲染。
---

# RunJS 概览

## 核心认知

RunJS 是 NocoBase 里给 JS 区块、JS 字段、JS 项、JS 表格列、JS 操作使用的浏览器端执行环境。

对 builder 来说，只需要先记住这 4 件事：

1. 支持顶层 `await`
2. 可以通过 `ctx.importAsync()` / `ctx.requireAsync()` 加载外部模块
3. 渲染型 JS model 默认通过 `ctx.render()` 输出内容
4. 代码运行在受限沙箱里，可通过 `ctx` 访问上下文

## 常用能力

| 能力 | 默认用法 |
| --- | --- |
| 顶层异步 | `const mod = await ctx.importAsync(url)` |
| ESM 模块 | `ctx.importAsync(url)` |
| UMD / AMD 模块 | `ctx.requireAsync(url)` |
| 页面内渲染 | `ctx.render(<div />)` 或 `ctx.render('<div>...</div>')` |
| 国际化 | `ctx.t('...')` |
| 常用库 | `ctx.libs.React` `ctx.libs.antd` |

## builder 写代码时的默认范式

### 渲染型模型

适用：

- `JSBlockModel`
- `JSColumnModel`
- `JSFieldModel`
- `JSItemModel`

默认写法：

```js
ctx.render('<div>...</div>');
```

或：

```jsx
ctx.render(<div>...</div>);
```

### 动作型模型

适用：

- `JSActionModel`

默认写法：

```js
const rows = ctx.resource?.getSelectedRows?.() || [];
if (!rows.length) {
  ctx.message.warning(ctx.t('Please select records'));
  return;
}
await ctx.resource.refresh?.();
```

## 明确不要默认使用的写法

```js
ctx.element.innerHTML = '...';
return value;
```

这两种写法都不应作为 builder 生成渲染代码的默认模板：

- `ctx.element` 只作为容器概念或特例说明保留
- `return value` 不能替代渲染动作

## 来源

- `~/auto_works/nocobase/docs/docs/cn/interface-builder/runjs.md`
- `~/auto_works/nocobase/docs/docs/cn/runjs/index.md`
