# Status Sync Workflow

When a record's status changes to a specific value, update related records.

## MCP Calls (execute in order)

### 1. Create workflow
```
nb_create_workflow("{TITLE}", "collection",
    '{"mode": 2, "collection": "{COLLECTION}", "changed": ["{STATUS_FIELD}"], "condition": {"{STATUS_FIELD}": {"$eq": "{STATUS_VALUE}"}}, "appends": []}')
```
→ Returns `wf_id`

### 2. Add update node
```
nb_add_node(wf_id, "update", "Sync Status",
    '{"collection": "{TARGET_COLLECTION}", "params": {"filter": {"{FK_FIELD}": "{{$context.data.id}}"}, "values": {"{TARGET_FIELD}": "{TARGET_VALUE}"}}}')
```

### 3. Enable
```
nb_enable_workflow(wf_id)
```
