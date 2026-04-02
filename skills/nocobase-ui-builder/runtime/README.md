# nb-runjs

独立的 RunJS compat validator / zero-dependency runtime CLI。

特性：

- 不依赖 NocoBase 源码或 `@nocobase/*` 包
- 不依赖 `jsdom`、`acorn`、`react`、`react-dom` 等 npm 运行时
- 支持当前内置的全部 RunJS compat profile 列表
- 只做兼容性验证，不伪装完整前端运行时
- preview 模式主要支持 HTML string，以及结构化值的降级预览
- JSX、React element、DOM node 预览会明确标记为 `unsupported`
- `JSBlock/JSField/JSItem/JSColumn/JSEditableField/FormJSFieldItem` 强制只允许 `ctx.*` 访问 compat 上下文
- 上述 strict render model 必须显式写出 `ctx.render(...)`，不会再对 `return` 值做自动渲染兜底
- 输出分为语法、上下文契约、静态策略、动态运行四层 issue
- 默认网络模式为 `mock`；只允许 HTTP `GET/HEAD`
- `live` 模式下必须显式提供 `allowHosts`，否则会阻断所有网络访问
- runtime 暴露面会按当前 model 的 contract / topLevelAliases 收紧
- 这不是安全沙箱，只用于受信任的 RunJS 代码兼容性验证

常用命令：

```bash
node ./bin/nb-runjs.mjs models
node ./bin/nb-runjs.mjs contexts --model JSBlockModel
node ./bin/nb-runjs.mjs validate --model JSBlockModel --code-file ./fixtures/js-block-code.js
node ./bin/nb-runjs.mjs preview --model JSBlockModel --code-file ./fixtures/js-block-code.js --context-file ./fixtures/js-block-context.json
node ./bin/nb-runjs.mjs validate --model JSBlockModel --code-file ./fixtures/js-block-code.js --network-file ./fixtures/network-mock.json
node ./bin/nb-runjs.mjs batch --input ./fixtures/batch.json
```

可选网络配置：

```json
{
  "mode": "mock",
  "responses": [
    {
      "url": "https://example.com/api/users",
      "body": { "nickname": "Alice" }
    }
  ]
}
```

单次验证可通过 `--network-file` 传入，batch task 则支持 `network` 或 `networkFile`。

验证语义：

- 语法层使用 Node `vm.Script` 做基础语法门禁
- 上下文层对 `ctx.*` / top-level alias 做静态契约检查，并对 strict render model 拒绝 bare compat access
- 策略层静态阻断导航、写请求、动态 side effect
- 运行时层只提供最小 compat surface，用于验证“在约定环境下是否合法”
