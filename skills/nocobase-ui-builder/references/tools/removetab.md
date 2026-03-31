# `removetab`

对应 tool：

- `mcp__nocobase__PostFlowsurfaces_removetab`

## 用途

删除 tab route 与对应 flow subtree。

## 规则

- 删除前先 `get(pageSchemaUid)` 确认目标 tab。
- 删完后重新 `get(pageSchemaUid)`，确认 tabs 顺序和 route 树正确。
