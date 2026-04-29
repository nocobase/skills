# Adapter: nocobase-ui-builder

Use for PRD slices involving:

- menu/page/tab creation
- blocks
- forms
- tables/lists/cards
- popups
- page actions
- field/action/linkage UI behavior
- dashboard page layout

Do not include:

- creating collections or fields
- workflow graph authoring
- ACL writes
- plugin development

## Required Prompt Shape

```md
使用 $nocobase-ui-builder 完成页面搭建任务。

Skill lock:
Use only $nocobase-ui-builder for this task. Do not use other NocoBase skills, generic fallback commands, or unrelated tooling for this task. If another skill is needed, stop and report that a separate task group is required.

Source PRD:
<prd path>

Task file:
<task file path>

目标：
根据 PRD 页面需求创建或更新 NocoBase Modern pages。

输入：
- pages: ...
- roles for context only: ...
- main objects/actions: ...

边界：
- 不创建或修改 collections/fields；需要字段时读取 live metadata。
- 不配置 ACL 权限策略。
- 不创建 workflow node chain。
- 遵守 $nocobase-ui-builder 的 applyBlueprint / flow-surfaces / preflight 规则。

验收：
...

证据要求：
- pageSchemaUid readback
- block/action summary
- popup summary when applicable
```

## Prompt Guardrails

- Tell the executor to use live collection metadata.
- Tell the executor to reuse existing matching menus/pages when appropriate.
- Tell the executor to avoid placeholder pages/blocks.
- Tell the executor to report page identity keys and major block summaries.
