# JS

本文档是 RunJS validator gate、JS model mapping、上下文语义与代码风格的唯一 owner。只要本次写入涉及 JS `code`、`renderer: "js"`、`jsBlock`、`jsColumn`、`jsItem` 或 `js` action，默认先看这里。能力位置限制看 [capabilities.md](./capabilities.md)，family / locator / target 看 [runtime-playbook.md](./runtime-playbook.md)。

## 公开 JS 能力

- `jsBlock`
- `js` action
- 绑定字段的 `renderer: "js"`
- standalone JS 字段：`jsColumn` / `jsItem`

## RunJS Validator Gate

只要本次写入涉及 JS `code`，就必须先运行本地 validator，再决定是否调用 MCP 写入。

- render 类模型统一走 `preview`
- action 类模型统一走 `validate`
- validator 失败就是失败，不能降级成 warning，也不能继续写入
- 运行时校验只允许依赖 `./runtime/bin/nb-runjs.mjs`，不允许在执行阶段读取 NocoBase 源码

标准命令：

```bash
node ./skills/nocobase-ui-builder/runtime/bin/nb-runjs.mjs <validate|preview> --stdin-json
```

stdin JSON 形状：

```json
{
  "model": "JSColumnModel",
  "code": "ctx.render(String(ctx.record?.nickname || ''));",
  "context": {},
  "network": {},
  "version": "1",
  "timeoutMs": 1000,
  "filename": "inline-js-column.js"
}
```

失败处理：根据 validator 返回的问题自动重写 code，并重新校验；最多 3 轮，3 轮后仍失败就停止，不要继续 MCP 写入。

## Skill 到 Runtime 的映射

| UI 能力 | 典型位置 | runtime model | mode | 说明 |
| --- | --- | --- | --- | --- |
| `jsBlock` | page / tab / popup block 区 | `JSBlockModel` | `preview` | block 级渲染 |
| `jsColumn` | `table` | `JSColumnModel` | `preview` | standalone table column |
| `jsItem` | `form/createForm/editForm` | `JSItemModel` | `preview` | standalone form item |
| `renderer: "js"` | `table/details/list/gridCard` | `JSFieldModel` | `preview` | 绑定真实字段的展示态 JS renderer |
| `renderer: "js"` | `form/createForm/editForm` | `JSEditableFieldModel` | `preview` | 绑定真实字段的可编辑 JS renderer |
| inline form JS field item | form field item 内联 JS 配置 | `FormJSFieldItemModel` | `preview` | 仅在现场能力明确是 inline item 级 JS 时使用 |
| block-level `js` action | `table/list/gridCard` 等 block action | `JSCollectionActionModel` | `validate` | 面向整块数据集 |
| record-level `js` action | `table/details/list/gridCard` | `JSRecordActionModel` | `validate` | 面向当前记录 |
| form `js` action | `form/createForm/editForm` | `JSFormActionModel` | `validate` | 面向表单上下文 |
| filter-form `js` action | `filterForm` | `FilterFormJSActionModel` | `validate` | 面向筛选表单 |
| action-panel / generic `js` action | `actionPanel` 或泛用动作容器 | `JSActionModel` | `validate` | 没有更具体 action context 时的兜底 |
| item action with explicit form+record context | 少数 item 级 action 容器 | `JSItemActionModel` | `validate` | 只有现场明确同时具备 `record + formValues + form` 时才使用 |

如果现场能力无法确定是哪一种 JS action，就先停下来，优先读 `catalog` / `get` 收敛容器和上下文，再选 model；不要拍脑袋猜。

## 容器支持矩阵

| 能力 | 可用位置 | 关键约束 |
| --- | --- | --- |
| `jsBlock` | page/tab/popup 的 block 区 | 用户明确要求运行时代码时再优先 |
| `js` action | `block` / `record` / `form` / `filterForm` / `actionPanel` | 先选对 action scope |
| `renderer: "js"` | `table/details/list/gridCard/form/createForm/editForm` | 仍然绑定真实字段 |
| `jsColumn` | `table` | standalone field，不绑定真实 `fieldPath` |
| `jsItem` | `form/createForm/editForm` | standalone field，不绑定真实 `fieldPath` |

## 代码风格与上下文

- 默认输出可读的多行 JS，统一使用 2 空格缩进。
- 复杂模板字符串、条件分支、拼接逻辑先拆成局部变量，再传给 `ctx.render(...)`。
- 先使用 runtime profile 的 `defaultContextShape`；如果 live MCP 已知更精确的 `resource` / `collection` / `collectionField` / `record` / `formValues` / `namePath`，再用 live 数据覆盖默认值。
- `network` 默认不传；只有 code 确实依赖读请求且你能提供 mock response 时才传。

## Strict Render 规则

以下模型都属于 strict render model：`JSBlockModel`、`JSFieldModel`、`JSEditableFieldModel`、`JSItemModel`、`FormJSFieldItemModel`、`JSColumnModel`。

这些模型统一遵守：

- 必须使用 `ctx.*` 访问上下文
- 裸 `record` / `formValues` / `resource` / `collection` / `collectionField` / `value` / `namePath` 都算失败
- 必须显式调用 `ctx.render(...)`
- 不能依赖 `return` 自动渲染
- 如果 validator 报 `bare-compat-access`、`missing-required-ctx-render` 等问题，必须直接修 code，不要绕过

## 执行提醒

- JS 相关配置优先走 `configure`。
- `renderer: "js"` 不是 standalone field type；`jsColumn` / `jsItem` 才是 standalone field type。
- `filterForm` 不支持 `renderer: "js"`、`jsColumn`、`jsItem`；涉及 JS 时请改 block 或 action 设计。
- 任何 JS 写入都必须先通过 RunJS validator gate，再进入 MCP 写流程。
