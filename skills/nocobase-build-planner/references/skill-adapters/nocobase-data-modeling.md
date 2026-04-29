# Adapter: nocobase-data-modeling

Use for PRD slices involving:

- business objects
- fields
- enum values
- file/tree/view collection intent
- relations between business objects

Do not include:

- page/menu/block authoring
- workflow node authoring
- ACL role or permission writes
- dashboard layout

## Required Prompt Shape

```md
使用 $nocobase-data-modeling 完成数据建模任务。

Skill lock:
Use only $nocobase-data-modeling for this task. Do not use other NocoBase skills, generic fallback commands, or unrelated tooling for this task. If another skill is needed, stop and report that a separate task group is required.

Source PRD:
<prd path>

Task file:
<task file path>

目标：
创建或复用 PRD 中定义的业务对象、字段和关系。

输入：
- business_objects: ...
- fields: ...
- relations: ...

边界：
- 不创建页面、区块、菜单或弹窗。
- 不配置工作流。
- 不配置 ACL。
- 不生成插件。
- 按 $nocobase-data-modeling 的规则选择字段 interface、关系字段和读回方式。

验收：
...

证据要求：
- collections readback
- fields readback
- relation readback
```

## Prompt Guardrails

- Tell the executor to inspect existing collections first.
- Tell the executor to avoid duplicate collections.
- Tell the executor not to guess plugin-backed interfaces.
- Tell the executor to read back collections and fields after mutation.
- Keep business names and PRD IDs visible.
