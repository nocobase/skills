---
title: nocobase-ui-builder 参考索引
description: 唯一权威任务路由表；先按任务分类，再进入 canonical docs、recipes、block docs、pattern docs 与 JS docs。
---

# nocobase-ui-builder 参考索引

先按任务分类，再打开对应文档。不要继续从顶层 `SKILL.md` 自行脑补 payload。

## 通用入口

- [ui-api-overview.md](ui-api-overview.md)
  - API 生命周期、schema-first、route-ready、readback、工具选择
- [page-first-planning.md](page-first-planning.md)
  - 页面骨架、section 规划、block 映射顺序
- [flow-schemas/index.md](flow-schemas/index.md)
  - 当前实例的本地 graph、model / slot / artifact 查询入口
- [patterns/payload-guard.md](patterns/payload-guard.md)
  - 写前 guard、blocker / warning / risk-accept
- [opaque-uid.md](opaque-uid.md)
  - page / node uid 生成规则

## 任务路由

- 创建或删除页面：
  [recipes/page-lifecycle.md](recipes/page-lifecycle.md),
  [ui-api-overview.md](ui-api-overview.md),
  [opaque-uid.md](opaque-uid.md)
- 读取、更新、移动、删除现有区块：
  [recipes/block-mutations.md](recipes/block-mutations.md),
  [page-first-planning.md](page-first-planning.md),
  [ui-api-overview.md](ui-api-overview.md)
- 表单、动作、popup/openView、record actions：
  [recipes/forms-and-actions.md](recipes/forms-and-actions.md),
  [patterns/index.md](patterns/index.md)
- 总览 / 看板 / 趋势 / KPI / 说明型页面：
  [insight-first-recipe.md](insight-first-recipe.md),
  [blocks/chart.md](blocks/chart.md),
  [blocks/grid-card.md](blocks/grid-card.md),
  [js-models/index.md](js-models/index.md)
- validation / review / improve / smoke：
  [validation.md](validation.md),
  [ops-and-review.md](ops-and-review.md)

## 兼容入口

- [flow-model-recipes.md](flow-model-recipes.md)
  - 旧入口；现在只负责把旧路径重定向到新的 recipes 和 canonical docs
- [validation-scenarios.md](validation-scenarios.md)
  - validation 动态场景规划细节
- [validation-data-preconditions.md](validation-data-preconditions.md)
  - 旧入口；数据前置规则已合并进 `validation.md`

## 区块文档

- [blocks/index.md](blocks/index.md)
- [blocks/public-blocks-inventory.md](blocks/public-blocks-inventory.md)
- [blocks/page-and-tabs.md](blocks/page-and-tabs.md)
- [blocks/filter-form.md](blocks/filter-form.md)
- [blocks/table.md](blocks/table.md)
- [blocks/details.md](blocks/details.md)
- [blocks/create-form.md](blocks/create-form.md)
- [blocks/edit-form.md](blocks/edit-form.md)
- [blocks/chart.md](blocks/chart.md)
- [blocks/grid-card.md](blocks/grid-card.md)

## 横切模式文档

- [patterns/index.md](patterns/index.md)
- [patterns/payload-guard.md](patterns/payload-guard.md)
- [patterns/clickable-relation-column.md](patterns/clickable-relation-column.md)
- [patterns/popup-openview.md](patterns/popup-openview.md)
- [patterns/relation-context.md](patterns/relation-context.md)
- [patterns/table-column-rendering.md](patterns/table-column-rendering.md)
- [patterns/record-actions.md](patterns/record-actions.md)
- [patterns/tree-table.md](patterns/tree-table.md)
- [patterns/many-to-many-and-through.md](patterns/many-to-many-and-through.md)

## JS / RunJS 文档

- [js-models/index.md](js-models/index.md)
- [js-models/rendering-contract.md](js-models/rendering-contract.md)
- [js-models/runjs-overview.md](js-models/runjs-overview.md)
- [js-models/js-block.md](js-models/js-block.md)
- [js-models/js-column.md](js-models/js-column.md)
- [js-models/js-field.md](js-models/js-field.md)
- [js-models/js-editable-field.md](js-models/js-editable-field.md)
- [js-models/js-item.md](js-models/js-item.md)
- [js-models/js-action.md](js-models/js-action.md)

## 使用约定

1. 任何探测或写操作前，先读 [ops-and-review.md](ops-and-review.md) 并执行 `start-run`。
2. 默认先看本地 graph，再决定是否调用 `PostFlowmodels_schemabundle` / `PostFlowmodels_schemas`。
3. 默认写入口是 `node scripts/ui_write_wrapper.mjs run --action <create-v2|save|mutate|ensure> ...`；不要裸调这些底层写接口。
4. 任何写操作都要先经过 [patterns/payload-guard.md](patterns/payload-guard.md)。
5. validation、review、improve 的事实来源固定是 [validation.md](validation.md) + [ops-and-review.md](ops-and-review.md)。
