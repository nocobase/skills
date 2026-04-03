# Datetime Fields

Use this file for the full datetime family:

- `Datetime (with time zone)`
- `Datetime (without time zone)`
- `DateOnly`
- `Time`
- `Unix Timestamp`
- preset timestamp fields such as `createdAt` and `updatedAt`

## Interface-to-payload mapping

| Interface | Default type | Important payload details |
| --- | --- | --- |
| `datetime` | `date` | timezone-aware datetime; built-in field title is `Datetime (with time zone)` |
| `datetimeNoTz` | `datetimeNoTz` | no-timezone datetime; built-in field title is `Datetime (without time zone)` |
| `dateOnly` | `dateOnly` | calendar date without time; built-in field title is `DateOnly` |
| `time` | `time` | `uiSchema.x-component = "TimePicker"` |
| `unixTimestamp` | `unixTimestamp` | use only when epoch-style storage is explicitly required |
| `createdAt` | `date` | preset field; `field = "createdAt"` |
| `updatedAt` | `date` | preset field; `field = "updatedAt"` |

## Practical distinction rules

Choose the field first by business meaning, not by the label alone.

- Use `datetime` when the stored value is timezone-aware and should track absolute time across users and regions.
- Use `datetimeNoTz` when the stored value is a local wall-clock datetime and timezone conversion must not be applied.
- Use `dateOnly` when the value is only a calendar date such as birthday, due date, or contract date.
- Use `time` when only time-of-day matters.
- Use `unixTimestamp` only when the user explicitly wants epoch-based numeric storage or external integration requires it.

## Read-back and inference notes

Do not confuse create payloads with introspected or inferred read-back types.

- The ordinary `Datetime (with time zone)` field is commonly created with `interface: "datetime"` and `type: "date"`.
- Existing schemas, view inference, or some data-source flows may expose timezone-aware datetime as `datetimeTz`.
- `Datetime (without time zone)` should read back as `interface: "datetimeNoTz"` and `type: "datetimeNoTz"`.
- `DateOnly` should read back as `interface: "dateOnly"` and `type: "dateOnly"`.

## Canonical payload snippets

### Datetime with time zone

```json
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
}
```

This is the canonical built-in shape for `Datetime (with time zone)`.

### Datetime without time zone

```json
{
  "name": "localStartAt",
  "interface": "datetimeNoTz",
  "type": "datetimeNoTz",
  "defaultToCurrentTime": false,
  "onUpdateToCurrentTime": false,
  "timezone": false,
  "uiSchema": {
    "type": "string",
    "title": "Local start at",
    "x-component": "DatePicker",
    "x-component-props": {
      "showTime": true,
      "utc": false
    }
  }
}
```

Use this for values that must remain local and should not be shifted by user timezone.

### DateOnly

```json
{
  "name": "contractDate",
  "interface": "dateOnly",
  "type": "dateOnly",
  "uiSchema": {
    "type": "string",
    "title": "Contract date",
    "x-component": "DatePicker",
    "x-component-props": {
      "dateOnly": true,
      "showTime": false
    }
  }
}
```

Use `dateOnly` instead of `datetime` when the user asked for a date without time.

### Time

```json
{
  "name": "officeStartTime",
  "interface": "time",
  "type": "time",
  "uiSchema": {
    "type": "string",
    "title": "Office start time",
    "x-component": "TimePicker"
  }
}
```

### Unix timestamp

```json
{
  "name": "eventTs",
  "interface": "unixTimestamp",
  "type": "unixTimestamp",
  "accuracy": "second",
  "timezone": true,
  "defaultToCurrentTime": false,
  "onUpdateToCurrentTime": false,
  "uiSchema": {
    "type": "number",
    "title": "Event timestamp",
    "x-component": "UnixTimestamp",
    "x-component-props": {
      "showTime": true
    },
    "x-validator": "timestamp"
  }
}
```

Use unix timestamp only when the user explicitly wants epoch-style storage. Otherwise use the regular datetime interfaces.

### Created at

```json
{
  "name": "createdAt",
  "interface": "createdAt",
  "type": "date",
  "field": "createdAt",
  "uiSchema": {
    "type": "datetime",
    "title": "Created at",
    "x-component": "DatePicker",
    "x-component-props": {},
    "x-read-pretty": true
  }
}
```

### Updated at

```json
{
  "name": "updatedAt",
  "interface": "updatedAt",
  "type": "date",
  "field": "updatedAt",
  "uiSchema": {
    "type": "datetime",
    "title": "Last updated at",
    "x-component": "DatePicker",
    "x-component-props": {},
    "x-read-pretty": true
  }
}
```

## Anti-drift rules

- do not forget `field` on `createdAt` and `updatedAt`
- do not use plain text fields for temporal values that need date or time semantics
- do not use `datetime` when the user explicitly asked for `DateOnly`
- do not use `datetime` when the user explicitly asked for `Datetime (without time zone)`
- do not drop timezone-related props when the business object is schedule-oriented
- do not use unix timestamp when ordinary datetime fields are the clearer business model
- do not assume `date`, `datetimeTz`, and `datetimeNoTz` are interchangeable
