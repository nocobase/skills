# Date Reminder Workflow

Trigger N days before a date field value. Used for expiry warnings, due date reminders.

## MCP Calls (execute in order)

### 1. Create workflow
```
nb_create_workflow("{TITLE}", "schedule",
    '{"mode": 1, "collection": "{COLLECTION}", "startsOn": {"field": "{DATE_FIELD}", "offset": -{DAYS_BEFORE}, "unit": 86400000}, "repeat": null, "appends": []}')
```
→ Returns `wf_id`

### 2. Add SQL node (mark record)
```
nb_add_node(wf_id, "sql", "Mark Expiring",
    '{"dataSource": "main", "sql": "UPDATE {COLLECTION} SET {STATUS_FIELD} = \'{STATUS_VALUE}\' WHERE id = {{$context.data.id}}"}')
```

### 3. Enable
```
nb_enable_workflow(wf_id)
```
