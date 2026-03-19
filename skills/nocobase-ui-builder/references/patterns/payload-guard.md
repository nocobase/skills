---
title: payload 守卫
description: 在 flowModels 落库前，用本地脚本阻断高风险 payload。
---

# payload 守卫

## 适用场景

- 任何 `PostFlowmodels_save` / `PostFlowmodels_mutate` 之前
- validation case
- popup/openView
- 关系子表、详情内关系区块、关联字段筛选

## 核心原则

1. Prompt 只负责选模式，不负责兜底结构正确性
2. `dataScope.filter` 一律用 `path`，不允许用 `field`
3. `fieldPath` 一律绑定逻辑字段名，不直接绑定 `foreignKey`
4. popup 树必须完整，不能只落 action 壳
5. `associationName` 不能只凭子表上指向父表的 `belongsTo` 字段名猜，`order` 和 `order_items.order` 这类 child-side 写法都算未验证协议
6. child-side `belongsTo` 过滤不能写成“裸 association + 标量操作符”，例如 `path=order` + `$eq`；必须先查 relation metadata，优先 `<belongsTo.foreignKey>`，否则 `<belongsToField>.<targetKey>`
7. `DetailsBlockModel` 不能只有空 grid 壳
8. 关联字段不能默认直接落成 `DisplayTextFieldModel(fieldPath=<relationField>)`；表格/详情要展示目标标题字段时，优先保留父 collection，并使用完整 dotted path，同时显式补 `associationPathName=<关系前缀>`；也不要拆成“target collection + associationPathName + 简单 fieldPath”
9. `audit-payload` 报 blocker 时默认停止写入
10. 如果上层任务显式要求某个动作能力，例如“某个 collection 必须有记录级编辑对话框”，要把要求作为 `requirements` 传给 guard

## 标准流程

1. 在本地组装 draft payload
2. 如果需要 relation/dataScope condition，先运行：

```bash
node scripts/flow_payload_guard.mjs build-filter \
  --path order_id \
  --operator '$eq' \
  --value-json '"{{ctx.view.inputArgs.filterByTk}}"'
```

如果这是 popup / 详情里的关联子表，不要把这条示例当默认方案；只有在 parent->child relation resource 已被稳定 reference、live tree 或已验证样板证明可用时，才升级成 `resourceSettings.init.associationName + sourceId`。否则允许保留 child-side 的逻辑 relation filter，但仍然不能把子表上的 `belongsTo` 字段名或 `child.belongsToField` 直接当成 `associationName`。同时，child-side 逻辑 filter 的 `path` 也必须来自 relation metadata：优先 `foreignKey`，否则 `<belongsToField>.<targetKey>`；拿不到就保持 blocker，不猜字段名。

3. 提取所需元数据：

```bash
node scripts/flow_payload_guard.mjs extract-required-metadata \
  --payload-json '<draft-payload-json>'
```

4. 用当前会话可见的 collection / fields 工具补齐元数据
5. 写入前审计：

```bash
node scripts/flow_payload_guard.mjs audit-payload \
  --payload-json '<draft-payload-json>' \
  --metadata-json '<normalized-metadata-json>' \
  --mode validation-case \
  --requirements-json '{"requiredActions":[{"kind":"edit-record-popup","collectionName":"order_items"}]}'
```

6. `--mode general` 只用于调试或检查未完成草稿，不替代最终落库前的严格审计

## 默认 blocker

- `REQUIRED_COLLECTION_METADATA_MISSING`
- `FILTER_ITEM_USES_FIELD_NOT_PATH`
- `FILTER_LOGIC_UNSUPPORTED`
- `FILTER_GROUP_MALFORMED`
- `FIELD_PATH_NOT_FOUND`
- `FOREIGN_KEY_USED_AS_FIELD_PATH`
- `BELONGS_TO_FILTER_REQUIRES_SCALAR_PATH`
- `POPUP_ACTION_MISSING_SUBTREE`
- `POPUP_CONTEXT_REFERENCE_WITHOUT_INPUT_ARG`
- `ASSOCIATION_DISPLAY_TARGET_UNRESOLVED`
- `ASSOCIATION_SPLIT_DISPLAY_BINDING_UNSTABLE`
- `DOTTED_ASSOCIATION_DISPLAY_MISSING_ASSOCIATION_PATH`
- `DOTTED_ASSOCIATION_DISPLAY_ASSOCIATION_PATH_MISMATCH`

## 默认 warning

- `HARDCODED_FILTER_BY_TK`
- `EMPTY_POPUP_GRID`
- `EMPTY_DETAILS_BLOCK`
- `RELATION_BLOCK_WITH_EMPTY_FILTER`
- `RELATION_BLOCK_SHOULD_USE_ASSOCIATION_CONTEXT`
- `ASSOCIATION_CONTEXT_REQUIRES_VERIFIED_RESOURCE`
- `ASSOCIATION_FIELD_REQUIRES_EXPLICIT_DISPLAY_MODEL`
- `ASSOCIATION_TARGET_METADATA_MISSING`

默认严格审计使用 `validation-case` 模式；其中 `HARDCODED_FILTER_BY_TK`、`EMPTY_POPUP_GRID`、`RELATION_BLOCK_WITH_EMPTY_FILTER`、`ASSOCIATION_CONTEXT_REQUIRES_VERIFIED_RESOURCE`、`BELONGS_TO_FILTER_REQUIRES_SCALAR_PATH`、`EMPTY_DETAILS_BLOCK`、`ASSOCIATION_FIELD_REQUIRES_EXPLICIT_DISPLAY_MODEL`、`ASSOCIATION_SPLIT_DISPLAY_BINDING_UNSTABLE`、`DOTTED_ASSOCIATION_DISPLAY_MISSING_ASSOCIATION_PATH`、`DOTTED_ASSOCIATION_DISPLAY_ASSOCIATION_PATH_MISMATCH` 都会保持为 blocker。`RELATION_BLOCK_SHOULD_USE_ASSOCIATION_CONTEXT` 只在 parent->child resource 已验证时保留为优化 warning，不作为写前 gate。

## risk-accept

只有确实要保留风险时，才允许写结构化 note：

```bash
node scripts/tool_journal.mjs note \
  --log-path "<logPath>" \
  --message "risk-accept for EMPTY_POPUP_GRID" \
  --data-json '{"type":"risk_accept","codes":["EMPTY_POPUP_GRID"],"reason":"temporary shell allowed during migration"}'
```

要求：

- 逐条写 `codes`
- 不能用一条 note 豁免所有 blocker
- note 之后要重新运行一次 `audit-payload`
- 重新审计时要显式把允许保留的 code 传给 `--risk-accept`
- 如果同一个 draft 里同一个 code 命中多个位置，当前 `--risk-accept <CODE>` 不会做模糊降级；先拆小 payload 或先修结构
- `ASSOCIATION_CONTEXT_REQUIRES_VERIFIED_RESOURCE`、`ASSOCIATION_FIELD_REQUIRES_EXPLICIT_DISPLAY_MODEL`、`ASSOCIATION_SPLIT_DISPLAY_BINDING_UNSTABLE`、`DOTTED_ASSOCIATION_DISPLAY_MISSING_ASSOCIATION_PATH`、`DOTTED_ASSOCIATION_DISPLAY_ASSOCIATION_PATH_MISMATCH`、`BELONGS_TO_FILTER_REQUIRES_SCALAR_PATH`、`EMPTY_DETAILS_BLOCK` 不允许通过 `risk_accept` 降级；即使显式传入 `codes`，它们也必须继续保留为 blocker

## 常见误区

- 看过文档就直接写 payload，不跑 guard
- 以为 `field` 和 `path` 只是命名差异
- 明明只知道子表上的 `belongsTo` 字段名，却直接把它写成 `associationName`
- 明明是 child-side `belongsTo` 过滤，却把裸关联字段名直接拿去配 `$eq` / `$ne` 这类标量操作符
- 明明还在父表上取值，却把字段绑定拆成 `target collection + associationPathName + simple fieldPath`
- 明明 `fieldPath` 已经是正确的 dotted path，却漏了 `associationPathName`
- 详情块里只有 `DetailsGridModel`，却把它当成“客户详情已完成”
- 把关联字段直接交给 `DisplayTextFieldModel(fieldPath=<relationField>)`，却没有明确标题字段策略
- 明明 target collection 没有 title field，还继续生成关联显示字段
- popup 只有 page/tab/grid 壳，却把它当成“已完成”

## 关联文档

- [relation-context.md](relation-context.md)
- [popup-openview.md](popup-openview.md)
- [../blocks/filter-form.md](../blocks/filter-form.md)
