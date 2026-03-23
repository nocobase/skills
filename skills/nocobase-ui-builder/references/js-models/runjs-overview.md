---
title: RunJS 概览
description: 面向 nocobase-ui-builder 的 RunJS 最小必备知识，覆盖顶层 await、模块导入、受限沙箱与数据访问默认范式。
---

# RunJS 概览

## 核心认知

RunJS 是 NocoBase 里给 JS 区块、JS 字段、JS 可编辑字段、JS 项、JS 表格列、JS 操作使用的浏览器端执行环境。

对 builder 来说，只需要先记住这 5 件事：

1. 支持顶层 `await`
2. 可以通过 `ctx.importAsync()` / `ctx.requireAsync()` 加载外部模块
3. 渲染型 JS model 默认通过 `ctx.render()` 输出内容
4. 代码运行在受限沙箱里，可通过 `ctx` 访问上下文
5. 不要默认假设浏览器全局 `fetch`、`localStorage`、任意 `window.*` 可直接访问

补充：

- 上游源码仍保留 `ctx.element` / `innerHTML` 兼容路径
- `nocobase-ui-builder` skill 明确更严格：默认只生成 `ctx.render(...)`
- 对简单的 `innerHTML = ...` 赋值，guard 会尝试自动改写；剩余复杂场景直接 blocker

## 常用能力

| 能力 | 默认用法 |
| --- | --- |
| 顶层异步 | `const mod = await ctx.importAsync(url)` |
| ESM 模块 | `ctx.importAsync(url)` |
| UMD / AMD 模块 | `ctx.requireAsync(url)` |
| 页面内渲染 | `ctx.render(<div />)` 或 `ctx.render('<div>...</div>')` |
| HTTP 请求 | `await ctx.request({ url: '/app:getInfo', method: 'get' })` |
| 结构化数据资源 | `ctx.initResource('MultiRecordResource')` 后使用 `ctx.resource` |
| 国际化 | `ctx.t('...')` |
| 常用库 | `ctx.libs.React` `ctx.libs.antd` |

## 数据访问默认范式

### 当前登录用户

如果只是需要当前登录用户，不要为了取用户信息再请求一次 `/auth:check`，优先直接使用上下文里的 `ctx.user` 或 `ctx.auth?.user`：

```jsx
const currentUser = ctx.user ?? ctx.auth?.user ?? null;

ctx.render(
  <div style={{ padding: 12 }}>
    {currentUser ? (currentUser.nickname ?? currentUser.username ?? `#${currentUser.id}`) : ctx.t('Anonymous')}
  </div>
);
```

### 结构化数据

如果目标是 NocoBase collection 的列表 / 单条记录 / 资源 action，而不是临时拼一个 HTTP 请求：

- JSBlock 默认先 `ctx.initResource(type)`，再使用 `ctx.resource`
- 需要多个独立资源时，使用 `ctx.makeResource(type)`

JSBlock 列表示例：

```jsx
ctx.initResource('MultiRecordResource');
ctx.resource.setResourceName('tasks');
ctx.resource.setPageSize?.(5);
ctx.resource.setSort?.(['-createdAt']);
ctx.resource.setFilter?.({
  status: {
    $eq: 'active',
  },
});
await ctx.resource.refresh();

const rows = ctx.resource.getData() || [];
ctx.render(
  <ul>
    {rows.map((row) => (
      <li key={row.id}>{row.title ?? row.name ?? `#${row.id}`}</li>
    ))}
  </ul>
);
```

注意：

- block payload 里的 `dataScope.filter` 使用 `{ logic, items }`
- RunJS 里的 `resource.setFilter()` / `ctx.request({ params: { filter } })` 使用服务端 query object，如 `{ status: { $eq: 'active' } }`

### 远程 HTTP 请求

只有自定义端点、跨域请求或 resource API 无法表达的 request-only 场景，才默认使用 `ctx.request()`。不要生成：

```js
await fetch('/api/...');
```

推荐写法：

```js
const { data } = await ctx.request({
  url: '/app:getInfo',
  method: 'get',
  skipNotify: true,
});

const appName = data?.data?.name;
ctx.render(
  <div style={{ padding: 12 }}>
    {appName || ctx.t('Unnamed app')}
  </div>
);
```

## builder 写代码时的默认范式

### 渲染型模型

适用：

- `JSBlockModel`
- `JSColumnModel`
- `JSFieldModel`
- `JSEditableFieldModel`
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
await fetch('/api/auth:check', { credentials: 'include' });
```

这些写法都不应作为 builder 生成代码的默认模板：

- `ctx.element` 只作为容器概念、锚点或低级 DOM 互操作说明保留；不要把它当默认渲染出口
- `return value` 不能替代渲染动作
- `fetch` 不应被默认假设为可用；在 RunJS 里应优先使用 `ctx.user` / resource API，只有自定义端点才使用 `ctx.request()`
