# Phase 5: Workflows

Can start after Phase 1 (needs collections), parallel with Phase 4/6.

## Tools

| Tool | Purpose |
|------|---------|
| nb_create_workflow(title, trigger_type, trigger_config) | Create workflow |
| nb_add_node(workflow_id, node_config) | Add node to workflow |
| nb_enable_workflow(workflow_id) | Enable workflow |
| nb_list_workflows() | List all workflows |

## Step 5.1: Plan Workflows [sequential]

From requirements, identify:
- **Auto-numbering**: which tables need sequence IDs?
- **Status sync**: which changes cascade to related tables?
- **Auto-calculation**: server-side computations (vs client events in Phase 3B)
- **Date reminders**: which date fields need advance warnings?

Read templates from `templates/workflows/index.md` if available.

Write **Workflow Task Table** to `notes.md`:
```
### Workflow Tasks
| # | Title | Type | Collection | Template | Status |
|---|-------|------|-----------|----------|--------|
| 1 | CRM-CustomerNumber | auto-number | nb_crm_customers | auto-number | [todo] |
```

## Step 5.2: Create Workflows [parallel-ok]

Use task template `task-templates/task-workflow.md`.

For each workflow:
1. `nb_create_workflow(title, trigger_type, trigger_config)` → workflow_id
2. `nb_add_node(workflow_id, node_config)` × N
3. `nb_enable_workflow(workflow_id)`

## Trigger Types

- `collection` — mode bitmask: 1=create, 2=update, 4=delete (3=create+update)
- `schedule` — mode 0=cron, mode 1=DateField
- `action` — triggered by manual button

## Variable System

```
{{$context.data.field}}              — trigger record field
{{$jobsMapByNodeKey.KEY.field}}      — previous node result
{{$scopes.KEY.item}}                 — loop current item
```

## Step 5.3: Verify [sequential]

- `nb_list_workflows()` — all should be enabled
- Update notes.md: `## Status: Phase 5 complete`

## After Phase 5

Show user: workflows created (names + triggers), all enabled.
Ask: "Automation workflows are created and enabled. Want to test them? For example, create a new record to check auto-numbering."
Wait for user response.

Next → `phases/phase-7-verify.md` (when Phase 4+5+6 all complete)
