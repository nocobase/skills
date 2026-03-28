---
title: "Page Building Research: Action Buttons & Popup Mechanics"
description: "Complete model structure and minimal parameter quick reference for Actions, Popups, ChildPages, and Forms in NocoBase FlowPage 2.0"
tags: [nocobase, builder-toolkit, page-building, research]
type: reference
status: active
updated: "2026-02-26"
sidebar:
  order: 13
---

## Quick Reference Summary

| Model | Required Parameters | Inferable / Has Defaults | Purpose |
|---|---|---|---|
| `AddNewActionModel` | None | collectionName, dataSourceKey, mode, size, pageModelClass, uid | "Add New" button above table; opens drawer/dialog |
| `EditActionModel` | None | Same as above + filterByTk=`{{ ctx.record.id }}` | Row-level "Edit" button |
| `ViewActionModel` | None | Same as above | Row-level "View" button (0 instances in DB; rarely used in practice) |
| `PopupCollectionActionModel` | None (but title/icon usually customized) | Same as AddNew | Generic popup button, scene=all |
| `UpdateRecordActionModel` | `assignedValues` | buttonSettings | Row-level "Update Record"; no popup, directly writes field values |
| `FilterActionModel` | None | -- | Table filter button |
| `RefreshActionModel` | None | -- | Table refresh button |
| `FormSubmitActionModel` | None | -- | Form submit button: confirm -> save -> close |
| `ChildPageModel` | None | -- | Popup / sub-page container; automatically created by Action |
| `ChildPageTabModel` | None | -- | Sub-page tab container |
| `CreateFormModel` | `collectionName` | dataSourceKey="main", grid=FormGridModel | Create form |
| `EditFormModel` | `collectionName` | dataSourceKey, filterByTk=template | Edit form |
| `FormItemModel` | `fieldPath` | collectionName (inherited), field.use (inferred from interface) | Form field item |

---

## 1. Action Class Inheritance Hierarchy

```
ActionModel (base)
├── PopupActionModel                    # registerFlow(openViewFlow), on:click
│   ├── AddNewActionModel               # scene=collection, ACL=create, type=primary
│   ├── EditActionModel                 # scene=record, ACL=update
│   ├── ViewActionModel                 # scene=record, ACL=view, type=link
│   └── PopupCollectionActionModel      # scene=all, generic
├── UpdateRecordActionModel             # scene=record, ACL=update, inline update
├── FormActionModel
│   └── FormSubmitActionModel           # on:click -> confirm -> save -> close
├── DeleteActionModel
├── FilterActionModel
└── RefreshActionModel
```

**Source code locations:**
- `packages/core/client/src/flow/models/base/PopupActionModel.tsx` -- registers openViewFlow
- `packages/core/client/src/flow/models/actions/AddNewActionModel.tsx:14`
- `packages/core/client/src/flow/models/actions/EditActionModel.tsx:14`
- `packages/core/client/src/flow/models/actions/ViewActionModel.tsx:14`
- `packages/core/client/src/flow/models/actions/PopupCollectionActionModel.tsx:14`
- `packages/core/client/src/flow/models/actions/UpdateRecordActionModel.tsx:96`
- `packages/core/client/src/flow/models/blocks/form/FormActionModel.tsx:18` -- FormSubmitActionModel

---

## 2. AddNewActionModel Full Subtree

```
depth 0: AddNewActionModel          subKey=actions, subType=array
  depth 1: ChildPageModel            subKey=page, subType=object
    depth 2: ChildPageTabModel        subKey=tabs, subType=array
      depth 3: BlockGridModel         subKey=grid, subType=object
        depth 4: CreateFormModel      subKey=items, subType=array
          depth 5: FormSubmitActionModel  subKey=actions, subType=array
          depth 5: FormGridModel          subKey=grid, subType=object
            depth 6: FormItemModel        subKey=items, subType=array
              depth 7: [FieldModel]       subKey=field, subType=object
```

depth 4 can also contain `ReferenceBlockModel` (read-only reference block).

### AddNewActionModel stepParams Example

```json
{
  "popupSettings": {
    "openView": {
      "collectionName": "nb_tts_tickets",
      "dataSourceKey": "main",
      "mode": "drawer",
      "size": "large",
      "pageModelClass": "ChildPageModel",
      "uid": "<actionUid>"
    }
  }
}
```

- `mode`: `"drawer"` (slide-in panel) | `"dialog"` (modal dialog)
- `size`: `"large"` | `"small"`
- AddNew does **not** have `filterByTk` (not needed for creating new records)

---

## 3. Row-Level Actions (TableActionsColumnModel Subtree)

```
TableActionsColumnModel  subKey=columns, subType=array
├── UpdateRecordActionModel  subKey=actions (e.g. "Accept" button)
│   └── AssignFormModel      subKey=assignForm, subType=object
│       └── AssignFormGridModel -> AssignFormItemModel[] -> [FieldModel]
├── PopupCollectionActionModel  subKey=actions (e.g. "Transfer" popup)
│   └── ChildPageModel -> ChildPageTabModel -> BlockGridModel -> EditFormModel
│       ├── FormSubmitActionModel
│       └── FormGridModel -> FormItemModel[] -> [FieldModel]
```

### UpdateRecordActionModel stepParams Example

```json
{
  "buttonSettings": {
    "general": { "type": "link", "title": "Accept", "icon": "enteroutlined" },
    "linkageRules": {
      "value": [{
        "condition": { "logic": "$and", "items": [
          { "path": "{{ ctx.record.status }}", "operator": "$notIn", "value": ["assigned","transferred"] }
        ]},
        "actions": [{ "name": "linkageSetActionProps", "params": { "value": "hidden" } }]
      }]
    }
  },
  "assignSettings": {
    "assignFieldValues": {
      "assignedValues": { "status": "processing", "assignee_id": "{{ ctx.user.id }}" }
    }
  }
}
```

### PopupCollectionActionModel stepParams Example (Row-Level Popup)

```json
{
  "popupSettings": {
    "openView": {
      "collectionName": "nb_tts_tickets",
      "dataSourceKey": "main",
      "mode": "dialog",
      "size": "small",
      "pageModelClass": "ChildPageModel",
      "uid": "<actionUid>",
      "filterByTk": "{{ ctx.record.id }}"
    }
  },
  "buttonSettings": {
    "general": { "type": "link", "title": "Transfer", "icon": "swapoutlined" }
  }
}
```

---

## 4. ChildPageModel Mechanics

**Source code:** `packages/core/client/src/flow/models/base/PageModel/ChildPageModel.tsx`

- `ChildPageModel extends PageModel`
- `createPageTabModelOptions()` -> `{ use: 'ChildPageTabModel' }` (distinct from RootPageTabModel)
- When `ctx.view.type === 'embed'`, shows a back button (ArrowLeftOutlined)
- Supports `enableTabs` for multiple tabs
- Fixed structure: `ChildPageModel -> ChildPageTabModel[] -> BlockGridModel -> [blocks]`

**Popup open flow:**
PopupActionModel registers `openViewFlow` (key='popupSettings', on='click') -> reads `stepParams.popupSettings.openView` -> creates view (drawer/dialog) -> loads ChildPageModel.

---

## 5. CreateFormModel vs EditFormModel

| | CreateFormModel | EditFormModel |
|---|---|---|
| Scene | `BlockSceneEnum.new` | `BlockSceneEnum.oam` |
| ACL | `create` | `update` |
| Resource | `SingleRecordResource` (isNewRecord=true) | SingleRecord or MultiRecord (auto-determined) |
| Data loading | None (blank form) | Loads existing record, listens to `resource.on('refresh')` |
| Pagination | None | Yes (simple paginator when MultiRecord) |

**CreateFormModel stepParams:**
```json
{ "resourceSettings": { "init": { "dataSourceKey": "main", "collectionName": "nb_tts_tickets" } } }
```

**EditFormModel stepParams:**
```json
{ "resourceSettings": { "init": { "dataSourceKey": "main", "collectionName": "nb_tts_tickets", "filterByTk": "{{ctx.view.inputArgs.filterByTk}}" } } }
```

**Source code:**
- `packages/core/client/src/flow/models/blocks/form/CreateFormModel.tsx:26`
- `packages/core/client/src/flow/models/blocks/form/EditFormModel.tsx:29`

---

## 6. FormItemModel Configuration

**stepParams structure:**
```json
{
  "fieldSettings": {
    "init": {
      "dataSourceKey": "main",
      "collectionName": "nb_tts_tickets",
      "fieldPath": "title"
    }
  },
  "editItemSettings": {
    "required": { "required": true },
    "initialValue": { "defaultValue": "{{ ctx.user.nickname }}" }
  }
}
```

**subModels:** `{ field: { use: "<FieldModelName>", subKey: "field", subType: "object" } }`

**editItemSettings available steps:** showLabel, label, aclCheck, init, tooltip, description, initialValue, validation, required, model(fieldComponent), pattern, titleField

**Source code:** `packages/core/client/src/flow/models/blocks/form/FormItemModel.tsx:43`

---

## 7. FormSubmitActionModel

Click flow: `confirm` (optional secondary confirmation) -> `saveResource` (calls submitHandler) -> `refreshAndClose` (closes view)

```json
{ "use": "FormSubmitActionModel", "subKey": "actions", "subType": "array" }
```

No additional stepParams needed.

**Source code:** `packages/core/client/src/flow/models/blocks/form/FormActionModel.tsx:18`

---

## 8. Interface -> FieldModel Mapping

### Form Fields (Editable)

| interface | FieldModel |
|---|---|
| input | InputFieldModel |
| textarea | TextareaFieldModel |
| vditor | VditorFieldModel |
| select | SelectFieldModel |
| radioGroup | RadioGroupFieldModel |
| checkboxGroup | CheckboxGroupFieldModel |
| checkbox | CheckboxFieldModel |
| integer | NumberFieldModel |
| number | NumberFieldModel |
| percent | NumberFieldModel |
| date | DateOnlyFieldModel |
| m2o | RecordSelectFieldModel |
| o2o | RecordSelectFieldModel |
| obo | RecordSelectFieldModel |
| m2m (attachment) | UploadFieldModel |
| sequence | InputFieldModel |
| collection | CollectionSelectorFieldModel |

---

## 9. DB Instance Statistics

| Model | Instance Count (Entire DB) |
|---|---|
| AddNewActionModel | 29 |
| EditActionModel | 5 |
| ViewActionModel | **0** (never used) |
| PopupCollectionActionModel | 6 |
| UpdateRecordActionModel | 10 |
| DeleteActionModel | 1 |

The Tickets page uses `PopupCollectionActionModel` + `UpdateRecordActionModel` for row actions, not `EditActionModel`/`ViewActionModel`.

---

## 10. API Operation Quick Reference (Validated by Testing)

### Correct API Usage

| Operation | API | Notes |
|---|---|---|
| Create new model | `POST flowModels:create` body=`{uid, options:{...}}` | Stored correctly, but **only creates self tree path** |
| Update existing model | `POST flowModels:update?filterByTk=<uid>` body=`{options:{...}}` | Correctly replaces options |
| ~~Save/update~~ | ~~`flowModels:save` with uid~~ | **Has a bug: nests options inside options.options** |

### Tree Path Must Be Manually Supplemented After Creating a Model

`flowModels:create` only creates a single `(self, self, 0)` tree path entry. **Ancestor chain must be completed via SQL:**

```sql
-- Example: Complete tree path for new model NEW_UID (parent is PARENT_UID)
-- First query the parent model's ancestor chain
SELECT ancestor, depth FROM "flowModelTreePath" WHERE descendant = 'PARENT_UID' ORDER BY depth;
-- Then insert: self(0) + parent(1) + all parent's ancestors(2,3,4...)
INSERT INTO "flowModelTreePath" (ancestor, descendant, depth, sort) VALUES
('NEW_UID', 'NEW_UID', 0, NULL),
('PARENT_UID', 'NEW_UID', 1, 1),  -- sort=1 for direct parent
-- ... depth+1 for each ancestor
ON CONFLICT DO NOTHING;
```

### Connection Notes

- NocoBase port: `14000` (not the default 13000)
- In WSL environments, use `--noproxy localhost` to bypass proxy
- Full curl example:
```bash
curl -s --noproxy localhost -X POST 'http://localhost:14000/api/flowModels:create' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"uid":"<uid>","options":{...}}'
```

---

## 11. Testing Validation Records

### Date Field Fix
- `59b6sjneurz`, `5nzi7c3hugf`: `DisplayDateFieldModel` -> `DisplayDateTimeFieldModel`
- Used `flowModels:update?filterByTk=` API

### PM Projects AddNew Form Creation

Under the existing subtree of AddNew button `hk25w9x58ht` (`ChildPageModel -> ChildPageTabModel -> BlockGridModel(4b6ad7e5dcf)`), created a complete form:

```
CreateFormModel (pm_cform_001) -> collectionName=nb_pm_projects
├── FormSubmitActionModel (pm_submit_001)
└── FormGridModel (pm_fgrid_001)
    ├── name      (pm_fi_name01 -> pm_ff_name01: InputFieldModel)     [required]
    ├── code      (pm_fi_code01 -> pm_ff_code01: InputFieldModel)
    ├── description (pm_fi_desc01 -> pm_ff_desc01: TextareaFieldModel)
    ├── category  (pm_fi_cate01 -> pm_ff_cate01: RecordSelectFieldModel)
    ├── status    (pm_fi_stat01 -> pm_ff_stat01: SelectFieldModel)
    ├── priority  (pm_fi_prio01 -> pm_ff_prio01: SelectFieldModel)
    ├── team      (pm_fi_team01 -> pm_ff_team01: RecordSelectFieldModel)
    ├── start_date (pm_fi_sdat01 -> pm_ff_sdat01: DateOnlyFieldModel)
    └── end_date  (pm_fi_edat01 -> pm_ff_edat01: DateOnlyFieldModel)
```

Total of 21 flowModels + complete tree paths. Confirmed via `flowModelTreePath` ancestor query: 25 nodes, 7 levels deep, all correct.

---

## Related Documents

- [Page Building Overview](/300000-projects/300008-nocobase-builder/02-page-building/)
- [Research Notes: FlowPage Model](/300000-projects/300008-nocobase-builder/02-page-building/research-notes/)
- [Research: Form Fields & Validation](/300000-projects/300008-nocobase-builder/02-page-building/research-forms/)
- [Research: Detail Blocks](/300000-projects/300008-nocobase-builder/02-page-building/research-details/)
- [Research: Block Layouts](/300000-projects/300008-nocobase-builder/02-page-building/research-layouts/)
