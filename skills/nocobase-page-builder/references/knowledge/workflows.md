---
name: nocobase-workflow
description: Guide AI to create NocoBase workflows — triggers, conditions, data operations, SQL, scheduling
triggers:
  - workflow
  - automation
  - workflow
  - automation
  - trigger
  - trigger
  - scheduled task
  - status linkage
tools:
  - nb_create_workflow
  - nb_add_node
  - nb_enable_workflow
  - nb_list_workflows
  - nb_get_workflow
  - nb_delete_workflow
  - nb_delete_workflows_by_prefix
---

# NocoBase Workflow Building

You are guiding the user to create automated workflows in NocoBase.

## Key Concepts

### Trigger Types

| Type | Description | Mode |
|------|-------------|------|
| `collection` | Data change trigger | 1=create, 2=update, 3=create+update, 4=delete |
| `schedule` | Time-based trigger | 0=cron, 1=date field |
| `action` | Manual button trigger | — |

### Node Types

| Type | Description |
|------|-------------|
| `condition` | If/else branch (basic engine or math.js) |
| `update` | Update existing records |
| `create` | Create new records |
| `query` | Query records for use in downstream nodes |
| `sql` | Execute raw SQL |
| `request` | HTTP request (webhooks, external APIs) |
| `loop` | Iterate over array data |
| `end` | Terminate workflow (1=success, 0=failure) |

### Node Linking Model

- Nodes form a **linked list**: `upstreamId` → `downstreamId`
- Branch nodes (condition, loop) use `branchIndex`:
  - `1` = true branch (condition) or loop body (loop)
  - `0` = false branch (condition)
  - `null` = main line continuation

### Variable System

| Variable | Description |
|----------|-------------|
| `{{$context.data.field}}` | Field from the trigger record |
| `{{$context.data.id}}` | ID of the trigger record |
| `{{$jobsMapByNodeKey.<key>.field}}` | Result from a previous node |
| `{{$scopes.<key>.item}}` | Current item in a loop |

## Workflow Patterns

### Pattern 1: Auto-numbering (on create)

Generate sequential IDs like `PR-2026-001`:

```
# Step 1: Create workflow
nb_create_workflow("Auto Purchase Number", "collection",
    '{"mode": 1, "collection": "purchase_requests", "appends": [], "condition": {"$and": []}}')

# Step 2: Add SQL node
nb_add_node(wf_id, "sql", "Generate Number",
    '{"dataSource": "main", "sql": "UPDATE purchase_requests SET request_no = \'PR-\' || TO_CHAR(NOW(), \'YYYY\') || \'-\' || LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING(request_no FROM \'[0-9]+$\') AS INT)),0)+1 FROM purchase_requests WHERE request_no LIKE \'PR-\' || TO_CHAR(NOW(), \'YYYY\') || \'-%\')::TEXT, 3, \'0\') WHERE id = {{$context.data.id}}"}')

# Step 3: Enable
nb_enable_workflow(wf_id)
```

### Pattern 2: Status Sync (on create)

Set default status when a record is created:

```
nb_create_workflow("Default Status", "collection",
    '{"mode": 1, "collection": "orders", "appends": [], "condition": {"$and": []}}')

nb_add_node(wf_id, "update", "Set Draft Status",
    '{"collection": "orders", "params": {"filter": {"id": "{{$context.data.id}}"}, "values": {"status": "draft"}}}')

nb_enable_workflow(wf_id)
```

### Pattern 3: Conditional Branch (on create)

Different actions based on field value:

```
nb_create_workflow("Transfer Type Handler", "collection",
    '{"mode": 1, "collection": "transfers", "appends": [], "condition": {"$and": []}}')

# Condition node
cond = nb_add_node(wf_id, "condition", "Is Transfer?",
    '{"rejectOnFalse": false, "engine": "basic", "calculation": {"group": {"type": "and", "calculations": [{"calculator": "equal", "operands": ["{{$context.data.type}}", "transfer"]}]}}}')

# True branch: update status to "transferred"
nb_add_node(wf_id, "update", "Mark Transferred",
    '{"collection": "assets", "params": {"filter": {"id": "{{$context.data.asset_id}}"}, "values": {"status": "transferred"}}}',
    upstream_id=cond_id, branch_index=1)

# False branch: update status to "borrowed"
nb_add_node(wf_id, "update", "Mark Borrowed",
    '{"collection": "assets", "params": {"filter": {"id": "{{$context.data.asset_id}}"}, "values": {"status": "borrowed"}}}',
    upstream_id=cond_id, branch_index=0)

nb_enable_workflow(wf_id)
```

### Pattern 4: Field Change Trigger (on update)

React when specific fields change:

```
nb_create_workflow("Disposal Complete", "collection",
    '{"mode": 2, "collection": "disposals", "changed": ["status"], "condition": {"status": {"$eq": "disposed"}}, "appends": []}')

nb_add_node(wf_id, "update", "Update Asset Status",
    '{"collection": "assets", "params": {"filter": {"id": "{{$context.data.asset_id}}"}, "values": {"status": "disposed"}}}')

nb_enable_workflow(wf_id)
```

### Pattern 5: Date-based Schedule

Trigger N days before a date field:

```
# Trigger 30 days before insurance expiry
nb_create_workflow("Insurance Expiry Warning", "schedule",
    '{"mode": 1, "collection": "insurance", "startsOn": {"field": "end_date", "offset": -30, "unit": 86400000}, "repeat": null, "appends": []}')

nb_add_node(wf_id, "sql", "Mark Expiring",
    '{"dataSource": "main", "sql": "UPDATE insurance SET remark = \'expiring soon\' WHERE id = {{$context.data.id}}"}')

nb_enable_workflow(wf_id)
```

### Pattern 6: Cron Schedule

```
# Run every weekday at 9 AM
nb_create_workflow("Daily Report", "schedule",
    '{"mode": 0, "startsOn": "2026-01-01T00:00:00.000Z", "repeat": "0 9 * * 1-5"}')
```

### Pattern 7: Multi-node Chain

Chain multiple nodes on the main line:

```
nb_create_workflow("Complex Flow", "collection",
    '{"mode": 1, "collection": "orders", "appends": [], "condition": {"$and": []}}')

# Node 1 (first node, no upstream_id needed)
n1 = nb_add_node(wf_id, "query", "Get Customer",
    '{"collection": "customers", "multiple": false, "params": {"filter": {"id": "{{$context.data.customer_id}}"}}}')

# Node 2 (chains after node 1)
n2 = nb_add_node(wf_id, "update", "Update Order",
    '{"collection": "orders", "params": {"filter": {"id": "{{$context.data.id}}"}, "values": {"customer_name": "{{$jobsMapByNodeKey.NODE_KEY.name}}"}}}',
    upstream_id=n1_id)

nb_enable_workflow(wf_id)
```

## Workflow

### Phase 1: Plan

Before creating workflows, identify:
1. **Trigger**: What event starts the workflow? (record created/updated/deleted, schedule, manual)
2. **Collection**: Which table triggers it?
3. **Logic**: What conditions and actions are needed?
4. **Target**: What data gets modified?

### Phase 2: Create

1. Create workflow with trigger config
2. Add nodes in order (first node auto-links, subsequent need `upstream_id`)
3. For branches: add condition node, then true/false branch nodes with `branch_index`

### Phase 3: Enable & Verify

1. Enable the workflow
2. List workflows to confirm: `nb_list_workflows()`
3. Inspect with: `nb_get_workflow(wf_id)`

## Best Practices

1. **Title convention**: Use prefixes for grouping, e.g. "AM-WF01 Auto Number"
2. **One workflow per concern**: Don't combine unrelated logic
3. **Idempotent SQL**: Write SQL that's safe to run multiple times
4. **Test before enable**: Create all nodes first, then enable
5. **Batch cleanup**: Use `nb_delete_workflows_by_prefix("AM-")` to clean up
6. **Duplicate prevention**: Check `nb_list_workflows()` before creating — duplicate titles cause confusion
7. **Variable references**: Always use double braces `{{$context.data.field}}` — single braces won't work
