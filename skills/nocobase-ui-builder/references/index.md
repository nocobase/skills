---
title: nocobase-ui-builder 参考索引
description: 按任务类型直达 canonical docs、block docs、pattern docs、JS docs 与 validation/review docs。
---

# nocobase-ui-builder 参考索引

先按任务分类，再打开对应文档。默认不要从 `SKILL.md` 顶层继续硬推具体 payload。

## 先读的 canonical docs

- [ui-api-overview.md](ui-api-overview.md)
  - API 生命周期、schema-first 探测、route-ready、readback、工具选择
- [page-first-planning.md](page-first-planning.md)
  - 页面骨架、section 规划、block 映射顺序
- [flow-model-recipes.md](flow-model-recipes.md)
  - 常见起手式和通用 recipe
- [flow-schemas/index.md](flow-schemas/index.md)
  - 当前实例的 flow schema graph、本地 model/slot/artifact 查询入口
- [ops-and-review.md](ops-and-review.md)
  - tool log、phase/gate、cache、review 报告、自动改进
- [opaque-uid.md](opaque-uid.md)
  - page/node uid 生成规则
- [validation.md](validation.md)
  - 真实可用性 validation、数据前置、噪声归类、成功标准
- [validation-scenarios.md](validation-scenarios.md)
  - 动态 validation 场景规划规则
- [validation-data-preconditions.md](validation-data-preconditions.md)
  - 兼容入口；内容已并入 `validation.md`

## 按任务路由

- 创建/删除页面：
  [ui-api-overview.md](ui-api-overview.md),
  [opaque-uid.md](opaque-uid.md),
  [flow-model-recipes.md](flow-model-recipes.md)
- 更新现有页面或区块：
  [page-first-planning.md](page-first-planning.md),
  [flow-model-recipes.md](flow-model-recipes.md),
  [ui-api-overview.md](ui-api-overview.md)
- 需要写前 guard：
  [patterns/payload-guard.md](patterns/payload-guard.md)
- 需要本地 graph / schema 明细：
  [flow-schemas/index.md](flow-schemas/index.md)
- 需要 validation / review / improve：
  [validation.md](validation.md),
  [ops-and-review.md](ops-and-review.md)

## 区块文档

- [blocks/index.md](blocks/index.md)
- [blocks/public-blocks-inventory.md](blocks/public-blocks-inventory.md)
- [blocks/page-and-tabs.md](blocks/page-and-tabs.md)
- [blocks/filter-form.md](blocks/filter-form.md)
- [blocks/table.md](blocks/table.md)
- [blocks/details.md](blocks/details.md)
- [blocks/create-form.md](blocks/create-form.md)
- [blocks/edit-form.md](blocks/edit-form.md)

## 横切模式文档

- [patterns/index.md](patterns/index.md)
- [patterns/payload-guard.md](patterns/payload-guard.md)
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
- [js-models/js-item.md](js-models/js-item.md)
- [js-models/js-action.md](js-models/js-action.md)

## 使用约定

1. 先开 canonical docs，再开 block/pattern/js 文档。
2. 只要本地 graph 足够，就不要先打 `PostFlowmodels_schemas`。
3. 任何写操作都要先看 `payload-guard.md`。
4. validation、review、improve 的事实来源固定是 `validation.md` + `ops-and-review.md`。
