---
title: JS Model 与 RunJS 索引
description: 遇到 JSBlockModel、JSColumnModel、JSFieldModel、JSEditableFieldModel、JSItemModel、JSActionModel 或 runJs 代码生成任务时的优先入口。
---

# JS Model 与 RunJS 索引

## 什么时候先读这里

只要当前任务涉及以下任一内容，先读本目录，不要直接套普通 block/pattern 模板：

- `JSBlockModel`
- `JSColumnModel`
- `JSFieldModel`
- `JSEditableFieldModel`
- `JSItemModel`
- `JSActionModel`
- 任何 `stepParams.jsSettings.runJs` / `clickSettings.runJs` 代码生成

## 强规则

- 对需要渲染的 JS model，默认使用 `ctx.render()`。
- 不要把 `ctx.element.innerHTML = ...` 当作默认推荐方案；skill 会先尝试自动改写，仍残留则直接 blocker。
- 不要把 `return value` 当作 `JSBlockModel`、`JSColumnModel`、`JSFieldModel`、`JSEditableFieldModel`、`JSItemModel` 的默认渲染范式。
- `JSActionModel` 主要负责点击逻辑，不属于“渲染型 JS model”。
- 不要默认假设浏览器全局 `fetch`、`localStorage`、任意 `window.*` 在 RunJS 中可直接访问。
- 当前登录用户优先使用 `ctx.user` 或 `ctx.auth?.user`，不要默认请求 `auth:check`。
- RunJS 里读取 NocoBase collection/list/get 默认使用 `ctx.initResource()` + `ctx.resource`，或 `ctx.makeResource()`。
- `ctx.request()` 只作为自定义端点、跨域请求或 resource API 无法表达的 request-only 场景兜底。
- 生成 RunJS 代码后，至少回看一次是否误写了 `fetch(` 或把 `collection:list/get` 写进了 `ctx.request()`；若出现，优先改写为 `ctx.user`、`ctx.initResource()` / `ctx.makeResource()`，只有自定义端点才保留 `ctx.request()`。
- 对“关联标题列点击弹窗”这类原生列表达场景，不要默认把 JS model 当第一解；先回到 [../patterns/clickable-relation-column.md](../patterns/clickable-relation-column.md)。

## 推荐阅读顺序

1. 先读 [runjs-overview.md](runjs-overview.md)
2. 如果当前模型需要渲染，再读 [rendering-contract.md](rendering-contract.md)
3. 然后按模型类型继续读：
   - [js-block.md](js-block.md)
   - [js-column.md](js-column.md)
   - [js-field.md](js-field.md)
   - [js-editable-field.md](js-editable-field.md)
   - [js-item.md](js-item.md)
   - [js-action.md](js-action.md)

## 模型速查

| 模型 | 默认用途 | 默认上下文 | 默认写法 |
| --- | --- | --- | --- |
| `JSBlockModel` | 页面区块自定义内容 | `ctx.render` `ctx.user` `ctx.libs` `ctx.initResource()` | `ctx.render(...)` |
| `JSColumnModel` | 表格单元格渲染 | `ctx.record` `ctx.recordIndex` `ctx.collection` `ctx.viewer` | `ctx.render(...)` |
| `JSFieldModel` | 只读字段位置渲染 | `ctx.value` `ctx.record` `ctx.collection` | `ctx.render(...)` |
| `JSEditableFieldModel` | 可编辑字段自定义输入 | `ctx.getValue()` `ctx.setValue()` `ctx.form` `ctx.formValues` | `ctx.render(...)` |
| `JSItemModel` | 表单里无字段绑定的自定义项 | `ctx.formValues` `ctx.record` `ctx.resource` | `ctx.render(...)` |
| `JSActionModel` | 按钮点击逻辑 | `ctx.record` / `ctx.resource` / `ctx.form` | 执行逻辑，不以渲染为主 |

补充：

- `JSBlockModel` 默认没有预绑定 `ctx.resource`；需要数据时先手动 `ctx.initResource(...)`。
- `ctx.element` 在上游源码里仍是兼容上下文，但 skill 默认不接受直接写 `innerHTML`；渲染结果应统一交给 `ctx.render()`。
