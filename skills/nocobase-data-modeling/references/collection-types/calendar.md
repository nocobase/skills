# Calendar Collection

Use when the record is primarily schedule-oriented and should be managed or displayed on a calendar.

Key rules:

- Confirm the app actually needs calendar semantics instead of a plain table with date fields.
- Inspect existing calendar plugin capability before creation.
- Do not guess event-specific business fields; add them after the calendar baseline is confirmed.
- In the compact `collections apply` flow, do not send built-in audit flags or expanded template fields unless the active command help explicitly requires them.
- Treat template defaults such as calendar-owned fields as server-managed defaults for creation, then add only business fields that are not implied by the template.
- Each business field still needs an explicit `interface`.

Good fits for `calendar`:

- meetings
- appointments
- shifts
- booking schedules
- recurring event records

Bad fits for `calendar`:

- ordinary tables that only happen to contain a date field
- records whose main behavior is transactional rather than schedule-oriented

Calendar request baseline:

- treat this file as a create-request reference, not as read-back metadata;
- for compact CLI usage, prefer template name plus business fields, not preset-field flags or duplicated expanded defaults;
- do not copy metadata-only fields such as auto-generated read-back structure into the create request.
- `cron` and `exclude` are template-default fields for the built-in calendar template;
- treat them as the canonical calendar-template baseline, not as a universal law for every possible custom calendar-like schema.

## Preferred compact request

```json
{
  "name": "appointments",
  "title": "Appointments",
  "template": "calendar",
  "fields": [
    {
      "name": "subject",
      "title": "Subject",
      "interface": "input"
    },
    {
      "name": "startAt",
      "title": "Start at",
      "interface": "datetime"
    },
    {
      "name": "endAt",
      "title": "End at",
      "interface": "datetime"
    }
  ]
}
```

In normal compact creation, do not manually send `cron`, `exclude`, or audit flags unless the task is explicitly about customizing those existing template-owned parts.

```json
{
  "name": "example_calendar",
  "title": "Example calendar",
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
        "title": "{{t(\"Repeats\")}}",
        "x-component": "CronSet",
        "x-component-props": "allowClear",
        "enum": [
          { "label": "{{t(\"Daily\")}}", "value": "0 0 0 * * ?" },
          { "label": "{{t(\"Weekly\")}}", "value": "every_week" },
          { "label": "{{t(\"Monthly\")}}", "value": "every_month" },
          { "label": "{{t(\"Yearly\")}}", "value": "every_year" }
        ]
      }
    },
    {
      "name": "exclude",
      "type": "json"
    }
  ]
}
```

In this request shape, the preset audit fields come from the boolean flags:

- `createdBy: true`
- `updatedBy: true`
- `createdAt: true`
- `updatedAt: true`

Do not redundantly duplicate those preset fields in the same create request unless the current API path explicitly requires fully expanded preset-field payloads.

## Template-default fields

For the built-in calendar template, the default template-specific fields are:

- `cron`
- `exclude`

How to interpret them:

- `cron` represents recurrence behavior and is part of the built-in calendar template default;
- `exclude` stores excluded recurrence dates or exception data and is also part of the built-in calendar template default;
- when the task is to create a collection by following the built-in `calendar` template, include both fields in the baseline request;
- do not overstate this as proof that every custom schedule table in every context must always contain these exact two fields.

After the baseline is confirmed, add the business-specific date, title, participant, and relation fields needed by the user.

Recommended extension pattern after the baseline:

- title field
- start and end datetime fields if the business object needs them
- owner or participant relations
- color, status, or category fields only after the scheduling core is correct

## Expanded structure example: appointments calendar

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
        "title": "{{t(\"Repeats\")}}",
        "x-component": "CronSet",
        "x-component-props": "allowClear",
        "enum": [
          { "label": "{{t(\"Daily\")}}", "value": "0 0 0 * * ?" },
          { "label": "{{t(\"Weekly\")}}", "value": "every_week" },
          { "label": "{{t(\"Monthly\")}}", "value": "every_month" },
          { "label": "{{t(\"Yearly\")}}", "value": "every_year" }
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
          { "value": "done", "label": "Done" }
        ]
      }
    }
  ]
}
```
