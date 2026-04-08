# Model Pack: Calendar Appointments

Use this pack when the business object is fundamentally schedule-oriented and should be represented as a calendar collection rather than a plain table with date fields.

Collection choice:

- `appointments` -> `calendar`

Compact reduction:

- create `appointments` with `template: "calendar"` plus only business fields such as `title`, `startAt`, `endAt`, `status`, and `notes`;
- do not manually include `cron`, `exclude`, or audit flags in the compact create request unless the task is explicitly about those template-owned defaults;
- treat the expanded JSON below as structure reference or read-back shape.

## Table: appointments

```json
{
  "name": "appointments",
  "title": "Appointments",
  "logging": true,
  "template": "calendar",
  "createdBy": true,
  "updatedBy": true,
  "createdAt": true,
  "updatedAt": true,
  "sortable": true,
  "fields": [
    {
      "name": "cron",
      "type": "string",
      "interface": "select",
      "uiSchema": {
        "type": "string",
        "title": "Repeats",
        "x-component": "CronSet",
        "x-component-props": "allowClear",
        "enum": [
          { "label": "Daily", "value": "0 0 0 * * ?" },
          { "label": "Weekly", "value": "every_week" },
          { "label": "Monthly", "value": "every_month" },
          { "label": "Yearly", "value": "every_year" }
        ]
      }
    },
    {
      "name": "exclude",
      "type": "json"
    },
    {
      "name": "title",
      "interface": "input",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Title",
        "x-component": "Input"
      }
    },
    {
      "name": "startAt",
      "interface": "datetime",
      "type": "date",
      "defaultToCurrentTime": false,
      "onUpdateToCurrentTime": false,
      "timezone": true,
      "uiSchema": {
        "type": "string",
        "title": "Start at",
        "x-component": "DatePicker",
        "x-component-props": {
          "showTime": true,
          "utc": true
        }
      }
    },
    {
      "name": "endAt",
      "interface": "datetime",
      "type": "date",
      "defaultToCurrentTime": false,
      "onUpdateToCurrentTime": false,
      "timezone": true,
      "uiSchema": {
        "type": "string",
        "title": "End at",
        "x-component": "DatePicker",
        "x-component-props": {
          "showTime": true,
          "utc": true
        }
      }
    },
    {
      "name": "status",
      "interface": "select",
      "type": "string",
      "uiSchema": {
        "type": "string",
        "title": "Status",
        "x-component": "Select",
        "enum": [
          { "value": "planned", "label": "Planned" },
          { "value": "confirmed", "label": "Confirmed" },
          { "value": "done", "label": "Done" },
          { "value": "cancelled", "label": "Cancelled" }
        ]
      }
    },
    {
      "name": "notes",
      "interface": "textarea",
      "type": "text",
      "uiSchema": {
        "type": "string",
        "title": "Notes",
        "x-component": "Input.TextArea"
      }
    }
  ]
}
```

Verification focus:

- the collection is really `calendar`, not `general`
- template-default recurrence fields exist when the built-in calendar template is intended
- `startAt` and `endAt` are true datetime fields
- audit fields created from flags are actually present in metadata
