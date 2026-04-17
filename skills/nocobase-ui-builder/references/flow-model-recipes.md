# Flow Model 配方兼容入口

这个文件保留为旧入口，但不再维护完整大总表。新的权威任务路由见：

- [index.md](index.md)

如果你是从旧 prompt、旧笔记或旧测试跳进来，按下面路径继续：

## 页面生命周期

- [recipes/page-lifecycle.md](recipes/page-lifecycle.md)
- [ui-api-overview.md](ui-api-overview.md)
- [opaque-uid.md](opaque-uid.md)

适用：

- `createV2` / `destroyV2`
- page shell、default hidden tab、page/grid anchor
- route-ready、readback、page 级别交付

## 区块增删改移

- [recipes/block-mutations.md](recipes/block-mutations.md)
- [page-first-planning.md](page-first-planning.md)
- [patterns/payload-guard.md](patterns/payload-guard.md)

适用：

- `save` / `mutate` / `ensure` / `move` / `destroy`
- 现有页面的局部 patch
- 写前 live snapshot、写后 readback、targetSignature 对账

## 表单与动作

- [recipes/forms-and-actions.md](recipes/forms-and-actions.md)
- [patterns/index.md](patterns/index.md)
- [blocks/create-form.md](blocks/create-form.md)
- [blocks/edit-form.md](blocks/edit-form.md)
- [blocks/filter-form.md](blocks/filter-form.md)
- [blocks/details.md](blocks/details.md)

适用：

- filter / create / edit / details / actions
- popup / openView / record actions / relation context
- selector、`filterByTk`、`dataScope.filter`

## 总览 / 看板 / 趋势 / KPI / 说明页

- [insight-first-recipe.md](insight-first-recipe.md)
- [blocks/chart.md](blocks/chart.md)
- [blocks/grid-card.md](blocks/grid-card.md)
- [js-models/index.md](js-models/index.md)

## validation / review / improve

只有用户明确要求时才进入：

- [validation.md](validation.md)
- [ops-and-review.md](ops-and-review.md)

## 固定规则

1. 任何探测或写操作前都先 `start-run`。
2. draft payload 不能直接落库；必须先过 [patterns/payload-guard.md](patterns/payload-guard.md)。
3. `createV2` 只代表 page shell 已创建；route-ready、readback、runtime 结论必须分开汇报。
