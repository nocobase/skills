# Adapter: nocobase-acl-manage

Use for PRD slices involving:

- roles
- role mode
- data permissions
- route/page permissions
- user-role membership intent
- permission risk assessment

Do not include:

- collection creation
- page creation
- workflow creation

## Required Prompt Shape

```md
使用 $nocobase-acl-manage 完成权限任务。

Skill lock:
Use only $nocobase-acl-manage for this task. Do not use other NocoBase skills, generic fallback commands, or unrelated tooling for this task. If another skill is needed, stop and report that a separate task group is required.

Source PRD:
<prd path>

Task file:
<task file path>

目标：
根据 PRD roles 和 permissions 配置角色、页面/路由权限、数据权限。

输入：
- roles: ...
- permissions: ...
- data scopes: ...
- related pages for route permission intent: ...

边界：
- 不创建 collections/fields。
- 不创建页面。
- 不创建 workflow。
- 遵守 $nocobase-acl-manage 的 plan -> confirm -> apply -> readback 流程。
- 高风险权限变更必须要求用户确认。

验收：
...

证据要求：
- role readback
- route permission readback when applicable
- data permission readback
- risk notes
```

## Prompt Guardrails

- Tell the executor to resolve business collection names before writes.
- Tell the executor to default data source only according to ACL skill rules.
- Tell the executor to keep full-field permission explicit when applicable.
- Tell the executor to read back every write.
