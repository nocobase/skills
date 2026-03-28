# Default Status Workflow

Set a default status value when a new record is created.

## MCP Calls (execute in order)

### 1. Create workflow
```
nb_create_workflow("{TITLE}", "collection",
    '{"mode": 1, "collection": "{COLLECTION}", "appends": [], "condition": {"$and": []}}')
```
→ Returns `wf_id`

### 2. Add update node
```
nb_add_node(wf_id, "update", "Set Default",
    '{"collection": "{COLLECTION}", "params": {"filter": {"id": "{{$context.data.id}}"}, "values": {"{STATUS_FIELD}": "{STATUS_VALUE}"}}}')
```

### 3. Enable
```
nb_enable_workflow(wf_id)
```
