# Workflow Templates Index

Each template describes an MCP tool call sequence. Read the template, replace `{PLACEHOLDER}`, execute in order.

## Templates

| File | Pattern | Trigger | Description |
|------|---------|---------|-------------|
| `auto-number.md` | Sequential ID | on create | Generate `PREFIX-YYYY-001` numbers |
| `status-sync.md` | Cascade update | on update | Update related records when status changes |
| `default-status.md` | Initial value | on create | Set default status on new records |
| `date-reminder.md` | Scheduled | date field | Trigger N days before a date |

## Placeholders

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{TITLE}` | Workflow title | `"CRM-WF01 Customer Number"` |
| `{COLLECTION}` | Trigger collection | `"nb_crm_customers"` |
| `{PREFIX}` | Number prefix | `"CU"` |
| `{FIELD}` | Field name | `"customer_no"` |
| `{STATUS_FIELD}` | Status field to watch | `"status"` |
| `{STATUS_VALUE}` | Status value to match | `"signed"` |
| `{TARGET_COLLECTION}` | Related collection to update | `"nb_crm_opportunities"` |
| `{TARGET_FIELD}` | Field to update on target | `"status"` |
| `{TARGET_VALUE}` | New value for target | `"closed"` |
| `{FK_FIELD}` | Foreign key linking records | `"customer_id"` |
| `{DATE_FIELD}` | Date field for scheduling | `"end_date"` |
| `{DAYS_BEFORE}` | Days before trigger | `30` |
