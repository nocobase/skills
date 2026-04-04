# nb-runjs

独立的 RunJS compat validator / zero-dependency runtime CLI。

常用命令：

```bash
node ./bin/nb-runjs.mjs models
node ./bin/nb-runjs.mjs contexts --model JSBlockModel
node ./bin/nb-runjs.mjs validate --model JSBlockModel --code-file ./fixtures/js-block-code.js
node ./bin/nb-runjs.mjs preview --model JSBlockModel --code-file ./fixtures/js-block-code.js --context-file ./fixtures/js-block-context.json
node ./bin/nb-runjs.mjs validate --model JSBlockModel --code-file ./fixtures/js-block-code.js --network-file ./fixtures/network-mock.json
node ./bin/nb-runjs.mjs preview --model ChartOptionModel --stdin-json
node ./bin/nb-runjs.mjs validate --model ChartEventsModel --stdin-json
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

- JSX 会在执行前做 compat lowering；是否能形成可视预览，取决于最终 `ctx.render(...)` 的值与当前 preview capabilities
- 语法层使用 Node `vm.Script` 做基础语法门禁
- 上下文层对 `ctx.*` / top-level alias 做静态契约检查，并对 strict render model 拒绝 bare compat access
- 策略层静态阻断导航、写请求、动态 side effect
- 运行时层只提供最小 compat surface，用于验证“在约定环境下是否合法”
