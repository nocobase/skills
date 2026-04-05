# nb-runjs

独立的 RunJS compat validator / zero-dependency runtime CLI。

> 下列命令假设当前 cwd 已经在 `skills/nocobase-ui-builder/runtime` 目录内。  
> 如果你在仓库根目录执行，请改看 `../references/runjs-runtime.md` 里的 canonical skill 入口。

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

如果是从 skill 正常执行链路调用，请使用 repo-root 命令并追加 `--skill-mode`；`--skill-mode` 下不允许 live network，且网络读取只允许 `ctx.request(...)` / `ctx.api.request(...)`。

验证语义：

- JSX 会在执行前做 compat lowering；是否能形成可视预览，取决于最终 `ctx.render(...)` 的值与当前 preview capabilities
- 语法层使用 Node `vm.Script` 做基础语法门禁
- 上下文层对 `ctx.*` / top-level alias 做静态契约检查，并对 strict render model 拒绝 bare compat access
- 策略层静态阻断导航、写请求、`fetch`、动态代码生成等 side effect
- 运行时层只提供最小 compat surface，用于验证“在约定环境下是否合法”
