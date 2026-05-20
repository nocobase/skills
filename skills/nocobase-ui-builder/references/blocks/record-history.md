---
title: RecordHistoryBlockModel
description: Public Flow Surfaces contract for collection and current-record history blocks.
---

# RecordHistoryBlockModel

## When To Use

Use public block type `recordHistory` when the requested UI is record history, audit history, change history, or a history timeline.

Aliases include:

- 历史记录 / 记录历史 / 审计历史 / 变更历史
- record history / audit history / change history

Always inspect `catalog` for localized writes before adding it to a live target. If `catalog.blocks` does not expose `RecordHistoryBlockModel`, do not guess raw schema or internal `stepParams`.

## Public Creation Contract

Supported public writes:

- `applyBlueprint` block type: `recordHistory`
- localized `compose`, `add-block`, and `add-blocks` block type: `recordHistory`

Never use raw model names, raw `props`, raw `decoratorProps`, raw `stepParams`, or raw schema to create the block.

Collection history uses a normal collection resource:

```json
{
  "type": "recordHistory",
  "collection": "orders",
  "settings": {
    "title": "History",
    "sortOrder": { "order": "desc" },
    "expand": { "expand": true },
    "template": { "apply": "current" }
  }
}
```

Localized collection history:

```json
{
  "target": { "uid": "tab-schema-uid" },
  "type": "recordHistory",
  "resourceInit": {
    "dataSourceKey": "main",
    "collectionName": "orders"
  },
  "settings": {
    "title": "History",
    "sortOrder": { "order": "desc" }
  }
}
```

The collection must declare a real `filterTargetKey`. Internal history collections `recordHistories` and `recordFieldHistories` are not valid targets.

## Current Record Popup Contract

Current-record history is only valid in one-record popup/details scenes:

```json
{
  "target": { "uid": "record-popup-uid" },
  "type": "recordHistory",
  "resource": {
    "binding": "currentRecord"
  },
  "settings": {
    "title": "Current record history",
    "expand": { "expand": true }
  }
}
```

Backend authoring persists the current-record binding as `recordHistorySettings.recordId.recordId = "{{ctx.view.inputArgs.filterByTk}}"` and does not keep `filterByTk` in the resource init. Do not write this internal shape yourself.

Association resources are not supported for record history. `resource.binding: "associatedRecords"` is invalid.

## Configure Contract

Supported `configure.changes` keys:

- `title`
- `description`
- `resource`
- `sortOrder.order`: `"asc"` or `"desc"`
- `dataScope`
- `expand.expand`: boolean
- `template.apply`: only `"current"`

`refresh` is a runtime action, not a persisted public configuration key.

```json
{
  "target": { "uid": "record-history-block-uid" },
  "changes": {
    "title": "Verification history",
    "sortOrder": { "order": "asc" },
    "expand": { "expand": true },
    "template": { "apply": "current" }
  }
}
```

## Readback Checks

Successful readback should contain:

- `RecordHistoryBlockModel`
- `resourceSettings.init.dataSourceKey`
- `resourceSettings.init.collectionName`
- for current-record popup history, `recordHistorySettings.recordId.recordId = "{{ctx.view.inputArgs.filterByTk}}"`

If record history renders empty, check the record-history plugin, the target collection's `filterTargetKey`, history data, and the current-record `recordId` binding.
