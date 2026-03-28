# Auto Number Workflow

Generate sequential IDs like `{PREFIX}-2026-001` on record creation.

## MCP Calls (execute in order)

### 1. Create workflow
```
nb_create_workflow("{TITLE}", "collection",
    '{"mode": 1, "collection": "{COLLECTION}", "appends": [], "condition": {"$and": []}}')
```
→ Returns `wf_id`

### 2. Add SQL node
```
nb_add_node(wf_id, "sql", "Generate Number",
    '{"dataSource": "main", "sql": "UPDATE {COLLECTION} SET {FIELD} = \'{PREFIX}-\' || TO_CHAR(NOW(), \'YYYY\') || \'-\' || LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING({FIELD} FROM \'[0-9]+$\') AS INT)),0)+1 FROM {COLLECTION} WHERE {FIELD} LIKE \'{PREFIX}-\' || TO_CHAR(NOW(), \'YYYY\') || \'-%\')::TEXT, 3, \'0\') WHERE id = {{$context.data.id}}"}')
```

### 3. Enable
```
nb_enable_workflow(wf_id)
```
