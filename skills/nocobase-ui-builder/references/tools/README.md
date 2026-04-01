# Tools

按职责选 tool，不按“我记得某个底层接口可能能干这事”来选。基础规则统一看 runtime-truth，不在这里重复定义。
如果 UI 搭建需要额外上下文，可以配合其他 NocoBase MCP tools 先取数据模型、资源或现场状态；但 UI surface 的结构写入仍以本目录与 runtime-truth 为准。

## 目录

- [read-and-discovery.md](./read-and-discovery.md)
- [page-and-tab-lifecycle.md](./page-and-tab-lifecycle.md)
- [semantic-building.md](./semantic-building.md)
- [precise-edits.md](./precise-edits.md)
- [orchestration.md](./orchestration.md)

## 基础规则入口

- 默认流程统一看 [../runtime-truth/overview.md](../runtime-truth/overview.md)
- 请求形状统一看 [../runtime-truth/tool-shapes.md](../runtime-truth/tool-shapes.md)
