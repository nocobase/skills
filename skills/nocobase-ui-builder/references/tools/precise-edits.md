# Precise Edits

这组工具只在公开语义不够时使用：

- `addBlock` / `addBlocks`
- `addField` / `addFields`
- `addAction` / `addActions`
- `addRecordAction` / `addRecordActions`
- `updateSettings`
- `setEventFlows`
- `setLayout`
- `moveNode`
- `removeNode`

对应 MCP tools：

- `mcp__nocobase__flow_surfaces_add_block`
- `mcp__nocobase__flow_surfaces_add_blocks`
- `mcp__nocobase__flow_surfaces_add_field`
- `mcp__nocobase__flow_surfaces_add_fields`
- `mcp__nocobase__flow_surfaces_add_action`
- `mcp__nocobase__flow_surfaces_add_actions`
- `mcp__nocobase__flow_surfaces_add_record_action`
- `mcp__nocobase__flow_surfaces_add_record_actions`
- `mcp__nocobase__flow_surfaces_update_settings`
- `mcp__nocobase__flow_surfaces_set_event_flows`
- `mcp__nocobase__flow_surfaces_set_layout`
- `mcp__nocobase__flow_surfaces_move_node`
- `mcp__nocobase__flow_surfaces_remove_node`

## 何时用

- 需要精确追加单个 block / field / action
- 需要区分 block action 与 record action
- 需要 path-level contract 写入
- 需要完整 layout 重排或节点级移动 / 删除
- 需要标准事件流或布局写入

## 关键 gotchas

- `addAction` 只放非 `recordActions`
- `addRecordAction` 只放记录级动作；`details` 也算 `recordActions`
- `updateSettings` 前先确认 `configureOptions` 不覆盖需求，再看 `catalog.settingsContract`
- `setEventFlows` 前先确认相关 popup / openView / step 已落盘
- `setEventFlows` / `setLayout` 属于标准精确编辑能力，不是最后兜底
- `setLayout` 是全量写入，不是增量 patch
- `moveNode` 用 `sourceUid` / `targetUid`；`removeNode` 仍然是 target-based

## 批量工具策略

- 只有当同一 target 下多项追加彼此独立、可接受部分成功、且愿意写后完整读回时，才优先用批量接口
- 如果批量工具未暴露，可按同一 target 退化到顺序单项调用，但保留相同顺序和读回校验
- 如果需要原子性，优先考虑 `mutate`

基础 shape 统一看 [../runtime-truth/tool-shapes.md](../runtime-truth/tool-shapes.md)。
