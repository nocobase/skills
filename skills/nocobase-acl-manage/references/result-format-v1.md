# ACL Task Result Format v1

Use this template for `nocobase-acl-manage` v2 outputs.

Do not return raw MCP payloads as the primary user message.

## Output Blocks

1. `Task Summary`
2. `Capability Path`
3. `Applied Changes`
4. `Readback Evidence`
5. `Risk Card`
6. `Boundary And Next Action`

## Block Details

## 1) Task Summary

- canonical task name
- target object (role, user, global)
- data source
- execution mode (`safe` or `fast`)
- final status (`success`, `partial`, `blocked`)
- for `permission.data-source.resource.set`, include `collection_hints` and `resolved_collection_names`

## 2) Capability Path

Required fields:

- write path used (`acl-specific` or `guarded-generic`)
- resolved runtime tools
- fallback reason when guarded path is used

Example:

- `path: acl-specific`
- `tools: roles_update -> roles_get`

Or:

- `path: guarded-generic`
- `tools: resource_update(users) -> resource_list(users.roles)`
- `reason: no dedicated role-user membership write tool`

## 3) Applied Changes

List business-facing changes only:

- role created/updated/destroyed
- global role mode switched
- snippets adjusted
- routes granted/removed
- global strategy or resource strategy updated
- membership assigned/unassigned
- when task is `role.create-blank`, include explicit next-step permission assignment prompt (do not ask role-type selection)
- when task is `permission.data-source.resource.set`, include the pre-write confirmation digest that was approved:
  - data source
  - resolved collections
  - actions
  - scope

## 4) Readback Evidence

Keep evidence concise and verifiable:

- global mode string confirmed
- role exists and expected fields changed
- snippets equal expected set
- strategy actions include expected actions
- membership appears in `users.roles` or `roles.users` readback
- for resource permission writes, each resolved collection has matching action/scope readback
- for scope=`all|own`, readback should show non-null `scopeId` and matching `scope.key`
- for default-all field policy, readback should show explicit non-empty field arrays on field-configurable actions
- include per-action field coverage summary for selected field-configurable actions (for example, `view: 19/19 fields`)

## 5) Risk Card

Always include, even if no write occurred.

Fields:

- risk level: `low`/`medium`/`high`
- triggers: list of detected risk factors
- impact scope: who may be affected
- mitigation: 1-3 concrete actions

Typical triggers:

- global role mode switched to union mode
- broad snippets (`ui.*`, `pm`, `pm.*`, `app`)
- broad destructive data actions (`destroy`, broad import/export)
- large user-role assignment batch

## 6) Boundary And Next Action

If blocked:

- explain capability or governance boundary in plain language
- provide one fallback route (UI or guarded path if policy allows)
- for `permission.data-source.resource.set`, if data source/actions/scope are missing, or collection hints cannot be resolved, mark status as `blocked` and ask for missing/clearer inputs before write
- for `permission.data-source.resource.set`, if scope=`all|own` but resolved scope binding is missing, mark status as `blocked` before write
- for `permission.data-source.resource.set`, if full-field default cannot be resolved to explicit field lists, mark status as `blocked` before write
- for `permission.data-source.resource.set`, if user has not approved the pre-write confirmation summary, keep status as `blocked`

If successful:

- provide 1-3 concrete next actions
- for `role.create-blank`, first next action should be permission assignment categories:
  - `system snippets`
  - `desktop routes`
  - `data-source global strategy`
  - `data-source resource strategy`

Preferred boundary wording:

- `This operation is blocked by current capability or governance policy in this skill.`
- `You can complete it in NocoBase admin UI, or enable guarded fallback if the task supports it.`
- `If you want, I can provide exact UI navigation steps and field suggestions.`

Preferred Chinese wording:

- `该操作受当前能力或治理策略限制，暂时无法直接执行。`
- `你可以先在 NocoBase 管理后台完成，或在支持时启用受控兜底路径。`
- `如果你愿意，我可以继续给出精确的页面操作步骤和字段建议。`

## Example Success Output

```text
Task Summary
- task: global.role-mode.set
- target: global
- mode: safe
- status: success

Capability Path
- path: acl-specific
- tools: roles_set_system_role_mode -> roles_check

Applied Changes
- switched global role mode to allow-use-union

Readback Evidence
- roles_check.roleMode = allow-use-union

Risk Card
- level: high
- triggers: global union mode enabled
- impact: multi-role users may gain broader effective permissions
- mitigation:
  1) run risk.assess-system
  2) audit high-privilege role assignments

Boundary And Next Action
1. Compare current role differences with role.compare
2. Run risk.assess-system for post-change governance review
```

## Example Blocked Output

```text
Task Summary
- task: user.assign-role
- target: role=sales_reader user=42
- status: blocked

Capability Path
- path: acl-specific
- tools: none for dedicated role-user write

Boundary And Next Action
- This operation is blocked by current capability or governance policy in this skill.
- You can complete it in NocoBase admin UI, or enable guarded fallback if approved.
1. Enable guarded fallback for this task
2. Ask me for exact admin UI click-path
```
