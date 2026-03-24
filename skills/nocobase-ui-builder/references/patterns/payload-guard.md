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

## 默认入口

最终写入默认不要直接跑本页命令拼流程。对 ad-hoc `save` / `mutate` / `ensure`，统一走：

```bash
node scripts/ui_write_wrapper.mjs run --action save ...
```

`preflight_write_gate.mjs` 与 `flow_write_wrapper.mjs` 现在是 wrapper 内部/兼容入口：

- 需要只看 canonicalize/audit 结果时可单独运行
- 需要真正落库时，不要停在这里，也不要自己手动接上裸 `PostFlowmodels_save`

## 核心原则

1. Prompt 只负责选模式，不负责兜底结构正确性
2. `dataScope.filter` 一律用 `path`，不允许用 `field`
3. `fieldPath` 一律绑定逻辑字段名，不直接绑定 `foreignKey`
4. popup 树必须完整，不能只落 action 壳
5. `associationName` 不能只凭子表上指向父表的 `belongsTo` 字段名猜，`order` 和 `order_items.order` 这类 child-side 写法都算未验证协议
6. child-side `belongsTo` 过滤不能写成“裸 association + 标量操作符”，例如 `path=order` + `$eq`；必须先查 relation metadata，优先 `<belongsTo.foreignKey>`，否则 `<belongsToField>.<targetKey>`
7. `DetailsBlockModel` 不能只有空 grid 壳
8. 关联字段不能默认直接落成 `DisplayTextFieldModel(fieldPath=<relationField>)`；表格/详情要展示目标标题字段时，优先保留父 collection，并使用完整 dotted path，同时显式补 `associationPathName=<关系前缀>`；也不要拆成“target collection + associationPathName + 简单 fieldPath”
9. 表格里的 dotted 关联标题字段如果还要承担 click-to-open / popup，默认视为高风险组合；优先改成“关系字段列 + title display + openView”，不要让 `customer.name` 这种 dotted path 列自己承担打开行为
10. `JSFieldModel` / `JSColumnModel` 不能作为“关联标题列点击 popup”的默认 workaround；只有用户明确要求 JS 时，才允许通过 `requirements.intentTags=["js.explicit"]` 放行
11. `CreateFormModel` / `EditFormModel` 的提交动作必须放在 `subModels.actions`，不要塞进 `FormGridModel.subModels.items`
12. `FormItemModel` 不能只写 `fieldSettings.init.fieldPath`；还要显式补 `subModels.field`，并选用当前 schema/field binding 暴露的 editable field model
13. 动作槽位必须遵守各自 manifest 的 `allowedUses`：`TableBlockModel.actions` 只能放 collection actions，`TableActionsColumnModel.actions` / `DetailsBlockModel.actions` 只能放 record actions，`FilterFormBlockModel.actions` 只能放 filter-form actions
14. popup/openView 的 `openView.pageModelClass` 与 `subModels.page.use` 必须严格一致；默认优先 `ChildPageModel`，不要停在泛型 `PageModel`
15. popup/openView 只要显式使用 `filterByTk`，目标 collection 就必须声明 `filterTargetKey`；否则 runtime 会在记录动作或弹窗参数解析阶段直接报错
16. `ChildPageModel` 下的显式 popup tab 必须使用 `ChildPageTabModel`，不能回退成 `PageTabModel`
17. 显式 tabs 的 guard 要求通过结构化 `requirements.requiredTabs[*]` 表达；每项至少有 `titles`，可选补 `pageUse`、`pageSignature`，默认 `requireBlockGrid=true`
18. `audit-payload` 报 blocker 时默认停止写入
19. 如果上层任务显式要求某个动作能力，例如“某个 collection 必须有记录级编辑对话框”，要把要求作为 `requirements` 传给 guard
20. template clone 不是豁免路径；从 live tree / 模板页 remap 出来的 payload 也必须走完整 guard 流水线
21. 如果 clone 后出现 `EMPTY_TEMPLATE_TREE`、field 上挂 `subModels.page`、form 里重复 submit、空 form grid、空 filter form grid，必须先修结构或直接换模板，不能带着 blocker 继续写入
22. `FilterFormBlockModel` 只写 `defaultTargetUid` 还不够；同层 `BlockGridModel` 必须持久化 `filterManager`，否则查询按钮没有真实联动目标
23. `FilterFormItemModel.subModels.field.use` 不能拍脑袋猜；必须按字段 metadata 推导。`select/date/datetime/number/percent/time/association` 的筛选字段模型都应和普通文本输入区分开

## 标准流程

1. 在本地组装 draft payload / verify payload
   - 如果 draft 来自模板 clone，先做 remap/cleanup；出现 `EMPTY_TEMPLATE_TREE` 时直接停止
2. 如果需要 relation/dataScope condition，先运行：

```bash
node scripts/flow_payload_guard.mjs build-filter \
  --path order_id \
  --operator '$eq' \
  --value-json '"{{ctx.view.inputArgs.filterByTk}}"'
```

如果需要给 RunJS 的 `ctx.request({ params.filter })` 或 `resource.setFilter()` 生成服务端 query filter，不要复用上面的 `{ logic, items }`；改用：

```bash
node scripts/flow_payload_guard.mjs build-query-filter \
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
5. 先在本地归一化可安全修复的问题：

```bash
node scripts/flow_payload_guard.mjs canonicalize-payload \
  --payload-json '<draft-payload-json>' \
  --metadata-json '<normalized-metadata-json>' \
  --mode validation-case
```

6. 写入前审计：

```bash
node scripts/flow_payload_guard.mjs audit-payload \
  --payload-json '<draft-payload-json>' \
  --metadata-json '<normalized-metadata-json>' \
  --mode validation-case \
  --requirements-json '{"requiredActions":[{"kind":"edit-record-popup","collectionName":"order_items","scope":"row-actions"}],"requiredTabs":[{"pageUse":"RootPageModel","titles":["客户概览","联系人"],"requireBlockGrid":true}]}'
```

如果用户明确要求用 JS 处理“关联标题列点击弹窗”，再显式追加：

```json
{
  "intentTags": ["js.explicit"]
}
```

7. 真正落库时，把上面的 payload/metadata/requirements 交给 `ui_write_wrapper.mjs`；不要手动继续裸写
8. `--mode general` 只用于调试或检查未完成草稿，不替代最终落库前的严格审计
9. clone 路径也必须记录 canonicalize/audit 证据；如果 tool log 里只有“template source loaded”，没有 guard 记录，这轮结果默认不可信

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
- `TABLE_CLICKABLE_ASSOCIATION_TITLE_PATH_UNSTABLE`
- `TABLE_JS_WORKAROUND_REQUIRES_EXPLICIT_INTENT`
- `DOTTED_ASSOCIATION_DISPLAY_MISSING_ASSOCIATION_PATH`
- `DOTTED_ASSOCIATION_DISPLAY_ASSOCIATION_PATH_MISMATCH`
- `FORM_ACTION_MUST_USE_ACTIONS_SLOT`
- `FORM_BLOCK_EMPTY_GRID`
- `FORM_ITEM_FIELD_SUBMODEL_MISSING`
- `FORM_SUBMIT_ACTION_DUPLICATED`
- `FORM_SUBMIT_ACTION_MISSING`
- `FILTER_FORM_EMPTY_GRID`
- `FILTER_FORM_ITEM_FIELD_SUBMODEL_MISSING`
- `FILTER_FORM_ITEM_FILTERFIELD_MISSING`
- `FILTER_FORM_FIELD_MODEL_MISMATCH`
- `FILTER_MANAGER_MISSING`
- `FILTER_MANAGER_TARGET_MISSING`
- `FILTER_MANAGER_FILTER_ITEM_UNBOUND`
- `FILTER_MANAGER_FILTER_PATH_UNRESOLVED`
- `FIELD_MODEL_PAGE_SLOT_UNSUPPORTED`
- `TABLE_COLLECTION_ACTION_SLOT_USE_INVALID`
- `TABLE_RECORD_ACTION_SLOT_USE_INVALID`
- `DETAILS_ACTION_SLOT_USE_INVALID`
- `FILTER_FORM_ACTION_SLOT_USE_INVALID`
- `POPUP_PAGE_USE_INVALID`
- `POPUP_PAGE_USE_MISMATCH`
- `TAB_SLOT_USE_INVALID`
- `TAB_GRID_MISSING_OR_INVALID`
- `TAB_GRID_ITEM_USE_INVALID`
- `TAB_SUBTREE_UID_REUSED`
- `REQUIRED_VISIBLE_TABS_MISSING`
- `REQUIRED_TABS_TARGET_PAGE_MISSING`

## 默认 warning

- `HARDCODED_FILTER_BY_TK`
- `EMPTY_POPUP_GRID`
- `EMPTY_DETAILS_BLOCK`
- `RELATION_BLOCK_WITH_EMPTY_FILTER`
- `RELATION_BLOCK_SHOULD_USE_ASSOCIATION_CONTEXT`
- `ASSOCIATION_CONTEXT_REQUIRES_VERIFIED_RESOURCE`
- `ASSOCIATION_FIELD_REQUIRES_EXPLICIT_DISPLAY_MODEL`
- `ASSOCIATION_TARGET_METADATA_MISSING`

默认严格审计使用 `validation-case` 模式；其中 `HARDCODED_FILTER_BY_TK`、`EMPTY_POPUP_GRID`、`RELATION_BLOCK_WITH_EMPTY_FILTER`、`ASSOCIATION_CONTEXT_REQUIRES_VERIFIED_RESOURCE`、`BELONGS_TO_FILTER_REQUIRES_SCALAR_PATH`、`EMPTY_DETAILS_BLOCK`、`ASSOCIATION_FIELD_REQUIRES_EXPLICIT_DISPLAY_MODEL`、`ASSOCIATION_SPLIT_DISPLAY_BINDING_UNSTABLE`、`TABLE_CLICKABLE_ASSOCIATION_TITLE_PATH_UNSTABLE`、`TABLE_JS_WORKAROUND_REQUIRES_EXPLICIT_INTENT`、`DOTTED_ASSOCIATION_DISPLAY_MISSING_ASSOCIATION_PATH`、`DOTTED_ASSOCIATION_DISPLAY_ASSOCIATION_PATH_MISMATCH`、`FORM_ACTION_MUST_USE_ACTIONS_SLOT`、`FORM_BLOCK_EMPTY_GRID`、`FORM_ITEM_FIELD_SUBMODEL_MISSING`、`FORM_SUBMIT_ACTION_DUPLICATED`、`FORM_SUBMIT_ACTION_MISSING`、`FILTER_FORM_EMPTY_GRID`、`FILTER_FORM_ITEM_FIELD_SUBMODEL_MISSING`、`FILTER_FORM_ITEM_FILTERFIELD_MISSING`、`FILTER_FORM_FIELD_MODEL_MISMATCH`、`FILTER_MANAGER_MISSING`、`FILTER_MANAGER_TARGET_MISSING`、`FILTER_MANAGER_FILTER_ITEM_UNBOUND`、`FILTER_MANAGER_FILTER_PATH_UNRESOLVED`、`FIELD_MODEL_PAGE_SLOT_UNSUPPORTED` 都会保持为 blocker。`RELATION_BLOCK_SHOULD_USE_ASSOCIATION_CONTEXT` 只在 parent->child resource 已验证时保留为优化 warning，不作为写前 gate。

## Filter form 专项归一化

`canonicalize-payload` 现在会对 `FilterFormItemModel` 执行基于 metadata 的归一化：

- 把错误的 `subModels.field.use` 修正为期望的筛选字段模型
- 把 `filterFormItemSettings.init.filterField` 修正为 metadata 派生的 descriptor
- 记录 transform code `FILTER_FORM_FIELD_MODEL_CANONICALIZED`

映射规则固定为：

- association -> `FilterFormRecordSelectFieldModel`
- `select` / `multipleSelect` / `radioGroup` / `checkbox` / `checkboxGroup` / `boolean` / `enum` -> `SelectFieldModel`
- `date` -> `DateOnlyFilterFieldModel`
- `datetimeNoTz` -> `DateTimeNoTzFilterFieldModel`
- `datetime` / `datetimeTz` / `createdAt` / `updatedAt` / `unixTimestamp` -> `DateTimeTzFilterFieldModel`
- `percent` -> 优先 `PercentFieldModel`，不可用时降到 `NumberFieldModel`
- `number` / `integer` / `float` / `double` / `decimal` / `id` / `snowflakeId` / `bigInt` -> `NumberFieldModel`
- `time` -> `TimeFieldModel`
- 其他标量 -> `InputFieldModel`

同时，`TABLE_COLLECTION_ACTION_SLOT_USE_INVALID`、`TABLE_RECORD_ACTION_SLOT_USE_INVALID`、`DETAILS_ACTION_SLOT_USE_INVALID`、`FILTER_FORM_ACTION_SLOT_USE_INVALID`、`POPUP_PAGE_USE_INVALID`、`POPUP_PAGE_USE_MISMATCH` 都属于固定结构契约错误，默认直接保留为 blocker。

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
- `ASSOCIATION_CONTEXT_REQUIRES_VERIFIED_RESOURCE`、`DOTTED_ASSOCIATION_DISPLAY_ASSOCIATION_PATH_MISMATCH`、`DOTTED_ASSOCIATION_DISPLAY_MISSING_ASSOCIATION_PATH`、`ASSOCIATION_FIELD_REQUIRES_EXPLICIT_DISPLAY_MODEL`、`ASSOCIATION_SPLIT_DISPLAY_BINDING_UNSTABLE`、`TABLE_CLICKABLE_ASSOCIATION_TITLE_PATH_UNSTABLE`、`TABLE_JS_WORKAROUND_REQUIRES_EXPLICIT_INTENT`、`BELONGS_TO_FILTER_REQUIRES_SCALAR_PATH`、`EMPTY_DETAILS_BLOCK`、`FORM_ACTION_MUST_USE_ACTIONS_SLOT`、`FORM_BLOCK_EMPTY_GRID`、`FORM_ITEM_FIELD_SUBMODEL_MISSING`、`FORM_SUBMIT_ACTION_DUPLICATED`、`FORM_SUBMIT_ACTION_MISSING`、`FILTER_FORM_EMPTY_GRID`、`FILTER_FORM_ITEM_FIELD_SUBMODEL_MISSING`、`FILTER_FORM_ITEM_FILTERFIELD_MISSING`、`FILTER_FORM_FIELD_MODEL_MISMATCH`、`FILTER_MANAGER_MISSING`、`FILTER_MANAGER_TARGET_MISSING`、`FILTER_MANAGER_FILTER_ITEM_UNBOUND`、`FILTER_MANAGER_FILTER_PATH_UNRESOLVED`、`FIELD_MODEL_PAGE_SLOT_UNSUPPORTED`、`TABLE_COLLECTION_ACTION_SLOT_USE_INVALID`、`TABLE_RECORD_ACTION_SLOT_USE_INVALID`、`DETAILS_ACTION_SLOT_USE_INVALID`、`FILTER_FORM_ACTION_SLOT_USE_INVALID`、`POPUP_PAGE_USE_INVALID`、`POPUP_PAGE_USE_MISMATCH`、`TAB_SLOT_USE_INVALID`、`TAB_GRID_MISSING_OR_INVALID`、`TAB_GRID_ITEM_USE_INVALID`、`TAB_SUBTREE_UID_REUSED`、`REQUIRED_VISIBLE_TABS_MISSING`、`REQUIRED_TABS_TARGET_PAGE_MISSING` 不允许通过 `risk_accept` 降级；即使显式传入 `codes`，它们也必须继续保留为 blocker

## 常见误区

- 看过文档就直接写 payload，不跑 guard
- 跑完 guard 就直接裸 `PostFlowmodels_save` / `PostFlowmodels_mutate`，没有 wrapper 和 readback
- 以为 `field` 和 `path` 只是命名差异
- 明明只知道子表上的 `belongsTo` 字段名，却直接把它写成 `associationName`
- 明明是 child-side `belongsTo` 过滤，却把裸关联字段名直接拿去配 `$eq` / `$ne` 这类标量操作符
- 明明还在父表上取值，却把字段绑定拆成 `target collection + associationPathName + simple fieldPath`
- 明明 `fieldPath` 已经是正确的 dotted path，却漏了 `associationPathName`
- 明明是“关联标题列点击弹窗”，却继续保留 `dotted path + click-to-open`
- 明明用户没要求 JS，却把关联标题列点击弹窗直接落成 `JSFieldModel` / `JSColumnModel`
- 详情块里只有 `DetailsGridModel`，却把它当成“客户详情已完成”
- 把关联字段直接交给 `DisplayTextFieldModel(fieldPath=<relationField>)`，却没有明确标题字段策略
- 明明 target collection 没有 title field，还继续生成关联显示字段
- 明明筛选项和目标表都已存在，却漏掉 grid 顶层 `filterManager`
- popup 只有 page/tab/grid 壳，却把它当成“已完成”
- 明明是 `ChildPageModel` popup，却还把 tab 写成 `PageTabModel`
- 明明是可编辑表单，却把 `FormSubmitActionModel` 塞进 `FormGridModel.subModels.items`
- 明明声明了 `FormItemModel`，却没有补 `subModels.field`

## 关联文档

- [relation-context.md](relation-context.md)
- [clickable-relation-column.md](clickable-relation-column.md)
- [popup-openview.md](popup-openview.md)
- [../blocks/filter-form.md](../blocks/filter-form.md)
