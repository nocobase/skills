---
title: "Page Building Research: Grid Layout and Page Structure"
description: "Quick reference for BlockGridModel gridSettings format, sizes grid system, multi-block layouts, FilterManager filter connections, and RootPageModel page configuration"
tags: [nocobase, builder-toolkit, page-building, research]
type: reference
status: active
updated: "2026-02-26"
sidebar:
  order: 10
---

## Quick Reference Table

| Topic | Conclusion |
|-------|-----------|
| Grid system | Ant Design 24-column grid, `<Row>` + `<Col span={size}>`, not CSS Grid |
| gridSettings path | `options.stepParams.gridSettings.grid.{rows, sizes, rowOrder}` |
| rows format | `Record<rowId, string[][]>` — first dimension=columns, second dimension=block UIDs stacked vertically within a column |
| sizes format | `Record<rowId, number[]>` — width per column, total=24 |
| Default size | New block `[24]` (takes full row), auto-splits evenly when no sizes specified |
| Common sizes | `[24]`(46x) `[12,12]`(3x) `[16,8]`(6x) `[6,6,6,6]`(1x) |
| FilterManager | On BlockGridModel top-level `options.filterManager` (not in stepParams) |
| pageSettings | `stepParams.pageSettings.general.{displayTitle, enableTabs, title, documentTitle}` |
| Page defaults | `displayTitle=true, enableTabs=false` |
| Mobile | `transformRowsToSingleColumn()` auto-expands to single column |
| Page tree | Route → RootPageModel → tabs[RootPageTabModel] → grid[BlockGridModel] → items[blocks] |

## Required vs Inferable Parameters

### RootPageModel

| Parameter | Required? | Description |
|-----------|-----------|-------------|
| pageSettings.general.displayTitle | No | Default `true` |
| pageSettings.general.enableTabs | No | Default `false` |
| pageSettings.general.title | No | Can inherit from route title |
| pageSettings.general.documentTitle | No | Browser tab title, supports variable templates |

### BlockGridModel

| Parameter | Required? | Description |
|-----------|-----------|-------------|
| gridSettings.grid.rows | No | Auto-generated from items sub-models, each block gets its own row |
| gridSettings.grid.sizes | No | Default `[24]`; auto-splits evenly `24/colCount` when absent |
| gridSettings.grid.rowOrder | No | Inferred from rows key order |
| filterManager | Only when FilterFormBlock exists | Configures filter block → target block connections |

### FilterManager (BlockGridModel top-level property)

| Parameter | Required? | Description |
|-----------|-----------|-------------|
| filterId | Yes | UID of the filter block |
| targetId | Yes | UID of the target block |
| filterPaths | Yes | Array of field paths participating in filtering |

### FilterFormBlockModel

| Parameter | Required? | Description |
|-----------|-----------|-------------|
| formFilterBlockModelSettings.layout.layout | No | Default `"horizontal"` |
| formFilterBlockModelSettings.layout.labelAlign | No | Default `"left"` |
| formFilterBlockModelSettings.layout.labelWidth | No | Default 120 |
| formFilterBlockModelSettings.layout.labelWrap | No | Default `false` |
| formFilterBlockModelSettings.layout.colon | No | Default `true` |

**Conclusion: FilterFormBlockModel itself has zero required parameters.** The key configuration is in BlockGridModel.filterManager.

## DB-Verified Real Data

### gridSettings Examples

**Dashboard (6 charts + 1 JS)** — uid `eb164e3a724`:
```json
{
  "rows": {
    "6yd0ha9rzgz": [["23c83f65fd7"]],
    "nnh70squbyi": [["97eddeb80df"]],
    "kma6u17k8bj": [["e42abbeb18e"], ["63451d4e3da"]],
    "fma9zq744za": [["a76469315e4"]],
    "rqwwk7ccgg1": [["e36cdc65834", "387068c58a3"]]
  },
  "sizes": {
    "6yd0ha9rzgz": [24],
    "nnh70squbyi": [24],
    "kma6u17k8bj": [12, 12],
    "fma9zq744za": [24],
    "rqwwk7ccgg1": [24]
  }
}
```

Interpretation:
```
Row 1 [24]    → JSBlockModel
Row 2 [24]    → ChartBlockModel
Row 3 [12,12] → ChartBlockModel | ChartBlockModel   ← equal split left/right
Row 4 [24]    → ChartBlockModel
Row 5 [24]    → [Chart, Chart] stacked vertically
```

**Filter + List page** — uid `3d2f1552d8c`:
```json
{
  "rows": {
    "vj773c18ci5": [["c56e7957df9"]],
    "bb08bp7maoo": [["321d80e6205", "9843f802ebc", "26741542966"], ["c76d7e8e86c"]]
  },
  "sizes": {
    "bb08bp7maoo": [17, 7]
  }
}
```

Interpretation:
```
Row 1 [default 24] → FilterFormBlockModel
Row 2 [17, 7]      → [JSBlock + ReferenceBlock + ListBlock] | [ActionPanelBlock]
```

### FilterManager Example

```json
[
  {
    "filterId": "f77eba003ab",
    "targetId": "9843f802ebc",
    "filterPaths": ["ticket_no", "title", "description", "contact_name", "contact_phone", "contact_email"]
  },
  {
    "filterId": "f77eba003ab",
    "targetId": "26741542966",
    "filterPaths": ["question", "answer", "category"]
  }
]
```

A single filter block can connect to multiple target blocks simultaneously.

### pageSettings Examples

```json
// Most pages are null (using defaults displayTitle=true, enableTabs=false)
// Custom examples:
{"general": {"displayTitle": true, "enableTabs": false, "title": "My tickets"}}
{"general": {"displayTitle": false, "enableTabs": false}}
```

### sizes Statistics (Full Database)

| Configuration | Count | Meaning |
|---------------|-------|---------|
| `[24]` | 46 | Single column, full row |
| `[16, 8]` | 6 | Left 2/3, right 1/3 |
| `[12, 12]` | 3 | Equal split left/right |
| `[11, 13]` | 2 | Near-equal, slightly wider right |
| `[10, 14]` | 1 | Narrow left, wide right |
| `[15, 9]` | 1 | 5:3 ratio |
| `[7, 17]` | 1 | Sidebar + main content |
| `[17, 7]` | 1 | Main content + sidebar |
| `[6, 6, 6, 6]` | 1 | Four equal columns |

## Source Code Confirmation

### Core Files

| File | Responsibility |
|------|---------------|
| `packages/core/client/src/flow/models/base/GridModel.tsx` | Grid core: rows/sizes management, drag & drop, resize, layout persistence |
| `packages/core/client/src/flow/models/base/BlockGridModel.tsx` | Page-level grid, extends GridModel, adds FilterManager |
| `packages/core/client/src/flow/components/Grid/index.tsx` | Rendering component, Ant `<Row>/<Col>` |
| `packages/core/client/src/flow/models/base/PageModel/PageModel.tsx` | pageSettings flow definition (L347-433) |
| `packages/core/client/src/flow/models/base/PageModel/RootPageModel.tsx` | Root page, route binding + Tab initialization |
| `packages/core/client/src/flow/models/blocks/filter-form/FilterFormBlockModel.tsx` | Filter form block |

### Key Code Snippets

**Default width for new blocks** — `GridModel.tsx:181`:
```typescript
newSizes[position.rowId] = [24]; // Default new row width is 24
```

**Grid rendering span calculation** — `Grid/index.tsx:49-57`:
```typescript
const spans = cells.map((_, cellIdx) => {
  if (hasAnySize) {
    const assigned = rowSizes.reduce((sum, v) => sum + (v || 0), 0);
    const unassignedCount = colCount - rowSizes.filter(Boolean).length;
    const autoSize = unassignedCount > 0 ? (24 - assigned) / unassignedCount : 0;
    return rowSizes[cellIdx] ?? autoSize;
  } else {
    return 24 / colCount;
  }
});
```

**Mobile single-column conversion** — `GridModel.tsx:817-833`:
```typescript
export function transformRowsToSingleColumn(rows) {
  // Expand all columns into independent rows, one column per row
  Object.keys(rows).forEach((rowId) => {
    rows[rowId].forEach((column) => {
      singleColumnRows[uid()] = [filtered];
    });
  });
}
```

**pageSettings defaults** — `PageModel.tsx:394-398`:
```typescript
defaultParams(ctx) {
  return { displayTitle: true, enableTabs: false };
}
```

**Resize grid columns** — `GridModel.tsx:860`:
```typescript
columnCount = 24  // Ant Design 24-column grid system
```

## Full Page Tree Structure

```
RouteModel (schemaUid)
  ├── RootPageModel (subKey: "page")
  │     stepParams.pageSettings.general: { displayTitle, enableTabs, title }
  │
  ├── AIEmployeeShortcutListModel (subKey: "ai-shortcuts")  ← can be ignored
  │
  └── tabs: RootPageTabModel[] (subKey: "tabs")
        stepParams.pageTabSettings.tab: { title, icon, documentTitle }
        │
        └── grid: BlockGridModel (subKey: "grid")
              stepParams.gridSettings.grid: { rows, sizes, rowOrder }
              options.filterManager: [{ filterId, targetId, filterPaths }]
              │
              └── items: [block Models] (subKey: "items")
                    ├── TableBlockModel
                    │     └── columns: TableColumnModel[]
                    │     └── actions: [FilterAction, RefreshAction, AddNewAction]
                    ├── FilterFormBlockModel
                    │     └── grid → items: FilterFormItemModel[]
                    │     └── actions: [FilterAction, ResetAction]
                    ├── DetailsBlockModel
                    │     └── grid → items: DetailsItemModel[]
                    │     └── actions: [EditAction, DeleteAction]
                    ├── CreateFormModel
                    │     └── grid → items: FormItemModel[]
                    │     └── actions: [SubmitAction, ResetAction]
                    ├── ChartBlockModel
                    ├── ListBlockModel
                    ├── JSBlockModel
                    └── ActionPanelBlockModel
```

## API Creation Full Example (Verified)

### Environment

- API port: `http://localhost:14000/api` (container maps 14000→80)
- Create: `POST /api/flowModels:save` — body is the model data directly
- Delete: `POST /api/flowModels:destroy?filterByTk=<uid>`
- Return value: `{"data": "<uid>"}` indicates success

### Create BlockGridModel

```bash
POST /api/flowModels:save
{
  "uid": "my_grid_001",
  "use": "BlockGridModel",
  "parentId": "<tab-route-schemaUid>",   # Tab's RouteModel schemaUid
  "subKey": "grid",
  "subType": "object",
  "stepParams": {
    "gridSettings": {
      "grid": {
        "rows": {
          "row_table": [["<table-uid>"]]
        },
        "sizes": {
          "row_table": [24]
        }
      }
    }
  },
  "sortIndex": 0,
  "flowRegistry": {},
  "filterManager": []
}
```

**Note**: `gridSettings` can be empty `{}`. GridModel will auto-generate rows from items sub-models. However, setting it explicitly avoids layout flicker on first load.

### Create TableColumnModel (m2o Association Field)

```bash
POST /api/flowModels:save
{
  "uid": "col_category",
  "use": "TableColumnModel",
  "parentId": "<table-uid>",
  "subKey": "columns",
  "subType": "array",
  "stepParams": {
    "fieldSettings": {
      "init": {
        "dataSourceKey": "main",
        "collectionName": "nb_pm_projects",
        "fieldPath": "category"           # m2o association field name
      }
    },
    "tableColumnSettings": {
      "model": {"use": "DisplayNumberFieldModel"},
      "fieldNames": {"label": "name"},    # Display field from the associated target table
      "width": {"width": 120}
    }
  },
  "sortIndex": 6,
  "flowRegistry": {}
}
```

### PM Projects Page Verification Record

Successfully created on the PM Projects page (route schemaUid: `13wx93cg4b9`, tab schemaUid: `6g0eq29a6bl`):

| Component | UID | Status |
|-----------|-----|--------|
| BlockGridModel | `s6c7go24b5e` | Pre-existing, updated gridSettings |
| TableBlockModel | `76h0d3g2z2j` | Pre-existing, bound to nb_pm_projects |
| FilterActionModel | `lhgs6iu6geb` | Pre-existing |
| RefreshActionModel | `ymtolyr2z9w` | Pre-existing |
| AddNewActionModel | `hk25w9x58ht` | Pre-existing |
| Column: name | `a1sp1d6o5j7` | Pre-existing |
| Column: code | `y56rcc40ncl` | Pre-existing |
| Column: status | `t2nlzloc3mf` | Pre-existing |
| Column: priority | `oprxgbjgy4g` | Pre-existing |
| Column: progress | `b93ez99brtn` | Pre-existing |
| Column: start_date | `r6qg61cv7v1` | Pre-existing |
| Column: end_date | `9nuiz1anbs3` | Pre-existing |
| Column: category | `pm_proj_col_cate` | **Newly created** — m2o association column |
| Column: team | `pm_proj_col_team` | **Newly created** — m2o association column |
| TableActionsColumnModel | `ut2x1e876p2` | Pre-existing |

## field interface → model Auto-Mapping Table

NocoBase establishes mappings via `bindModelToInterface()`. **You only need to know fieldPath → query the fields table to get interface → model is automatically determined.**

### Display Models (Table Columns / Detail Fields)

| interface | Display Model |
|-----------|--------------|
| input, email, phone, uuid, url, nanoid, textarea, sequence | DisplayTextFieldModel |
| number, integer, id, snowflakeId | DisplayNumberFieldModel |
| select, multipleSelect, radioGroup, checkboxGroup | DisplayEnumFieldModel |
| checkbox | DisplayCheckboxFieldModel |
| datetime, datetimeNoTz, createdAt, updatedAt | DisplayDateTimeFieldModel |
| date | DisplayDateFieldModel |
| time | DisplayTimeFieldModel |
| percent | DisplayPercentFieldModel |
| json | DisplayJSONFieldModel |
| color | DisplayColorFieldModel |
| password | DisplayPasswordFieldModel |
| icon | DisplayIconFieldModel |
| richText | DisplayHtmlFieldModel |
| m2o, o2o, oho, obo, createdBy, updatedBy | DisplaySubItemFieldModel |
| m2m, o2m, mbm | DisplaySubTableFieldModel |

### Editable Models (Form Fields)

| interface | Edit Model |
|-----------|-----------|
| input, email, phone, uuid, url, nanoid | InputFieldModel |
| textarea | TextareaFieldModel |
| number, integer, id, snowflakeId | NumberFieldModel |
| select, multipleSelect, radioGroup, checkboxGroup | SelectFieldModel |
| checkbox | CheckboxFieldModel |
| date | DateOnlyFieldModel |
| datetimeNoTz | DateTimeNoTzFieldModel |
| datetime, createdAt, updatedAt | DateTimeTzFieldModel |
| time | TimeFieldModel |
| percent | PercentFieldModel |
| json | JsonFieldModel |
| color | ColorFieldModel |
| password | PasswordFieldModel |
| richText | RichTextFieldModel |
| m2o, o2o, oho, obo | RecordSelectFieldModel |
| m2m, o2m, mbm | SubTableFieldModel |

### Special Handling for Association Fields

**m2o field in table columns**: Uses `DisplayNumberFieldModel` + `fieldNames.label` to specify the display field name:
```json
"tableColumnSettings": {
  "model": {"use": "DisplayNumberFieldModel"},
  "fieldNames": {"label": "name"}
}
```

**m2o field in forms**: Uses `RecordSelectFieldModel` (dropdown select for associated records).

## Quick DB Queries

```sql
-- Given a schemaUid, query all blocks in one go
SELECT t.depth, fm.uid, fm.options->>'use' as model,
       fm.options->'stepParams'->'resourceSettings'->'init'->>'collectionName' as collection,
       fm.options->'stepParams'->'fieldSettings'->'init'->>'fieldPath' as field
FROM "flowModelTreePath" t
JOIN "flowModels" fm ON fm.uid = t.descendant
WHERE t.ancestor = '<schemaUid>'
  AND t.depth <= 3
ORDER BY t.depth, CAST(fm.options->>'sortIndex' AS int);
```

## Related Documents

- [Page Building Overview](/300000-projects/300008-nocobase-builder/02-page-building/)
- [Research: Actions and Popups](/300000-projects/300008-nocobase-builder/02-page-building/research-actions/)
- [Research: Detail Blocks](/300000-projects/300008-nocobase-builder/02-page-building/research-details/)
- [Research: Form Fields](/300000-projects/300008-nocobase-builder/02-page-building/research-forms/)
- [API Usage Manual](/300000-projects/300008-nocobase-builder/02-page-building/usage/)
