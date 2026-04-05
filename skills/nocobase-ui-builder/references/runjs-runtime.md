# RunJS runtime

当你需要运行本地 RunJS validator CLI 时，读本文。JS model 选型与代码规则看 [js.md](./js.md)。

## 目录

1. repo-root 的 canonical 入口
2. runtime 目录内的开发入口
3. 网络模式约束

## repo-root 的 canonical 入口

以下命令假设当前 cwd 是**本仓库根目录**，并且 Node 版本满足 `>=18`。

```bash
node ./skills/nocobase-ui-builder/runtime/bin/nb-runjs.mjs validate --stdin-json --skill-mode
node ./skills/nocobase-ui-builder/runtime/bin/nb-runjs.mjs batch --input ./skills/nocobase-ui-builder/runtime/fixtures/batch.json --skill-mode
```

本 skill 的 canonical 执行方式统一带 `--skill-mode`：

- 这是给 skill 正常执行准备的保守模式
- public runtime mode 固定为 `validate`
- 只允许 absent/mock network
- 网络读取只允许 `ctx.request(...)` / `ctx.api.request(...)`；`fetch` 不属于公开 contract
- `mode = "mock"` 下未命中显式 mock 时，会返回默认 auto-mock `200 + {}`
- 遇到 `network.mode = "live"` 会直接阻断

## runtime 目录内的开发入口

如果当前 cwd 已经在 `skills/nocobase-ui-builder/runtime` 目录下，可使用更短的开发命令：

```bash
node ./bin/nb-runjs.mjs validate --model JSBlockModel --code-file ./fixtures/js-block-code.js
node ./bin/nb-runjs.mjs validate --model JSBlockModel --code-file ./fixtures/js-block-code.js --context-file ./fixtures/js-block-context.json
node ./bin/nb-runjs.mjs validate --model JSBlockModel --code-file ./fixtures/js-block-code.js --network-file ./fixtures/network-mock.json
node ./bin/nb-runjs.mjs batch --input ./fixtures/batch.json
```

这组命令主要用于 runtime 本地开发或调试；skill 正常执行仍优先使用上面的 repo-root canonical 入口。

## 网络模式约束

- `network` 默认不传
- 需要读请求时，优先 `mode = "mock"`，并统一通过 `ctx.request(...)` / `ctx.api.request(...)`
- `--skill-mode` 下不允许 `mode = "live"`
- 如果确实要调试 live network，请明确脱离本 skill 的 canonical 执行链路
