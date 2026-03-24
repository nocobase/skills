# Dynamic Validation Scenarios

validation 默认走动态场景规划，不再依赖固定 case registry。

## 生成链路

1. 先从请求文本、slug、session 信号识别业务领域：
   - 订单履约
   - 客户增长
   - 项目交付
   - 审批运营
   - 组织运营
2. 再从领域画像选择页面原型：
   - 主表工作台
   - 360 详情工作台
   - 多标签业务工作台
   - 审批处理台
   - 树形运维页面
3. 再按页面原型组合主干区块：
   - `FilterFormBlockModel`
   - `TableBlockModel`
   - `DetailsBlockModel`
   - `CreateFormModel`
   - `EditFormModel`
   - row actions / details actions / popup
4. 最后结合实例感知清单扩展公开 root block：
   - 通过 `PostFlowmodels_schemabundle`（`uses=['BlockGridModel']`）拿到实例真实可用的 root blocks 候选清单
   - 再用 `PostFlowmodels_schemas`（`uses=<root blocks>`）拉回这些区块的 `dynamicHints / contextRequirements / unresolvedReason` 等信息
   - 选块会同时看业务领域、页面原型、请求关键词，以及上述动态 hints 的语义标签

## 实例清单来源（MCP）

- 通过 NocoBase MCP 工具 `PostFlowmodels_schemabundle` + `PostFlowmodels_schemas` 获取。
- `schemaBundle` 负责回答“这个实例上哪些 root blocks 真正可用”，`schemas` 负责补齐这些区块的动态 hints（用于语义匹配与 guard 解释）。
- 输出建议落成 `instanceInventory.flowSchema.rootPublicUses/publicUseCatalog` 并透传到 planner + payload guard。
- 若使用 `scripts/spec_contracts.mjs build-validation-specs` 生成 spec，可通过 `--instance-inventory-file` 注入实例清单，避免额外 REST token。
- 如果你只有 MCP 的原始返回体（schemaBundle/schemas），可用 `scripts/instance_inventory_probe.mjs materialize --schema-bundle-file ... --schemas-file ...` 把它们落成 `instanceInventory.json` 再注入。

## 真实场景策略

- 图表、指标卡、地图、协作评论这类区块不会再被统一塞进一个“扩展区块”尾巴里。
- 默认候选偏置是 `insight-first`：
  - 命中 `总览 / 看板 / 趋势 / KPI / 交互说明` 这类请求时，先在 `ChartBlockModel / GridCardBlockModel / JSBlockModel` 之间做排序，而不是先保留一个 `Table/Details` 主位。
  - planner 不要求每个候选都带 `TableBlockModel` 或 `DetailsBlockModel`；如果 `filter + insight surface` 已能表达核心意图，就允许直接入选。
- planner 会按业务语义决定它们落在：
  - 工作台顶部
  - 总览区
  - 独立业务 tab
  - 协作 / 地图 / 引用这类专门视图
- 同样是 validation，请求“审批处理台”和“图表分析看板”时，区块组合应明显不同。
- 写前 guard / compile fallback 只负责验证 payload 合法性与风险，不参与 block 排序；不要因为 guard 存在，就在 planner 阶段提前把候选改成保守页面。

## 可视化默认策略

- 命中 `总览 / 概览 / 趋势 / 分布 / 统计 / 占比 / dashboard` 时，planner 应优先把 `ChartBlockModel` 放入 `insight` 区，而不是先退回表格。
- 命中 `指标卡 / KPI / summary / overview` 且更像数字摘要时，planner 应优先考虑 `GridCardBlockModel`。
- 命中 `交互 / 联动 / 说明 / 引导 / 叙事 / 自定义` 时，`JSBlockModel` 应与 `ChartBlockModel / GridCardBlockModel` 并列为 insight peer，而不是只被当作兜底扩展块。
- 对 `ChartBlockModel`，skill 默认应先生成 `builder + basic`；只有用户显式要求 `sql` 或 `custom option / events` 时再升级。
- `ChartBlockModel` 的动态 hints 如果只是：
  - `runtime-chart-query-config`
  - `runtime-chart-option-builder`
  但当前 skill 已经能稳定给出 `builder/sql` 与 `basic/custom` 的正确静态配置，就不应直接丢进 discarded uses。
- scenario / layout candidate 应显式输出 `visualizationSpec[]`，供 compile artifact、review 和后续 skill 调优使用。
- scenario / layout candidate 还应显式输出：
  - `creativeIntent`
  - `selectedInsightStrategy`
  - `jsExpansionHints`

## 输出重点

- `scenarioId`
- `domainId` / `domainLabel`
- `archetypeId` / `archetypeLabel`
- `creativeIntent`
- `selectedInsightStrategy`
- `jsExpansionHints`
- `selectionRationale`
- `availableUses`
- `selectedUses`
- `generatedCoverage`
- `randomPolicy`
- `instanceInventory`

其中 `instanceInventory.flowSchema.publicUseCatalog` 会记录实例里抽出的 public root block 语义摘要，供复盘和后续调优使用。

这些字段会写进 `compileArtifact.json`，并由 `nocobase-ui-validation-review` 直接展示。

## 随机策略

- 默认 `mode=high-variance`
- 没有显式 seed 时，使用 runtime 随机 seed
- 需要复现时，可传固定 seed
- 随机只负责“同一业务里的布局变化”，不再负责决定是否忽略业务语义
