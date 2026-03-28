---
title: "Page Building Research: Detail Blocks & Tab Structure"
description: "Quick reference for DetailsBlockModel full subtree, DetailsItemModel field mapping, nested sub-tables, and multi-Tab implementation patterns"
tags: [nocobase, builder-toolkit, page-building, research]
type: reference
status: active
updated: "2026-02-26"
sidebar:
  order: 14
---

## Quick Reference Summary

| Topic | Conclusion |
|-------|-----------|
| Detail block tree | `DetailsBlockModel -> DetailsGridModel -> DetailsItemModel -> Display*FieldModel` |
| DetailsGridModel role | Controls field row/column layout; rows define row/column UIDs, sizes define column widths (totaling 24) |
| Field render model | Automatically determined by `field.interface`; 9 Display*FieldModel variants |
| Association field display | Use `fieldNames.label` to specify which field from the associated table to display |
| Sub-table pattern A | Sibling TableBlockModel under the same BlockGridModel, using `associationName` + `sourceId` |
| Sub-table pattern B | DisplaySubItemFieldModel: embedded DetailsGridModel for hasOne/belongsTo sub-objects |
| Sub-table pattern C | DisplaySubTableFieldModel: for belongsToMany/hasMany array fields |
| Route-level tabs | flowPage route's tabs child routes; each tab has an independent schemaUid -> RouteModel -> BlockGridModel |
| Popup-level tabs | ChildPageModel(enableTabs=true) -> multiple ChildPageTabModel -> each with its own BlockGridModel |
| Divider | DividerItemModel, can include a title |

## Required vs Inferable Parameters

### DetailsBlockModel

| Parameter | Required? | Inference Rule |
|-----------|-----------|---------------|
| `collectionName` | **Required** | -- |
| `filterByTk` | Inferable | For detail pages, always `"{{ctx.view.inputArgs.filterByTk}}"` |
| `dataSourceKey` | Inferable | Always `"main"` |
| `cardSettings.titleDescription.title` | Optional | Omit for no title |
| `subKey` | Inferable | Always `"items"` |
| `subType` | Inferable | Always `"array"` |

### DetailsGridModel

| Parameter | Required? | Inference Rule |
|-----------|-----------|---------------|
| `gridSettings.grid.rows` | **Required** | Generated from layout description |
| `gridSettings.grid.sizes` | **Required** | Column widths per row; defaults to 24 divided evenly by column count |
| `subKey` | Inferable | Always `"grid"` |
| `subType` | Inferable | Always `"object"` |

### DetailsItemModel

| Parameter | Required? | Inference Rule |
|-----------|-----------|---------------|
| `fieldSettings.init.collectionName` | **Required** | Must match parent DetailsBlockModel |
| `fieldSettings.init.fieldPath` | **Required** | -- |
| `fieldSettings.init.dataSourceKey` | Inferable | Always `"main"` |
| `detailItemSettings.model.use` | Inferable | Mapped from `field.interface` |
| `detailItemSettings.fieldNames.label` | Conditionally required | Required for association fields; can be inferred from dot notation or titleField |
| `subKey` | Inferable | Always `"items"` |
| `subType` | Inferable | Always `"array"` |
| `sortIndex` | Inferable | Auto-numbered by field list order |

### Display*FieldModel (Child Model of DetailsItemModel)

| Parameter | Required? | Inference Rule |
|-----------|-----------|---------------|
| `use` (model type) | Inferable | Mapped from `field.interface` (see mapping table below) |
| `subKey` | Inferable | Always `"field"` |
| `subType` | Inferable | Always `"object"` |

### ChildPageModel (Multi-Tab Popup)

| Parameter | Required? | Inference Rule |
|-----------|-----------|---------------|
| `pageSettings.general.enableTabs` | **Required** | Set to `true` when multiple tabs are needed |
| `pageSettings.general.displayTitle` | Optional | Default `false` |
| `subKey` | Inferable | Always `"page"` |
| `subType` | Inferable | Always `"object"` |

### ChildPageTabModel

| Parameter | Required? | Inference Rule |
|-----------|-----------|---------------|
| `pageTabSettings.tab.title` | **Required** | -- |
| `subKey` | Inferable | Always `"tabs"` |
| `subType` | Inferable | Always `"array"` |

## field.interface -> Display*FieldModel Mapping

| interface | Display Model | Notes |
|-----------|--------------|-------|
| `input` | DisplayTextFieldModel | |
| `textarea` | DisplayTextFieldModel | |
| `sequence` | DisplayTextFieldModel | |
| `select` | DisplayEnumFieldModel | |
| `radioGroup` | DisplayEnumFieldModel | |
| `createdAt` | DisplayDateTimeFieldModel | |
| `updatedAt` | DisplayDateTimeFieldModel | |
| `datetime` | DisplayDateTimeFieldModel | |
| `vditor` | DisplayVditorFieldModel | |
| `checkbox` | DisplayCheckboxFieldModel | |
| `m2o` (belongsTo) | DisplayNumberFieldModel | Requires `fieldNames.label` |
| `o2o` (hasOne) | DisplaySubItemFieldModel | Embedded sub-form |
| `m2m` (belongsToMany) | DisplayPreviewFieldModel | File scenario |
| `mbm` (belongsToArray) | DisplaySubTableFieldModel | Array association |
| `date` | DisplayDateFieldModel | Date only (dateOnly type) |
| `number` / `integer` / `percent` | DisplayNumberFieldModel | |
| `color` | DisplayTextFieldModel | Color value string |

> The mapping is automatically determined by the source code `CollectionFieldModel.getDefaultBindingByField()`, which looks up the `bindings` registry based on `interface` and handles association fields with the `fallbackToTargetTitleField` option.

## Actual Data Validated from DB

### DetailsBlockModel Full Example

```json
{
  "use": "DetailsBlockModel",
  "stepParams": {
    "resourceSettings": {
      "init": {
        "dataSourceKey": "main",
        "collectionName": "nb_tts_customers",
        "filterByTk": "{{ctx.view.inputArgs.filterByTk}}"
      }
    },
    "cardSettings": {
      "titleDescription": { "title": "Basic Information" }
    }
  },
  "parentId": "<BlockGridModel_uid>",
  "subKey": "items", "subType": "array",
  "sortIndex": 0
}
```

### DetailsGridModel Layout Example

```json
{
  "use": "DetailsGridModel",
  "stepParams": {
    "gridSettings": {
      "grid": {
        "rows": {
          "row_key_1": [["uid_a", "uid_b", "uid_c"]],
          "row_key_2": [["uid_d"]]
        },
        "sizes": {
          "row_key_1": [8, 8, 8],
          "row_key_2": [24]
        }
      }
    }
  },
  "parentId": "<DetailsBlockModel_uid>",
  "subKey": "grid", "subType": "object"
}
```

> Each key in `rows` is a row identifier (random string); its value is a 2D array `[[col1_uid, col2_uid]]`; `sizes` provides corresponding column widths (totaling 24).

### DetailsItemModel -- Plain Text Field

```json
{
  "use": "DetailsItemModel",
  "stepParams": {
    "fieldSettings": {
      "init": {
        "dataSourceKey": "main",
        "collectionName": "nb_tts_customers",
        "fieldPath": "company_name"
      }
    },
    "detailItemSettings": {
      "model": { "use": "DisplayTextFieldModel" }
    }
  },
  "parentId": "<DetailsGridModel_uid>",
  "subKey": "items", "subType": "array", "sortIndex": 0
}
```

### DetailsItemModel -- Association Field (belongsTo)

```json
{
  "use": "DetailsItemModel",
  "stepParams": {
    "fieldSettings": {
      "init": {
        "dataSourceKey": "main",
        "collectionName": "nb_tts_tickets",
        "fieldPath": "assignee"
      }
    },
    "detailItemSettings": {
      "model": { "use": "DisplayNumberFieldModel" },
      "fieldNames": { "label": "nickname" }
    }
  },
  "parentId": "<DetailsGridModel_uid>",
  "subKey": "items", "subType": "array", "sortIndex": 3
}
```

### DividerItemModel -- Divider Line

```json
{
  "use": "DividerItemModel",
  "stepParams": {
    "markdownItemSetting": {
      "title": {
        "label": "Address",
        "orientation": "left",
        "color": "rgba(0, 0, 0, 0.88)",
        "borderColor": "rgba(5, 5, 5, 0.06)"
      }
    }
  },
  "parentId": "<DetailsGridModel_uid>",
  "subKey": "items", "subType": "array", "sortIndex": 7
}
```

### Association Table (TableBlockModel as Sibling Node)

```json
{
  "use": "TableBlockModel",
  "stepParams": {
    "resourceSettings": {
      "init": {
        "dataSourceKey": "main",
        "collectionName": "nb_tts_customer_contacts",
        "associationName": "nb_tts_customers.contacts",
        "sourceId": "{{ctx.view.inputArgs.filterByTk}}"
      }
    },
    "cardSettings": {
      "titleDescription": { "title": "Contacts" }
    }
  },
  "parentId": "<BlockGridModel_uid>",
  "subKey": "items", "subType": "array", "sortIndex": 2
}
```

### ChildPageModel -- Multi-Tab

```json
{
  "use": "ChildPageModel",
  "stepParams": {
    "pageSettings": {
      "general": { "displayTitle": false, "enableTabs": true }
    }
  },
  "parentId": "<parent>-detail",
  "subKey": "page", "subType": "object", "sortIndex": 0
}
```

### ChildPageTabModel

```json
{
  "use": "ChildPageTabModel",
  "stepParams": {
    "pageTabSettings": {
      "tab": { "title": "Details" }
    }
  },
  "parentId": "<ChildPageModel_uid>",
  "subKey": "tabs", "subType": "array", "sortIndex": 0
}
```

## Three Patterns for Sub-Tables / Nested Data

### Pattern A: Siblings Within BlockGridModel (Recommended for Associated Collections)

```
BlockGridModel
├── DetailsBlockModel  (main record details)
└── TableBlockModel    (associated record table, using associationName + sourceId)
```

Example: Customer detail page BlockGridModel (`85d594ac88f`) contains:
- DetailsBlockModel: `nb_tts_customers` (Basic Info)
- TableBlockModel: `nb_tts_customer_contacts` + `associationName: "nb_tts_customers.contacts"`

BlockGridModel layout places them in the same row with different columns:
```json
"rows": { "4js6esruuo0": [["detail_uid", "js_uid", "table_uid"], ["detail2_uid"]] },
"sizes": { "4js6esruuo0": [16, 8] }
```

### Pattern B: DisplaySubItemFieldModel (hasOne/belongsTo Sub-Object)

```
DetailsItemModel (fieldPath="repair")
└── DisplayNumberFieldModel
    └── DetailsGridModel
        ├── DetailsItemModel (field=repair.device_name)
        └── DetailsItemModel (field=repair.fault_code)
```

fieldPath uses dot notation: `repair.device_name`.

### Pattern C: DisplaySubTableFieldModel (belongsToMany Array)

Used directly as the display model of DetailsItemModel, no extra configuration needed:
```json
{
  "detailItemSettings": {
    "model": { "use": "DisplaySubTableFieldModel" }
  }
}
```

## Tab Structure Quick Reference

### Route-Level Tabs (Top-Level Pages)

```
desktopRoute(type=flowPage, schemaUid=X)
  └── desktopRoute(type=tabs, schemaUid=Y)
       FlowModel: Y {"schema":{"use":"RouteModel"}}
         └── BlockGridModel(subKey=grid) -> blocks...
```

All flowPages in the current CRM demo have only 1 tab child route. Multiple tabs require creating multiple tabs child routes.

### ChildPageModel-Level Tabs (Popups / Sub-Pages)

```
ChildPageModel (enableTabs=true)
├── ChildPageTabModel (title="Details", sortIndex=0)
│   └── BlockGridModel -> [blocks...]
├── ChildPageTabModel (title="Ticket History", sortIndex=1)
│   └── BlockGridModel -> [blocks...]
└── ChildPageTabModel (title="Operation History", sortIndex=2)
    └── BlockGridModel -> [blocks...]
```

Example: Customer detail popup `cc2783d14cf`, with 3 tabs each having an independent BlockGridModel.

## API Detail Block Creation -- Practical Validation

### flowModels:save API Format (Key Pitfall)

**Correct format**: Model fields (`use`, `stepParams`, `parentId`, etc.) go at the **top level** of the request body; do NOT nest them inside `options`.

```bash
# Correct -- use/stepParams/parentId at top level
curl -X POST '/api/flowModels:save' -d '{
  "uid": "my_block",
  "use": "DetailsBlockModel",
  "stepParams": {...},
  "parentId": "parent_uid",
  "subKey": "items",
  "subType": "array",
  "sortIndex": 0
}'

# Wrong -- causes double nesting {"options":{"use":...}}, model won't take effect
curl -X POST '/api/flowModels:save' -d '{
  "uid": "my_block",
  "options": { "use": "DetailsBlockModel", ... }
}'
```

### flowModels:update API Format

`update` wraps in `options`, but note: **update does NOT rebuild flowModelTreePath**. If you need to move a node to a new parent, you must destroy + save to rebuild.

```bash
curl -X PUT '/api/flowModels:update?filterByTk=uid' -d '{
  "options": {
    "use": "...",
    "stepParams": {...},
    "parentId": "new_parent",
    ...
  }
}'
```

### Creation Order

Must create top-down in dependency order, because save builds flowModelTreePath:

1. DetailsBlockModel (parentId = BlockGridModel)
2. DetailsGridModel (parentId = DetailsBlockModel)
3. DetailsItemModel x N (parentId = DetailsGridModel)
4. Display*FieldModel x N (parentId = DetailsItemModel)
5. Finally update BlockGridModel's `gridSettings.grid.rows/sizes` to reference all block UIDs

### Actual PM Project Detail Page Created

Created a complete detail block under `ca3defbb512` (BlockGridModel):

```
ChildPageModel (5147ebc0eac, enableTabs=true)
└── ChildPageTabModel (12646abd5a9, title="Details")
    └── BlockGridModel (ca3defbb512)
        └── DetailsBlockModel (pm_det_blk, collection=nb_pm_projects)
            └── DetailsGridModel (pm_det_grid)
                ├── r1: [name(12), code(12)]
                ├── r2: [status(8), priority(8), progress(8)]
                ├── r3: [category.name(12), team.name(12)]
                ├── r4: [start_date(8), end_date(8), budget(8)]
                └── r5: [description(24)]
```

### Key Finding: ChildPageModel's parentId Determines the Entry Point

- `parentId = AddNewActionModel uid` -> Popup opened by clicking the "Add New" button
- `parentId = DisplayTextFieldModel uid` (table column field) -> Detail page opened by clicking a table row

You must confirm which action/field the ChildPageModel's parentId points to in order to determine which entry point the popup belongs to.

### Date Field interface Mapping

| field.type | field.interface | Detail Display Model | Note |
|---|---|---|---|
| `date` | `createdAt`/`updatedAt` | DisplayDateTimeFieldModel | Includes time |
| `date` | `datetime` | DisplayDateTimeFieldModel | Includes time |
| `dateOnly` | `date` | DisplayDateFieldModel | Date only, no time |

Note that `dateOnly` type uses `DisplayDateFieldModel` (not DateTime).

## Source Code References

| File | Key Content |
|------|------------|
| `packages/core/client/src/flow/models/blocks/details/DetailsBlockModel.tsx:33` | `DetailsBlockModel extends CollectionBlockModel`, subModels definition |
| `packages/core/client/src/flow/models/blocks/details/DetailsItemModel.tsx:61` | `DetailsItemModel extends DisplayItemModel`, defineChildren auto-infers fields |
| `packages/core/client/src/flow/models/blocks/details/DetailsItemModel.tsx:71` | `getDefaultBindingByField` call, `fallbackToTargetTitleField: true` |
| `packages/core/client/src/flow/models/blocks/details/DetailsItemModel.tsx:84-101` | `createModelOptions` -- generates complete options for DetailsItemModel |
| `packages/core/client/src/flow/models/blocks/details/DetailsGridModel.tsx:17` | `DetailsGridModel extends GridModel`, manages field layout |
| `packages/core/flow-engine/src/models/CollectionFieldModel.tsx:199` | `getDefaultBindingByField` core method: interface -> ModelBinding mapping |
| `packages/core/client/src/flow/models/base/PageModel/ChildPageModel.tsx:18` | `ChildPageModel extends PageModel`, enableTabs controls multi-tab |
| `packages/core/client/src/flow/models/base/PageModel/PageTabModel.tsx:37` | `BasePageTabModel`, tab title via `stepParams.pageTabSettings.tab.title` |

## Related Documents

- [Page Building Overview](/300000-projects/300008-nocobase-builder/02-page-building/)
- [Page Building Research: Actions & Popups](/300000-projects/300008-nocobase-builder/02-page-building/research-actions/)
- [Page Building Research: Forms & Validation](/300000-projects/300008-nocobase-builder/02-page-building/research-forms/)
- [Page Building Research: Layouts & Multi-Block](/300000-projects/300008-nocobase-builder/02-page-building/research-layouts/)
