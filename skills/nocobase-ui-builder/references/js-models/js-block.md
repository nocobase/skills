---
title: JSBlockModel 参考
description: 面向 builder 的 JSBlockModel Workspace 默认路径、单文件公开 authoring 形状与 RunJS 安全约束。
---

# JSBlockModel

## 目录

1. 使用场景与路径分类
2. 新完整 JS Block Workspace 路径
3. 旧/兼容/嵌入式单文件公开形状
4. 两条路径共同的运行时安全
5. scaffold、数据读取与反例

## 什么时候用

当页面需要普通区块无法表达的独立自定义展示区块时使用，例如横幅、统计卡、KPI 面板、说明面板或第三方可视化容器。

先分类，不能混用两条路径：

- `complete-workspace`：新完整 JS Block，或已经物化为 Workspace 的 owner。默认路径。
- `embedded/single-surface` 或 `compatibility-single-file`：旧/兼容/嵌入式单文件 JSBlock，或 capability gate 明确选择的兼容路径。

## 新完整 JS Block：Workspace 默认路径

新完整 JS Block 先通过 `flow-surfaces` 创建或定位 Host，再设置 `sourceMode: "inline"`，用 canonical locator 调用 `run-js-sources`：

1. `runJSSources:open` 打开完整 Workspace snapshot。
2. 先从 `src/client/entry.json` 完成 Settings Pass，再写实现代码；声明的设置必须由 `ctx.settings` 消费。
3. safe snippet 只作为安全 scaffold。可按需要拆分 `components`、`hooks`、`services`、`utils` 和其他合理本地文件，不受单 snippet 或 editable slots 限制。
4. `compilePreview` 完整 snapshot，修复全部 diagnostics。
5. 使用同一 snapshot 和 open 返回的 `baseCommitId`、`baseOwnerFingerprint` 保存。

最终 Workspace 源码必须留在源码文件中，不能塞回 `settings.code` 或 `assets.scripts`。Host 创建若必须提供 bootstrap code，只使用最小安全 scaffold；它不是最终源码通道。编译或保存失败时修复 Workspace，不得降级为单文件。

## 旧/兼容/嵌入式单文件：公开形状

以下形状只用于单文件 owner 或 Host bootstrap。不要把 readback / persisted 里的 `stepParams`、`props`、`decoratorProps`、`flowRegistry` 反写进请求。

新建或 bootstrap 的 inline form：

```json
{
  "type": "jsBlock",
  "settings": {
    "title": "KPI Cards",
    "version": "v2",
    "code": "const { Card } = ctx.libs.antd;\nctx.render(<Card title={ctx.t('Summary')} />);"
  }
}
```

Whole-page `applyBlueprint` 的 asset reference form：

```json
{
  "assets": {
    "scripts": {
      "kpiCards": {
        "version": "v2",
        "code": "ctx.render(<div>{ctx.t('Summary')}</div>);"
      }
    }
  },
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        {
          "type": "jsBlock",
          "script": "kpiCards",
          "settings": { "title": "KPI Cards" }
        }
      ]
    }
  ]
}
```

配置已有单文件 JSBlock：

```json
{
  "target": "<js-block-uid>",
  "changes": {
    "version": "v2",
    "code": "const { Card } = ctx.libs.antd;\nctx.render(<Card />);"
  }
}
```

单文件公开形状约束：

- Inline `code` 写在 `settings.code`，`version` 写在 `settings.version`。
- Whole-page script reuse 写在 `assets.scripts.<key>.code`，block 只写 `script: "<key>"`。
- `script` 只用于 `applyBlueprint` asset reference；localized `compose` / `add-block` 使用 `settings.code`。
- 配置已有单文件 JSBlock 时使用 `changes.code` / `changes.version`，不要写 `changes.settings.code`。
- 禁止 top-level `code` / `version`，禁止手写 internal `stepParams`，禁止混用 `script` 与 `settings.code`。
- 嵌入式/兼容路径执行 [../runjs-authoring-loop.md](../runjs-authoring-loop.md)：surface lock、scenario card、一个 safe snippet、只改 slots、`flow-surfaces` `errors[]` repair。

## 两条路径共同的运行时安全

Workspace 与单文件只在源码组织和写回通道上不同；以下约束完全相同：

- `JSBlockModel` 是 strict render model，必须显式调用 `ctx.render(...)`，不能依赖隐式 `return`。
- 只能通过 `ctx.*` 访问上下文；不要使用 bare `record`、`formValues`、`resource`、`collection` 或 `value`。
- 默认使用 `ctx.libs.antd` / `ctx.libs.antdIcons` 组合 React JSX，不以 `innerHTML`、裸 HTML 字符串或一次性 DOM 操作为默认方案。
- JSBlock 默认没有预绑定 `ctx.resource`；读取 collection 时先 `ctx.initResource(...)`，或使用 `ctx.makeResource(...)`。
- 当前登录用户优先使用 `ctx.user` 或 `ctx.auth?.user`；不要默认请求 `auth:check`。
- 自定义端点或 request-only HTTP 才使用 `ctx.request()`；不要默认使用 `fetch`、`localStorage` 或任意 `window.*`。
- effect style 必须保持 `render`；不能改成 value-return 或 action-style 逃避 `ctx.render(...)`。
- popup / drawer / drilldown 必须先解析 persisted popup-capable FlowModel。`ctx.openView(triggerUid, ...)` 只能指向该 trigger，不能指向 `ChildPageModel`、page、tab、popup subtree 或 transient uid。

## 安全 scaffold

```jsx
const { Card, Typography } = ctx.libs.antd;

ctx.render(
  <Card title={ctx.t('Summary')}>
    <Typography.Text>{ctx.t('Content')}</Typography.Text>
  </Card>,
);
```

## 读取数据

显示当前用户时直接读安全 ctx root：

```jsx
const { Card, Typography } = ctx.libs.antd;
const currentUser = ctx.user ?? ctx.auth?.user ?? null;

ctx.render(
  <Card size="small">
    <Typography.Text>
      {currentUser ? (currentUser.nickname ?? currentUser.username ?? `#${currentUser.id}`) : ctx.t('Anonymous')}
    </Typography.Text>
  </Card>,
);
```

读取 collection 列表或统计时使用 resource API：

```jsx
const { Card, Statistic } = ctx.libs.antd;
const resource = ctx.makeResource('MultiRecordResource');
resource.setResourceName('tasks');
resource.setPageSize?.(1);
resource.setFilter?.({ status: { $eq: 'active' } });
await resource.refresh();

ctx.render(
  <Card size="small">
    <Statistic title={ctx.t('Active tasks')} value={resource.getCount?.() ?? 0} />
  </Card>,
);
```

block payload 的 `dataScope.filter` 使用 `{ logic, items }`；RunJS 的 `resource.setFilter()` 使用服务端 query object。

## 不要默认这么写

```js
ctx.element.innerHTML = '<div>...</div>';
await ctx.request({ url: 'tasks:list', method: 'get' });
await fetch('/api/auth:check', { credentials: 'include' });
```

作者应显式改成 `ctx.render(...)` 与 resource API，不依赖本地自动改写。

## 何时再看别的文档

- Workspace lifecycle：[../runjs-workspace-source.md](../runjs-workspace-source.md)
- 加载外部库：[runjs-overview.md](runjs-overview.md)
- strict render 细节：[rendering-contract.md](rendering-contract.md)
