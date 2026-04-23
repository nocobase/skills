---
title: nocobase-ui-builder 参考索引
description: 先命中 quick route，再按需下钻到完整参考文档。
---

# nocobase-ui-builder 参考索引

先命中一个 quick route。只有当前 quick route 仍不够时，才继续打开完整参考文档。

## Quick Routes

| 任务形状 | 先读 | 按需再读 |
| --- | --- | --- |
| 从业务意图起草或整页创建/替换 | [whole-page-quick.md](whole-page-quick.md) | [blocks/filter-form.md](blocks/filter-form.md), [whole-page-recipes.md](whole-page-recipes.md), [page-archetypes.md](page-archetypes.md), [page-blueprint.md](page-blueprint.md), [ascii-preview.md](ascii-preview.md), [helper-contracts.md](helper-contracts.md) |
| 现有页面上的局部编辑 | [local-edit-quick.md](local-edit-quick.md) | [runtime-playbook.md](runtime-playbook.md), [capabilities.md](capabilities.md), [settings.md](settings.md) |
| 默认值 / 联动 / 显隐 / 动作状态 | [reaction-quick.md](reaction-quick.md) | [reaction.md](reaction.md), [runtime-playbook.md](runtime-playbook.md) |
| 只有一部分属于 Modern page，剩余内容应收窄 / handoff | [boundary-quick.md](boundary-quick.md) | [template-quick.md](template-quick.md) |
| 模板复用 / 已有 template reference / `copy` vs `reference` | [template-quick.md](template-quick.md) | [templates.md](templates.md), [template-decision-summary.md](template-decision-summary.md), [popup.md](popup.md) |
| helper CLI / prepare-write / 本地 validator | [helper-contracts.md](helper-contracts.md) | [ascii-preview.md](ascii-preview.md), [runjs-runtime.md](runjs-runtime.md) |
| transport / nb 命令规则 | [cli-transport.md](cli-transport.md) | [cli-command-surface.md](cli-command-surface.md), [transport-crosswalk.md](transport-crosswalk.md) |
| JS / RunJS / `ctx.*` / event-flow JS | [js.md](js.md) | [js-surfaces/index.md](js-surfaces/index.md), [runjs-authoring-loop.md](runjs-authoring-loop.md), [js-snippets/index.md](js-snippets/index.md), [runjs-repair-playbook.md](runjs-repair-playbook.md), [js-reference-index.md](js-reference-index.md), [runjs-runtime.md](runjs-runtime.md), [settings.md](settings.md) |
| 图表主题 | [chart.md](chart.md) | [chart-core.md](chart-core.md), [chart-validation.md](chart-validation.md) |

## Late-stage Write Docs

这些文档不会替代 quick route。先命中一个 quick route，再按实际写入 / prepare-write / readback 阶段按需打开下面这些文件。

- 写入前 gate / helper: [helper-contracts.md](helper-contracts.md), [execution-checklist.md](execution-checklist.md), [verification.md](verification.md)
- nb 命令边界: [cli-transport.md](cli-transport.md), [cli-command-surface.md](cli-command-surface.md), [transport-crosswalk.md](transport-crosswalk.md), [tool-shapes.md](tool-shapes.md)
- 规则与能力边界: [normative-contract.md](normative-contract.md), [settings.md](settings.md), [runtime-playbook.md](runtime-playbook.md)

## Topic Deep Dives

- Whole-page grammar: [whole-page-recipes.md](whole-page-recipes.md), [page-blueprint.md](page-blueprint.md), [page-archetypes.md](page-archetypes.md), [page-intent.md](page-intent.md), [page-first-planning.md](page-first-planning.md), [ascii-preview.md](ascii-preview.md)
- Reactions: [reaction.md](reaction.md)
- Templates / popup reuse: [templates.md](templates.md), [template-decision-summary.md](template-decision-summary.md), [popup.md](popup.md)
- JS / charts: [js.md](js.md), [js-surfaces/index.md](js-surfaces/index.md), [runjs-authoring-loop.md](runjs-authoring-loop.md), [runjs-repair-playbook.md](runjs-repair-playbook.md), [runjs-failure-taxonomy.md](runjs-failure-taxonomy.md), [js-reference-index.md](js-reference-index.md), [runjs-runtime.md](runjs-runtime.md), [chart.md](chart.md), [chart-core.md](chart-core.md), [chart-validation.md](chart-validation.md)
- Deep catalogs and naming: [blocks/index.md](blocks/index.md), [js-surfaces/index.md](js-surfaces/index.md), [js-snippets/index.md](js-snippets/index.md), [js-models/index.md](js-models/index.md), [aliases.md](aliases.md), [opaque-uid.md](opaque-uid.md)
