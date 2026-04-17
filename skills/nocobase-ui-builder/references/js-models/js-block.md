---
title: JSBlockModel 参考
description: 面向 builder 的 JSBlockModel 约束、stepParams 路径与默认代码模板。
---

# JSBlockModel

## 什么时候用

当页面需要一个独立、自定义展示区块，而普通区块不适合时使用：

- 横幅
- 统计卡
- 说明面板
- 第三方可视化容器

## builder 需要记住的结构

最关键的持久化路径：

```json
{
  "use": "JSBlockModel",
  "stepParams": {
    "jsSettings": {
      "runJs": {
        "version": "v2",
        "code": "ctx.render('<div/>');"
      }
    }
  }
}
```

约束：

- `code` 写在 `stepParams.jsSettings.runJs.code`
- `version` 默认 `v2`
- `runJs` 使用 raw params，不要把 `code` 当模板字段再二次结构化
- JSBlock 运行在受限 RunJS 沙箱里，不要默认假设 `fetch`、`localStorage`、任意 `window.*` 可直接访问
- JSBlock 默认没有预绑定 `ctx.resource`；需要结构化数据时先 `ctx.initResource(...)`
- 当前登录用户优先使用 `ctx.user` 或 `ctx.auth?.user`
- collection 的 `:list` / `:get` 默认使用 resource API，不要直接写进 `ctx.request()`
- `ctx.element` 在源码里仍存在，但 skill 默认不接受直接写 `innerHTML`

## 默认写法

```js
ctx.render('<div style="padding:12px">Custom block</div>');
```

或：

```jsx
const { Card } = ctx.libs.antd;
ctx.render(
  <Card title={ctx.t('Summary')}>
    <div>{ctx.t('Content')}</div>
  </Card>
);
```

## 需要请求数据时

如果只是显示当前登录用户，优先直接使用 `ctx.user` 或 `ctx.auth?.user`，不要先写 `/auth:check`：

```jsx
const currentUser = ctx.user ?? ctx.auth?.user ?? null;

ctx.render(
  <div style={{ padding: 12 }}>
    {currentUser ? (currentUser.nickname ?? currentUser.username ?? `#${currentUser.id}`) : ctx.t('Anonymous')}
  </div>
);
```

如果只是发自定义端点或 request-only 的 HTTP 请求，才默认使用 `ctx.request()`：

```jsx
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

如果要读取 collection 的列表或单条记录，默认先初始化 resource：

```jsx
ctx.initResource('MultiRecordResource');
ctx.resource.setResourceName('tasks');
ctx.resource.setPageSize?.(10);
ctx.resource.setFilter?.({
  status: {
    $eq: 'active',
  },
});
await ctx.resource.refresh();

const rows = ctx.resource.getData() || [];
ctx.render(
  <div style={{ padding: 12 }}>
    {rows.map((row) => (
      <div key={row.id}>{row.title ?? row.name ?? `#${row.id}`}</div>
    ))}
  </div>
);
```

注意：

- block payload 的 `dataScope.filter` 使用 `{ logic, items }`
- RunJS 的 `ctx.request({ params: { filter } })` / `resource.setFilter()` 使用服务端 query object

## 不要默认这么写

```js
ctx.element.innerHTML = '<div>...</div>';
await ctx.request({ url: 'tasks:list', method: 'get' });
await fetch('/api/auth:check', { credentials: 'include' });
```

其中 `innerHTML` 简单赋值可能会被 guard 自动改写为 `ctx.render(...)`，复杂场景会直接 blocker。

## 何时再看别的文档

- 要加载外部库：回看 [runjs-overview.md](runjs-overview.md)
- 需要更明确的渲染规则：回看 [rendering-contract.md](rendering-contract.md)
