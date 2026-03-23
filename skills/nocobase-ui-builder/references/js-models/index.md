---
title: JS Model 与 RunJS 索引
description: 遇到 JSBlockModel、JSColumnModel、JSFieldModel、JSItemModel、JSActionModel 或 runJs 代码生成任务时的优先入口。
---

# JS Model 与 RunJS 索引

## 什么时候先读这里

只要当前任务涉及以下任一内容，先读本目录，不要直接套普通 block/pattern 模板：

- `JSBlockModel`
- `JSColumnModel`
- `JSFieldModel`
- `JSItemModel`
- `JSActionModel`
- 任何 `stepParams.jsSettings.runJs` / `clickSettings.runJs` 代码生成

## 强规则

- 对需要渲染的 JS model，默认使用 `ctx.render()`。
- 不要把 `ctx.element.innerHTML = ...` 当作默认推荐方案。
- 不要把 `return value` 当作 `JSBlockModel`、`JSColumnModel`、`JSFieldModel`、`JSItemModel` 的默认渲染范式。
- `JSActionModel` 主要负责点击逻辑，不属于“渲染型 JS model”。
- 不要默认假设浏览器全局 `fetch`、`localStorage`、任意 `window.*` 在 RunJS 中可直接访问。
- 当前登录用户优先使用 `ctx.user` 或 `ctx.auth?.user`，不要默认请求 `auth:check`。
- RunJS 里读取 NocoBase collection/list/get 默认使用 `ctx.initResource()` + `ctx.resource`，或 `ctx.makeResource()`。
- `ctx.request()` 只作为自定义端点、跨域请求或 resource API 无法表达的 request-only 场景兜底。
- 生成 RunJS 代码后，至少回看一次是否误写了 `fetch(` 或把 `collection:list/get` 写进了 `ctx.request()`；若出现，优先改写为 `ctx.user`、`ctx.initResource()` / `ctx.makeResource()`，只有自定义端点才保留 `ctx.request()`。

## 推荐阅读顺序

1. 先读 [runjs-overview.md](runjs-overview.md)
2. 如果当前模型需要渲染，再读 [rendering-contract.md](rendering-contract.md)
3. 然后按模型类型继续读：
   - [js-block.md](js-block.md)
   - [js-column.md](js-column.md)
   - [js-field.md](js-field.md)
   - [js-item.md](js-item.md)
   - [js-action.md](js-action.md)

## 模型速查

| 模型 | 默认用途 | 默认上下文 | 默认写法 |
| --- | --- | --- | --- |
| `JSBlockModel` | 页面区块自定义内容 | `ctx.libs` `ctx.render` `ctx.request` | `ctx.render(...)` |
| `JSColumnModel` | 表格单元格渲染 | `ctx.record` `ctx.collection` `ctx.render` | `ctx.render(...)` |
| `JSFieldModel` | 字段位置自定义渲染 | `ctx.value` `ctx.record` `ctx.render` | `ctx.render(...)` |
| `JSItemModel` | 表单里无字段绑定的自定义项 | `ctx.form` `ctx.blockModel` `ctx.render` | `ctx.render(...)` |
| `JSActionModel` | 按钮点击逻辑 | `ctx.record` / `ctx.resource` / `ctx.form` | 执行逻辑，不以渲染为主 |

补充：

- `JSBlockModel` 默认没有预绑定 `ctx.resource`；需要数据时先手动 `ctx.initResource(...)`。
- `ctx.element` 仍可作为兼容上下文存在，但默认生成代码时应优先使用 `ctx.render()`，而不是直接操作 DOM。
