---
name: nocobase-ai-employee
description: Guide AI to create and manage NocoBase AI employees — chatbot assistants with page integration
triggers:
  - AI employee
  - AI assistant
  - ai employee
  - ai assistant
  - chatbot
  - create AI
  - avatar
  - floating button
tools:
  - nb_create_ai_employee
  - nb_list_ai_employees
  - nb_get_ai_employee
  - nb_update_ai_employee
  - nb_delete_ai_employee
  - nb_ai_shortcut
  - nb_ai_button
---

# NocoBase AI Employee Management

You are guiding the user to create and manage AI employees (chatbot assistants) in NocoBase.

## Key Concepts

### AI Employee
An AI employee is a chatbot assistant configured with:
- **username** (PK): Unique identifier, e.g. `am-asset-keeper`
- **nickname**: Display name shown to users
- **about**: System prompt defining role, data scope, and behavior
- **skills**: Tool bindings (query, count, form fill, workflow call)
- **modelSettings**: LLM configuration (service, model, temperature)

### Page Integration
AI employees appear on pages in two ways:
1. **Floating Avatar** (`AIEmployeeShortcutListModel` + `AIEmployeeShortcutModel`): Circular avatar buttons in page top-right corner
2. **Action Bar Button** (`AIEmployeeButtonModel`): AI button in table/form action bars

## Workflow

### Phase 1: Create AI Employees

```
nb_create_ai_employee("my-helper", "Assistant", "General assistant",
    "nocobase-015-male", "One-line description",
    "Full system prompt with role, data scope, behavior rules...",
    "Welcome message...",
    '[{"name":"dataSource-dataSourceQuery","autoCall":true}]')
```

### Phase 2: Add Page Shortcuts (Floating Avatars)

```
nb_ai_shortcut("tab_uid", '[
    {"username": "my-helper", "tasks": [
        {"title": "Quick Query", "message": {"user": "Help me query data"}, "autoSend": false}
    ]}
]')
```

### Phase 3: Add Block Buttons

```
nb_ai_button("table_uid", "my-helper", '[
    {"title": "Analyze Data", "message": {"user": "Analyze current data"}, "autoSend": false}
]')
```

## Available Skills (Tool Bindings)

| Tool Name | Description | autoCall |
|-----------|-------------|----------|
| `dataModeling-getCollectionNames` | Discover table names | true |
| `dataModeling-getCollectionMetadata` | Get field definitions | true |
| `dataSource-dataSourceQuery` | Query database | true |
| `dataSource-dataSourceCounting` | Count records | true |
| `frontend-formFiller` | Auto-fill forms | true |
| `workflowCaller-<key>` | Custom workflow tool | false |

## Avatar IDs

Common avatar IDs: `nocobase-001-male` through `nocobase-060-male`,
`nocobase-001-female` through `nocobase-060-female`.

## Model Settings

Default LLM configuration:
```json
{
  "llmService": "gemini",
  "model": "models/gemini-2.5-flash",
  "temperature": 0.7,
  "topP": 1,
  "timeout": 60000,
  "maxRetries": 1,
  "responseFormat": "text"
}
```

**Common adjustments:**
- `temperature: 0.3` — more deterministic, better for data queries
- `temperature: 0.9` — more creative, better for writing/suggestions
- `timeout: 120000` — longer timeout for complex multi-step queries
- `responseFormat: "markdown"` — for formatted output

## Page Integration — Complete Example

### Floating Avatar (Shortcut)
Place AI employee avatars on a page for quick access:
```
nb_ai_shortcut("tab_uid", '[
    {"username": "my-helper", "tasks": [
        {"title": "Quick Query", "message": {"user": "Look up the latest data for me"}, "autoSend": false},
        {"title": "Generate Report", "message": {"user": "Generate this month summary report"}, "autoSend": false}
    ]}
]')
```

Multiple employees on the same page:
```
nb_ai_shortcut("tab_uid", '[
    {"username": "data-analyst", "tasks": [...]},
    {"username": "form-helper", "tasks": [...]}
]')
```

### Block Button
Add AI action button to a table's action bar:
```
nb_ai_button("table_uid", "my-helper", '[
    {"title": "Analyze Selected", "message": {"user": "Analyze the currently selected records"}, "autoSend": false}
]')
```

## Best Practices

1. **Role-focused**: Each AI employee covers one business domain
2. **Progressive**: Start with basic query tools, add workflow tools later
3. **Language-aware**: Use `{{$nLang}}` in system prompts for language awareness
4. **Data scope**: Explicitly list accessible tables in the system prompt
5. **Preset tasks**: Add 1-2 quick-start tasks to shortcuts and buttons
6. **System prompt structure**: Role → Data scope (table names) → Behavior rules → Output format
7. **Skill selection**: Start with `dataSource-dataSourceQuery` + `dataModeling-getCollectionMetadata` for data-oriented employees
