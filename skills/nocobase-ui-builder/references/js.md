# JS

当本次写入涉及 JS `code`、`renderer: "js"`、`jsBlock`、`jsColumn`、`jsItem`、`js` action，或 chart 的 `visual.raw / events.raw` 时，读本文。能力位置限制看 [capabilities.md](./capabilities.md)，family / locator / target 看 [runtime-playbook.md](./runtime-playbook.md)，chart 专题入口看 [chart.md](./chart.md)，CLI 用法、Node 版本、repo-root 命令入口与 `--skill-mode` 再看 [runjs-runtime.md](./runjs-runtime.md)。

## 目录

1. 公开 JS 能力
2. RunJS Validator Gate
3. Skill 到 Runtime 的映射
4. 容器支持矩阵
5. 代码风格与上下文
6. Strict Render 规则
7. 执行提醒

## 公开 JS 能力

- `jsBlock`
- `js` action
- 绑定字段的 `renderer: "js"`
- standalone JS 字段：`jsColumn` / `jsItem`
- chart custom option：`visual.raw`
- chart events：`events.raw`

## RunJS Validator Gate

只要本次写入涉及 JS `code`，就必须先运行本地 validator，再决定是否调用 MCP 写入。

- 这个 validator 的目标是**确定性的本地 contract 预验证**，不是安全沙箱承诺。
- 当前目标是 **public docs parity**：保证上游公开文档、默认模板与本 skill 默认生成的代码能被稳定校验；**不是**完整浏览器 / React runtime 仿真。
- public runtime mode 固定为 `validate`
- validator 失败就是失败，不能降级成 warning，也不能继续写入
- 如果 validator 不可运行、Node 版本不满足或结果不可判定，也必须直接停止，不允许跳过 gate 继续写入
- 运行时校验只允许依赖 `./runtime/bin/nb-runjs.mjs`，不允许在执行阶段读取 NocoBase 源码

标准命令：

```bash
node ./skills/nocobase-ui-builder/runtime/bin/nb-runjs.mjs validate --stdin-json --skill-mode
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

`--skill-mode` 是本 skill 的 canonical 执行方式：

- 假设当前 cwd 是仓库根目录
- 要求 Node `>=18`
- 网络读取只允许 `ctx.request(...)` / `ctx.api.request(...)`；不要使用 `fetch` / `ctx.fetch`
- 默认不允许 live network；`network` 要么不传，要么只传 `mode = "mock"`
- `mode = "mock"` 下如果没有显式命中 `responses`，runtime 会返回默认 auto-mock `200 + {}`，并记录 warning，而不是让校验失败
- 如果 payload 明确传了 `network.mode = "live"`，validator 会直接阻断，而不是退回到不稳定的外部依赖

## Skill 到 Runtime 的映射

| UI 能力 | 典型位置 | runtime model | mode | 说明 |
| --- | --- | --- | --- | --- |
| `jsBlock` | page / tab / popup block 区 | `JSBlockModel` | `validate` | block 级渲染 contract 检查 |
| `jsColumn` | `table` | `JSColumnModel` | `validate` | standalone table column |
| `jsItem` | `form/createForm/editForm` | `JSItemModel` | `validate` | standalone form item |
| `renderer: "js"` | `table/details/list/gridCard` | `JSFieldModel` | `validate` | 绑定真实字段的展示态 JS renderer |
| `renderer: "js"` | `form/createForm/editForm` | `JSEditableFieldModel` | `validate` | 绑定真实字段的可编辑 JS renderer |
| inline form JS field item | form field item 内联 JS 配置 | `FormJSFieldItemModel` | `validate` | 仅在现场能力明确是 inline item 级 JS 时使用 |
| block-level `js` action | `table/list/gridCard` 等 block action | `JSCollectionActionModel` | `validate` | 面向整块数据集 |
| record-level `js` action | `table/details/list/gridCard` | `JSRecordActionModel` | `validate` | 面向当前记录 |
| form `js` action | `form/createForm/editForm` | `JSFormActionModel` | `validate` | 面向表单上下文 |
| filter-form `js` action | `filterForm` | `FilterFormJSActionModel` | `validate` | 面向筛选表单 |
| action-panel / generic `js` action | `actionPanel` 或泛用动作容器 | `JSActionModel` | `validate` | 没有更具体 action context 时的兜底 |
| item action with explicit form+record context | 少数 item 级 action 容器 | `JSItemActionModel` | `validate` | 只有现场明确同时具备 `record + formValues + form` 时才使用 |
| chart `visual.raw` | chart block 自定义 option | `ChartOptionModel` | `validate` | 直接 `return` ECharts option object |
| chart `events.raw` | chart block 事件脚本 | `ChartEventsModel` | `validate` | 注册图表事件；`ctx.openView(...)` 在 runtime 中只做 simulated call |

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
- validator 已补最小公开 ctx：`ctx.runjs(...)`、`ctx.initResource(...)`、`ctx.libs.React/ReactDOM/antd/antdIcons`，以及 `ctx.React/ctx.ReactDOM/ctx.antd/ctx.antdIcons` alias；可用于公开文档与默认模板校验。
- `network` 默认不传；只有 code 确实依赖读请求且你想覆盖默认 auto-mock 返回值时，才传显式 mock response。
- 需要读请求时，只使用 `ctx.request(...)` 或 `ctx.api.request(...)`；不要写 `fetch(...)`、`window.fetch(...)`、`ctx.fetch(...)`。
- 在本 skill 的 canonical 执行方式里，`network.mode = "live"` 一律视为不允许；live mode 只保留给 runtime 开发或脱离本 skill 的本地调试。
- 如果 JSBlock 示例需要主动取数，优先写 `ctx.initResource(...)` + `ctx.resource`；validator 只做最小模拟，不保证与上游运行态的资源生命周期完全一致。

## Strict Render 规则

以下模型都属于 strict render model：`JSBlockModel`、`JSFieldModel`、`JSEditableFieldModel`、`JSItemModel`、`FormJSFieldItemModel`、`JSColumnModel`。

这些模型统一遵守：

- 必须使用 `ctx.*` 访问上下文
- 裸 `record` / `formValues` / `resource` / `collection` / `collectionField` / `value` / `namePath` 都算失败
- 必须显式调用 `ctx.render(...)`
- 不能依赖 `return` 自动渲染
- 即使这些模型对外统一走 `validate`，也仍然按 render contract 做校验；不会返回 public preview payload
- 如果 validator 报 `bare-compat-access`、`missing-required-ctx-render` 等问题，必须直接修 code，不要绕过

`ChartOptionModel` / `ChartEventsModel` **不属于** strict render model：

- 不要求 `ctx.render(...)`
- `ChartOptionModel` 应直接 `return option`
- `ChartEventsModel` 主要执行裸 `chart.on(...)` / `chart.off(...)`；不要写成 `ctx.chart.on(...)`

## 执行提醒

- JS 相关配置优先走 `configure`。
- `renderer: "js"` 不是 standalone field type；`jsColumn` / `jsItem` 才是 standalone field type。
- `jsColumn` / `jsItem` 这类 standalone JS field 创建时允许不传真实 `fieldPath`；绑定真实字段的 `renderer: "js"` 才需要 `fieldPath`。
- `filterForm` 不支持 `renderer: "js"`、`jsColumn`、`jsItem`；涉及 JS 时请改 block 或 action 设计。
- 任何 JS 写入都必须先通过 RunJS validator gate，再进入 MCP 写流程。
