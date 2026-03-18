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
5. `audit-payload` 报 blocker 时默认停止写入

## 标准流程

1. 在本地组装 draft payload
2. 如果需要 relation/dataScope condition，先运行：

```bash
node scripts/flow_payload_guard.mjs build-filter \
  --path order_id \
  --operator '$eq' \
  --value-json '"{{ctx.view.inputArgs.filterByTk}}"'
```

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
  --mode general
```

6. validation case 把 `--mode` 换成 `validation-case`

## 默认 blocker

- `FILTER_ITEM_USES_FIELD_NOT_PATH`
- `FILTER_GROUP_MALFORMED`
- `FIELD_PATH_NOT_FOUND`
- `FOREIGN_KEY_USED_AS_FIELD_PATH`
- `POPUP_ACTION_MISSING_SUBTREE`
- `POPUP_CONTEXT_REFERENCE_WITHOUT_INPUT_ARG`
- `ASSOCIATION_DISPLAY_TARGET_UNRESOLVED`

## 默认 warning

- `HARDCODED_FILTER_BY_TK`
- `EMPTY_POPUP_GRID`
- `RELATION_BLOCK_WITH_EMPTY_FILTER`
- `ASSOCIATION_TARGET_METADATA_MISSING`

其中 `validation-case` 模式会把 `HARDCODED_FILTER_BY_TK`、`EMPTY_POPUP_GRID`、`RELATION_BLOCK_WITH_EMPTY_FILTER` 升级成 blocker。

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

## 常见误区

- 看过文档就直接写 payload，不跑 guard
- 以为 `field` 和 `path` 只是命名差异
- 明明 target collection 没有 title field，还继续生成关联显示字段
- popup 只有 page/tab/grid 壳，却把它当成“已完成”

## 关联文档

- [relation-context.md](relation-context.md)
- [popup-openview.md](popup-openview.md)
- [../blocks/filter-form.md](../blocks/filter-form.md)
