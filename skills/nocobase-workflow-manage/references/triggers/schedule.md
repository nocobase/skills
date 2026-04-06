---
title: "Scheduled Task"
description: "Trigger flows based on time rules, supporting both custom time and data table time field modes."
---

# Scheduled Task

## Trigger Type

`schedule`

## Use Cases
- Periodic tasks: scheduled cleanup, scheduled notifications, scheduled statistics.
- Triggering based on a time field of a specific record (e.g., order timeout, expiration reminder).

## Trigger Timing / Events
- Triggered when the current time satisfies the configured time conditions.
- Trigger precision is at the second level; missed time points during application downtime will not be retroactively triggered.
- This trigger operates in asynchronous execution mode (`sync=false`).

## Configuration Items
### General Configuration
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| mode | number | 0 | Yes | Trigger mode: `0` Custom Time, `1` Data Table Time Field. |

### Mode: Custom Time (mode=0)
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| startsOn | string (datetime) | - | Yes | Start time (ISO or parsable time string). If the start time has passed and no repeat rule is configured, it will not trigger again. |
| repeat | string | number | null | null | No | Repeat rule: string represents a cron expression; number represents millisecond interval. |
| endsOn | string (datetime) | null | No | End time (only effective when a repeat rule is configured). |
| limit | number | null | No | Maximum trigger count (accumulated execution count for all versions of the same workflow). |

### Mode: Data Table Time Field (mode=1)
| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| collection | string | - | Yes | Data table, format is `"<dataSource>:<collection>"`; `dataSource` can be omitted if it's the primary data source. |
| startsOn | object | - | Yes | Start time field configuration. |
| startsOn.field | string | - | Yes | The name of the time field used as the trigger baseline. |
| startsOn.offset | number | 0 | No | Offset (can be positive or negative), used in conjunction with `unit`. |
| startsOn.unit | number | 86400000 | No | Offset unit (milliseconds): `1000` for seconds, `60000` for minutes, `3600000` for hours, `86400000` for days. |
| repeat | string \| number | null | null | No | Repeat rule: cron expression or millisecond interval. |
| endsOn | string \| object | null | No | End condition: fixed time (string) or time field configuration (object, structure same as `startsOn`). |
| limit | number \| null | No | Maximum trigger count. |
| appends | string[] | [] | No | Paths of preloaded associated fields. See [Common Conventions - appends](../conventions/index.md#the-appends-field-in-trigger-and-node-configuration). |

## Trigger Variables
- `$context.date`: Trigger timestamp (Date).
- `$context.data`: Only exists in Data Table Time Field mode (mode=1), representing the triggered record data; includes associated fields preloaded via `appends`.

## Example Configuration
### Custom Time, repeat by cron expression
```json
{
  "mode": 0,
  "startsOn": "2026-02-01T09:00:00.000Z",
  "repeat": "0 */30 * * * *",
  "endsOn": "2026-06-01T00:00:00.000Z",
  "limit": 100
}
```

### Custom Time, repeat by interval
```json
{
  "mode": 0,
  "startsOn": "2026-02-01T09:00:00.000Z",
  "repeat": 1800000
}
```

### Data Table Time Field
```json
{
  "mode": 1,
  "collection": "orders",
  "startsOn": {
    "field": "createdAt",
    "offset": 30,
    "unit": 60000
  },
  "repeat": null,
  "endsOn": null,
  "appends": ["createdBy"]
}
```
