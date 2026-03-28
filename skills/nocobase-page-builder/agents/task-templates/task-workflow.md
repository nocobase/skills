# Task: Create Workflow "{TITLE}"

## Context
- Collection: {COLLECTION}
- Trigger: {TRIGGER_TYPE} (collection/schedule/action)
- Trigger config: {TRIGGER_CONFIG}

## Workflow Definition
{WORKFLOW_STEPS}

## Steps
1. `nb_create_workflow("{TITLE}", "{TRIGGER_TYPE}", {TRIGGER_CONFIG})` → workflow_id
2. `nb_add_node(workflow_id, {NODE_CONFIG})` for each node
3. `nb_enable_workflow(workflow_id)`
4. Update notes.md: mark Workflow Tasks row as `[done]` with workflow_id, or `[fail]`
