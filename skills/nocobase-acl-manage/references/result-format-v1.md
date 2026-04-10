# ACL Task Result Format v1

Use this template to keep skill output user-friendly and task-focused.

Do not return raw MCP payloads as the primary message.

## Output Blocks

1. `Task Summary`
2. `Applied Changes`
3. `Readback Evidence`
4. `Risk And Boundary`
5. `Next Action`

## Block Details

### 1) Task Summary

- task name
- target role
- data source
- execution mode (`safe` or `fast`)
- final status (`success`, `partial`, `blocked`)

### 2) Applied Changes

List only business changes, not low-level JSON:

- role created or reused
- snippets changed
- default role changed
- global actions changed

### 3) Readback Evidence

Return concise evidence points:

- role exists
- snippets equals expected list
- strategy actions include expected actions
- default role flag confirmed

### 4) Risk And Boundary

- high-impact change warnings
- capability boundary message if blocked

Preferred boundary message in Chinese:

- `该场景当前暂不支持通过 MCP 完成。建议先在 NocoBase 管理页面中处理该权限配置。`
- `如你愿意，我可以继续给你列出页面操作步骤（入口位置 + 字段填写建议）。`

### 5) Next Action

Offer one to three concrete options:

- continue with another task
- provide UI click-path guidance
- rerun in dry-run mode for review

## Example Success Output

```text
Task Summary
- task: onboard-role
- role: sales_manager
- data source: main
- mode: safe
- status: success

Applied Changes
- created role sales_manager
- set snippets: ui.*
- set global actions: view, create, update

Readback Evidence
- role readback succeeded
- snippets match expected list
- global strategy actions confirmed

Risk And Boundary
- no capability boundary hit

Next Action
1. 是否把该角色设为默认角色
2. 是否继续补充路由权限
```

## Example Boundary Output

```text
Task Summary
- task: bind-user-role
- role: sales_manager
- status: blocked

Risk And Boundary
- 该场景当前暂不支持通过 MCP 完成。建议先在 NocoBase 管理页面中处理该权限配置。
- 如你愿意，我可以继续给你列出页面操作步骤（入口位置 + 字段填写建议）。

Next Action
1. 我给你页面操作步骤
2. 继续执行当前支持的 ACL 任务
```
