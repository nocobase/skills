# Orchestration

这组工具用于高风险复杂改造：

- `apply` -> `mcp__nocobase__flow_surfaces_apply`
- `mutate` -> `mcp__nocobase__flow_surfaces_mutate`

## 何时用

- 需要整段 subtree 替换
- 需要跨多步原子化编排
- 需要显式使用 `$ref` 串接多步结果

## 默认策略

- 能用 `compose` / `configure` 解决时，不用 `apply` / `mutate`
- `apply` 默认只做受控 subtree 替换
- `mutate` 默认显式传 `target.uid`，除非整段 `ops` 已经完全内部自洽

## 关键 gotchas

- `apply` 只接受 `catalog` 或主链文档已公开、且有稳定 contract 的 `type/use`；不接受未公开 model use 或任意 raw patch
- same-use sibling 只有在能确定性配对时才继续；否则先收敛目标
- `mutate` 是编排工具，不是默认 patch 工具

基础 shape 统一看 [../runtime-truth/tool-shapes.md](../runtime-truth/tool-shapes.md)。
