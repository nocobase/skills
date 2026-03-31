# `mutate`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_mutate`

## 用途

按顺序执行一组底层 op，并通过 `opId` / `$ref` 传递前一步结果。

## 规则

- v1 只支持 `atomic=true`。
- 不应当作为默认入口。

## 适合场景

- 多步复杂重构
- 一次事务内创建并引用多个节点
- `apply` 不够直观时的底层编排
