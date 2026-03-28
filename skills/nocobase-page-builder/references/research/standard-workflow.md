---
title: "Page Building Standard Workflow"
description: "NocoBase FlowPage 2.0 page building: complete verified workflow for creating pages/blocks/fields via API"
tags: [nocobase, builder-toolkit, page-building, usage, flowModels]
type: guide
status: active
updated: "2026-02-26"
sidebar:
  label: "Standard Workflow"
  order: 2
---

# Page Building Standard Workflow

> **Status**: Full workflow verified — both read and write APIs have been field-tested
>
> **Verification source**: Ticket V2 (localhost:14000, DB:5435)
>
> **Verification result**: Successfully created a Project Management module (Projects + Tasks pages with Table + columns + action buttons) entirely via API
>
> **Script location**: `scripts/nocobase/nb-page-snapshot.py` (read capability available)

---

## Core Philosophy: Read First, Write Second, Template-Driven

```
Step 1: Read existing page structure (snapshot)     ← Understand the current system's page layout
Step 2: Create route + FlowModel root node           ← Build page skeleton (system auto-creates RouteModel + RootPageModel)
Step 3: Add blocks (Table/Form/Details)              ← Bind to collections
Step 4: Configure fields and action buttons          ← Fine-tune details
```

---

## Key Concepts

### 1.0 Page vs 2.0 FlowPage

| | 1.0 Page | 2.0 FlowPage |
|---|----------|-------------|
| Route type | `type: "page"` | `type: "flowPage"` |
| Data storage | `uiSchemas` table | `flowModels` table (only 3 columns: uid, name, options) |
| Tree structure | `uiSchemaTreePath` closure table | `flowModelTreePath` closure table |
| Block binding | `x-decorator-props.collection` | `stepParams.resourceSettings.init.collectionName` |
| Field binding | `x-collection-field: "table.field"` | `stepParams.fieldSettings.init.fieldPath` |
| API | `uiSchemas:insert/insertAdjacent` | `flowModels:save/attach` |
| Usage status | **Legacy** (CRM v3 / Ticket V2 both have 0 page routes) | **100% in use** |

**Conclusion**: All new systems should use FlowPage.

### Available Tools

| Tool | Purpose | Status |
|------|---------|--------|
| `nb-page-snapshot.py` | Read page FlowModel tree structure | Available |
| Page creation script | Create pages/blocks via API | This document is the standard workflow |

---

## Verified Data Structures

> **Verification date**: 2026-02-26
> **Data source**: Ticket V2 (localhost:14000, DB:5435)

### DB Table Structure

The `flowModels` table has only 3 columns:

| Field | Type | Description |
|-------|------|-------------|
| `uid` | varchar PK | Unique node identifier |
| `name` | varchar | Node name (usually equals the Model type name) |
| `options` | json | All configuration (use/parentId/subKey/subType/stepParams/sortIndex/flowRegistry) |

`flowModelTreePath` closure table:

| Field | Type | Description |
|-------|------|-------------|
| `ancestor` | varchar | Ancestor node UID |
| `descendant` | varchar | Descendant node UID |
| `depth` | integer | Depth |
| `async` | boolean | Whether to load asynchronously |
| `type` | varchar | Child node type |
| `sort` | integer | Sort order |

### API Response schema Field vs DB Storage options Field

> **Important distinction**: The API `flowModels:list` response uses the `schema` field name, but the database actually stores it in the `options` column.

- **RouteModel** (page root + Tab): `options` = `{"schema": {"use": "RouteModel"}}`
- **Other Models**: `options` = `{"use": "TableBlockModel", "parentId": "...", "subKey": "...", ...}`

### Verified Page Tree Structure (Tickets Page)

```
desktopRoute (type="flowPage", schemaUid=X)
  └── FlowModel RouteModel (uid=X, options={schema:{use:"RouteModel"}})
        └── RootPageModel (parentId=X, subKey="page", subType="object")
              └── [tabs linked via desktopRoutes children, type="tabs", schemaUid=Y]
                    └── RouteModel (uid=Y)
                          └── BlockGridModel (parentId=Y, subKey="grid", subType="object")
                                ├── TableBlockModel (subKey="items", subType="array", sortIndex=0)
                                │   ├── FilterActionModel (subKey="actions", sortIndex=1)
                                │   ├── RefreshActionModel (subKey="actions", sortIndex=2)
                                │   ├── AddNewActionModel (subKey="actions", sortIndex=3)
                                │   │   └── ChildPageModel (subKey="page") → ChildPageTabModel
                                │   ├── TableColumnModel (subKey="columns", sortIndex=2..10)
                                │   │   └── DisplayTextFieldModel / DisplayNumberFieldModel / etc (subKey="field")
                                │   └── ...
                                └── FilterFormBlockModel (subKey="items", sortIndex=2)
```

### FlowModel options Standard Structure

**Non-route Models (the vast majority)**:

```json
{
  "use": "TableBlockModel",
  "parentId": "parent-uid",
  "subKey": "items",
  "subType": "array",
  "sortIndex": 0,
  "stepParams": { ... },
  "flowRegistry": {}
}
```

**Route Models (page root + Tab, special structure)**:

```json
{
  "schema": { "use": "RouteModel" }
}
```

### subKey Meanings

| subKey | subType | Description | Typical Parent Model |
|--------|---------|-------------|---------------------|
| `page` | object | Page root | RouteModel |
| `grid` | object | Layout container | RouteModel / RootPageModel |
| `items` | array | Block list | BlockGridModel |
| `columns` | array | Table columns | TableBlockModel |
| `actions` | array | Action buttons | TableBlockModel / FormModel |
| `field` | object | Field display component | TableColumnModel / DetailsItemModel |
| `tabs` | object | Tab container | RootPageModel |

### stepParams Examples

**TableColumnModel** (table column bound to field):

```json
{
  "fieldSettings": {
    "init": {
      "dataSourceKey": "main",
      "collectionName": "nb_tts_sla_configs",
      "fieldPath": "name"
    }
  },
  "tableColumnSettings": {
    "model": { "use": "DisplayTextFieldModel" }
  }
}
```

**BlockGridModel** (layout grid):

```json
{
  "gridSettings": {
    "grid": {
      "rows": {
        "row-uid-1": [["block-uid-1"]],
        "row-uid-2": [["block-uid-2"]]
      },
      "sizes": {
        "row-uid-1": [24]
      }
    }
  }
}
```

**RootPageModel** (page settings):

```json
{
  "pageSettings": {
    "general": {
      "displayTitle": true,
      "enableTabs": false,
      "title": "Page Title"
    }
  }
}
```

### Display Field Model Type Mapping

| Model Type | Used For |
|------------|----------|
| `DisplayTextFieldModel` | Text/select/input type fields |
| `DisplayNumberFieldModel` | Number/integer/percentage fields |
| `DisplayCheckboxFieldModel` | Boolean fields |
| `DisplayDateTimeFieldModel` | Date/datetime fields (verified: PM module start_date/end_date/due_date) |
| `DisplayEnumFieldModel` | Enum fields |

---

## Step 1: Read Existing Page Structure

```bash
# List all routes (menu structure) — verified
GET /api/desktopRoutes:list?tree=true&sort=sort

# Get FlowModel structure for a specific page
python3 scripts/nocobase/nb-page-snapshot.py --route-id <id>

# List all FlowModels — verified (Ticket V2 returns 2310 records)
GET /api/flowModels:list

# Find a single FlowModel — verified (RouteModel returns schema field)
POST /api/flowModels:findOne
{ "uid": "<pageSchemaUid>", "includeAsyncNode": false }
```

---

## Step 2: Create Route + Page Skeleton

> **Verified**: 2026-02-26, successfully created PM module (Projects + Tasks)

### 2.1 Create Route Group (optional)

```bash
POST /api/desktopRoutes:create
{
  "type": "group",
  "title": "Project Management",
  "icon": "projectoutlined",
  "parentId": <parent-route-id>,  # Which menu to place it under
  "schemaUid": "<group-uid>"      # Must be provided manually, otherwise null
}
```

### 2.2 Create FlowPage Route

**Key**: You must provide `schemaUid` and `menuSchemaUid` at creation time, and include `children` tabs sub-routes.

```bash
# UID generation (11-character random string)
python3 -c "import random,string; print(''.join(random.choices(string.ascii_lowercase+string.digits,k=11)))"

POST /api/desktopRoutes:create
{
  "type": "flowPage",
  "title": "Projects",
  "icon": "appstoreoutlined",
  "parentId": <group-route-id>,
  "schemaUid": "<page-uid>",          # Pre-generated on client side
  "menuSchemaUid": "<menu-uid>",       # Pre-generated on client side
  "enableTabs": false,
  "children": [{
    "type": "tabs",
    "schemaUid": "<tab-uid>",          # Pre-generated on client side
    "tabSchemaName": "<tab-name>",     # Pre-generated on client side
    "hidden": true
  }]
}
```

**System auto-completes**:
1. The `desktopRoutes.afterCreate` hook automatically creates `flowModels` records (RouteModel)
2. The page-level RouteModel (`<page-uid>`) automatically gets a `RootPageModel` child node
3. The tab-level RouteModel (`<tab-uid>`) is also automatically created
4. Role permissions are automatically assigned to roles with `allowNewMenu=true`

### 2.3 Insert UI Schema

```bash
POST /api/uiSchemas:insert
{
  "type": "void",
  "x-component": "FlowRoute",
  "x-uid": "<page-uid>"
}
```

**No manual creation needed**: RouteModel, RootPageModel — the system generates these automatically during route creation.

---

## Step 3: Add Blocks

> **Verified**: `flowModels:save` automatically mounts to the tree (triggered by `parentId`), no need to call `attach` separately

### 3.1 `flowModels:save` API Format

**Key finding**: The POST body is the model data directly (no wrapping in `values` needed). The NocoBase resource system automatically maps the body to `ctx.action.params.values`.

```bash
POST /api/flowModels:save
Content-Type: application/json

{
  "uid": "<uid>",
  "use": "BlockGridModel",
  "parentId": "<parent-uid>",
  "subKey": "grid",
  "subType": "object",
  "stepParams": {},
  "sortIndex": 0,
  "flowRegistry": {}
}
```

Return value: `{"data": "<uid>"}` — returns the created/updated node UID.

### 3.2 Create BlockGridModel

```bash
POST /api/flowModels:save
{
  "uid": "<grid-uid>",
  "use": "BlockGridModel",
  "parentId": "<tab-uid>",     # Tab's schemaUid
  "subKey": "grid",
  "subType": "object",
  "stepParams": {},             # gridSettings can be empty, system auto-generates
  "sortIndex": 0,
  "flowRegistry": {},
  "filterManager": []
}
```

### 3.3 Create TableBlockModel

```bash
POST /api/flowModels:save
{
  "uid": "<table-uid>",
  "use": "TableBlockModel",
  "parentId": "<grid-uid>",
  "subKey": "items",
  "subType": "array",
  "stepParams": {
    "resourceSettings": {
      "init": {
        "dataSourceKey": "main",
        "collectionName": "nb_pm_projects"
      }
    },
    "tableSettings": {
      "defaultSorting": {
        "sort": [{"field": "createdAt", "direction": "desc"}]
      }
    }
  },
  "sortIndex": 0,
  "flowRegistry": {}
}
```

---

## Step 4: Add Table Columns and Action Buttons

### 4.1 Add Action Buttons

```bash
# Filter button
POST /api/flowModels:save
{
  "uid": "<uid>", "use": "FilterActionModel",
  "parentId": "<table-uid>", "subKey": "actions", "subType": "array",
  "stepParams": {}, "sortIndex": 1, "flowRegistry": {}
}

# Refresh button
POST /api/flowModels:save
{
  "uid": "<uid>", "use": "RefreshActionModel",
  "parentId": "<table-uid>", "subKey": "actions", "subType": "array",
  "stepParams": {}, "sortIndex": 2, "flowRegistry": {}
}

# Add New button (with popup)
POST /api/flowModels:save
{
  "uid": "<addnew-uid>", "use": "AddNewActionModel",
  "parentId": "<table-uid>", "subKey": "actions", "subType": "array",
  "stepParams": {
    "popupSettings": {
      "openView": {
        "collectionName": "nb_pm_projects",
        "dataSourceKey": "main",
        "mode": "dialog",
        "size": "medium",
        "pageModelClass": "ChildPageModel",
        "uid": "<addnew-uid>"
      }
    }
  },
  "sortIndex": 3, "flowRegistry": {}
}
```

### 4.2 Add Table Columns (Two Steps: Column + Field)

**Each table column requires two Models**:
1. `TableColumnModel` — Column definition (binds field path + configures display component type)
2. `DisplayXxxFieldModel` — Field display component (child of the column, subKey="field")

```bash
# Step 1: Create TableColumnModel
POST /api/flowModels:save
{
  "uid": "<col-uid>",
  "use": "TableColumnModel",
  "parentId": "<table-uid>",
  "subKey": "columns",
  "subType": "array",
  "stepParams": {
    "fieldSettings": {
      "init": {
        "dataSourceKey": "main",
        "collectionName": "nb_pm_projects",
        "fieldPath": "name"
      }
    },
    "tableColumnSettings": {
      "model": { "use": "DisplayTextFieldModel" },
      "width": { "width": 200 }          # Optional: column width
    }
  },
  "sortIndex": 0,
  "flowRegistry": {}
}

# Step 2: Create DisplayTextFieldModel (child node of the column)
POST /api/flowModels:save
{
  "uid": "<field-uid>",
  "use": "DisplayTextFieldModel",
  "props": null,
  "parentId": "<col-uid>",
  "subKey": "field",
  "subType": "object",
  "stepParams": {
    "popupSettings": {
      "openView": {
        "collectionName": "nb_pm_projects",
        "dataSourceKey": "main"
      }
    }
  },
  "sortIndex": 0,
  "flowRegistry": {}
}
```

**Optional: clickToOpen** (click text to open detail popup):

```bash
POST /api/flowModels:save
{
  "uid": "<field-uid>",
  "use": "DisplayTextFieldModel",
  "props": null,
  "parentId": "<col-uid>",
  "subKey": "field",
  "subType": "object",
  "stepParams": {
    "popupSettings": {
      "openView": {
        "collectionName": "nb_pm_projects",
        "dataSourceKey": "main",
        "mode": "dialog",
        "size": "medium",
        "pageModelClass": "ChildPageModel",
        "uid": "<field-uid>"
      }
    },
    "displayFieldSettings": {
      "clickToOpen": { "clickToOpen": true }
    }
  },
  "sortIndex": 1,
  "flowRegistry": {}
}
```

### 4.3 Add Actions Column

```bash
POST /api/flowModels:save
{
  "uid": "<uid>",
  "use": "TableActionsColumnModel",
  "parentId": "<table-uid>",
  "subKey": "columns",
  "subType": "array",
  "stepParams": {
    "tableColumnSettings": {
      "title": { "title": "{{t(\"Actions\")}}" }
    }
  },
  "sortIndex": 99,
  "flowRegistry": {}
}
```

---

## Common FlowModel Types

### Layout & Navigation

| Model | Purpose | subKey |
|-------|---------|--------|
| `RouteModel` | Page/Tab entry point (special schema structure) | — |
| `RootPageModel` | Page root node | page |
| `BlockGridModel` | Layout container (with gridSettings) | grid |
| `ChildPageModel` | Nested child page | page |
| `ChildPageTabModel` | Child page Tab | — |

### Blocks

| Model | Purpose | subKey |
|-------|---------|--------|
| `TableBlockModel` | Data table | items |
| `CreateFormModel` | Create form | items |
| `EditFormModel` | Edit form | items |
| `DetailsBlockModel` | Details display | items |
| `ListBlockModel` | List view | items |
| `FilterFormBlockModel` | Filter form | items |
| `ReferenceBlockModel` | Template reference block | items |
| `JSBlockModel` | Custom JS block | items |
| `ActionPanelBlockModel` | Action panel (ticket-specific) | items |

### Fields & Columns

| Model | Purpose | subKey |
|-------|---------|--------|
| `TableColumnModel` | Table column | columns |
| `FormItemModel` | Form field | — |
| `DetailsItemModel` | Details field | — |
| `DisplayTextFieldModel` | Text display | field |
| `DisplayNumberFieldModel` | Number display | field |
| `DisplayEnumFieldModel` | Enum display | field |
| `DisplayCheckboxFieldModel` | Boolean display | field |
| `DisplayDateTimeFieldModel` | Datetime display | field |
| `InputFieldModel` | Text input | — |
| `SelectFieldModel` | Dropdown select | — |
| `RecordSelectFieldModel` | Association record select | — |
| `JSColumnModel` | JS custom column | columns |

### Action Buttons

| Model | Purpose | subKey |
|-------|---------|--------|
| `FilterActionModel` | Filter | actions |
| `RefreshActionModel` | Refresh | actions |
| `AddNewActionModel` | Add New | actions |
| `FormSubmitActionModel` | Form submit | actions |
| `EditActionModel` | Edit | actions |
| `UpdateRecordActionModel` | Update record | actions |
| `AIEmployeeButtonModel` | AI assistant button | actions |

---

## API Endpoint Summary

### All Verified

| API | Purpose | Verification Status |
|-----|---------|-------------------|
| `GET /api/desktopRoutes:listAccessible?paginate=false` | Get accessible route tree | Returns nested tree structure |
| `POST /api/desktopRoutes:create` | Create route | Including children sub-routes |
| `POST /api/desktopRoutes:update?filterByTk=<id>` | Update route | Verified |
| `POST /api/desktopRoutes:destroy?filterByTk=<id>` | Delete route | Cascades to delete flowModels |
| `GET /api/flowModels:findOne?uid=<uid>` | Get full Model tree | Returns nested structure with subModels |
| `POST /api/flowModels:save` | Create/update FlowModel | Auto-mounts to tree (via parentId) |
| `POST /api/flowModels:destroy?filterByTk=<uid>` | Delete FlowModel | Verified |
| `POST /api/uiSchemas:insert` | Insert UI Schema | FlowRoute component registration |

**Key findings**:
- `flowModels:save` automatically handles tree path mounting — **no need** to call `flowModels:attach` separately
- POST body is the model data directly (do not wrap in `{"values": {...}}`). The NocoBase resource system maps it automatically
- The `desktopRoutes:create` `afterCreate` hook automatically creates `flowModels` RouteModel records

---

## Notes

1. **UID format**: 11-character lowercase alphanumeric random string (`python3 -c "import random,string; print(''.join(random.choices(string.ascii_lowercase+string.digits,k=11)))"`)
2. **save auto-mounts**: `flowModels:save` automatically handles tree paths via `parentId` — no separate `attach` needed
3. **RouteModel special structure**: options is `{"schema": {"use": "RouteModel"}}`, not the standard `{"use": "..."}`
4. **Route creation auto-generates FlowModel**: `desktopRoutes:create` automatically creates RouteModel + RootPageModel
5. **FlowPage routes auto-authorize**: New routes are automatically assigned to roles with `allowNewMenu=true`
6. **Route deletion cascades cleanup**: `desktopRoutes:destroy` cascades to delete associated flowModels
7. **BlockGridModel gridSettings can be empty**: Pass `{}` for `stepParams` — the system auto-generates the layout
8. **POST body should not wrap values**: Send model data directly. The NocoBase resource system automatically maps to `ctx.action.params.values`
9. **Must insert uiSchema**: After creating a flowPage route, you must call `uiSchemas:insert` to register the FlowRoute component
10. **Group routes also need schemaUid**: Provide a schemaUid when creating groups, otherwise menu rendering may be affected

---

## Verification Record: PM Module Creation

> **Date**: 2026-02-26 | **Environment**: Ticket V2 (localhost:14000, DB:5435)

### Routes Created

| Route | type | id | schemaUid |
|-------|------|----|-----------|
| Project Management | group | 350416708763648 | u23wh0d5lo7 |
| Projects | flowPage | 350416952033280 | 13wx93cg4b9 |
| Projects tab | tabs | 350416952033281 | 6g0eq29a6bl |
| Tasks | flowPage | 350417048502272 | t8kblhq9osn |
| Tasks tab | tabs | 350417048502274 | sc8nuvh9xkh |

### FlowModel Trees Created

**Projects page** (21 nodes):
```
RouteModel (6g0eq29a6bl)
  └── BlockGridModel (s6c7go24b5e) subKey=grid
       └── TableBlockModel (76h0d3g2z2j) collection=nb_pm_projects
            ├── FilterActionModel (lhgs6iu6geb)
            ├── RefreshActionModel (ymtolyr2z9w)
            ├── AddNewActionModel (hk25w9x58ht)
            ├── TableColumnModel x7 (name/code/status/priority/progress/start_date/end_date)
            │   └── DisplayXxxFieldModel (field)
            └── TableActionsColumnModel (ut2x1e876p2)
```

**Tasks page** (23 nodes):
```
RouteModel (sc8nuvh9xkh)
  └── BlockGridModel (gy5xlp2ahtu) subKey=grid
       └── TableBlockModel (rgoxs0f5mkm) collection=nb_pm_tasks
            ├── FilterActionModel / RefreshActionModel / AddNewActionModel
            ├── TableColumnModel x8 (name/code/status/priority/type/assignee/due_date/progress)
            │   └── DisplayXxxFieldModel (field)
            └── TableActionsColumnModel (9aewz8yxeoo)
```

---

## Related Documents

- [Page Building API Principles](/300000-projects/300008-nocobase-builder/02-page-building/) — Source-level Schema structure, block templates, field configuration (includes 1.0 uiSchemas reference)
- [FlowPage Research Notes](/300000-projects/300008-nocobase-builder/02-page-building/research-notes/) — CRM v3 / Ticket V2 field-tested data (complete FlowModel type listing)
- [Data Modeling Standard Workflow](/300000-projects/300008-nocobase-builder/01-data-modeling/usage/) — Collection creation workflow (prerequisite for page building)
- [NocoBase Builder Toolkit](/300000-projects/300008-nocobase-builder/) — Project overview
- [NocoBase Resource Map](/200000-guides/nocobase-resources/) — All NocoBase resource entry points
