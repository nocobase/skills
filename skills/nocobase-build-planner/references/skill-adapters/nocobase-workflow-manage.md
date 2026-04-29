# Adapter: nocobase-workflow-manage

Use for PRD slices involving:

- business process automation
- lifecycle state transitions
- workflow triggers
- workflow nodes
- execution diagnostics

Do not include:

- collection creation
- UI page creation
- ACL policy writes

## Required Prompt Shape

```md
使用 $nocobase-workflow-manage 完成工作流任务。

Skill lock:
Use only $nocobase-workflow-manage for this task. Do not use other NocoBase skills, generic fallback commands, or unrelated tooling for this task. If another skill is needed, stop and report that a separate task group is required.

Source PRD:
<prd path>

Task file:
<task file path>

目标：
根据 PRD processes 配置工作流或状态流转自动化。

输入：
- processes: ...
- states/transitions: ...
- related objects: ...
- actors: ...

边界：
- 不创建 collections/fields。
- 不搭建页面。
- 不配置 ACL。
- 工作流依赖的 collection/field 必须从 live readback 中确认，不猜。
- 遵守 $nocobase-workflow-manage 的 revision、enabled=false、node chaining 和 verification 规则。

验收：
...

证据要求：
- workflow readback
- nodes readback
- enabled status
- test/execution result if explicitly requested and confirmed
```

## Prompt Guardrails

- Tell the executor to create workflows disabled first.
- Tell the executor not to auto-enable without user confirmation.
- Tell the executor to create revisions for frozen versions.
- Tell the executor to reference node results by node key, not id.
