---
title: "Page Building Research: Form Fields, Validation & Linkage"
description: "Complete quick reference for CreateFormModel/EditFormModel field types, validation rules, linkage rules, and event flows"
tags: [nocobase, builder-toolkit, page-building, research]
type: reference
status: active
updated: "2026-02-26"
sidebar:
  order: 12
---

## Quick Reference Summary

| Topic | Conclusion |
|-------|-----------|
| Form hierarchy | Form -> FormGridModel(grid) -> FormItemModel(items) -> FieldModel(field) + FormSubmitActionModel(actions) |
| Field model selection | Automatically inferred from the `interface` field in the `fields` table; no manual specification needed |
| Validation rules | Only `required` found in DB, configured in FormItemModel's `editItemSettings.required` |
| Linkage rules | Configured at form level in `stepParams.eventSettings.linkageRules`; actions include `linkageSetFieldProps` (hide) and `linkageAssignField` (assign value) |
| Event flows | Configured in `options.flowRegistry` (sibling of stepParams, not nested inside it); event types: `click` (before submit) / `beforeRender` (before render); step types: `runjs` / `customVariable` |
| Submit button | FormSubmitActionModel: buttonSettings + submitSettings(confirm) + optional triggerWorkflows |
| Non-field items | MarkdownItemModel / DividerItemModel / JSItemModel can be embedded in form grid |
| API format | `flowModels:save` body takes `uid/use/subKey/stepParams` directly at top level (do NOT wrap in `options`); API automatically stores them as the options column |
| API tree path | `flowModelTreePath` is automatically maintained by the API; only `parentId` needs to be specified |

---

## 1. interface -> Model Mapping Table

### Edit Models (Form Context)

| interface | Edit Model | Notes |
|-----------|-----------|-------|
| input | InputFieldModel | |
| textarea | TextareaFieldModel | |
| vditor | VditorFieldModel | Rich text |
| select | SelectFieldModel | Options come from collection schema |
| radioGroup | RadioGroupFieldModel | |
| checkbox | CheckboxFieldModel | |
| checkboxGroup | CheckboxGroupFieldModel | |
| integer / number | NumberFieldModel | |
| percent | NumberFieldModel | |
| date | DateOnlyFieldModel | |
| datetime | DateTimeTzFieldModel | |
| m2o / o2o / obo | RecordSelectFieldModel | Association record |
| m2m | UploadFieldModel (file) / RecordSelectFieldModel (association) | |
| sequence | InputFieldModel | Typically read-only |
| collection | CollectionSelectorFieldModel | |

### Display Models (Detail/Table Context)

| interface | Display Model |
|-----------|--------------|
| input / textarea / email / sequence / color | DisplayTextFieldModel |
| select / radioGroup / multipleSelect | DisplayEnumFieldModel |
| checkbox | DisplayCheckboxFieldModel |
| integer / number / percent / sort | DisplayNumberFieldModel |
| m2o / o2o / obo | DisplayTextFieldModel |
| m2m | DisplayNumberFieldModel (count) / DisplayPreviewFieldModel (preview) |
| date | DisplayDateFieldModel |
| datetime / createdAt / updatedAt | DisplayDateTimeFieldModel |
| vditor | DisplayVditorFieldModel |

### Automatic Inference Chain

```
fieldPath("category")
  -> fields table query -> interface="m2o", target="nb_pm_categories"
  -> Edit: RecordSelectFieldModel
  -> Display: DisplayTextFieldModel
  -> labelField = collections.titleField || "name"
  -> popupSettings = { collectionName: target, associationName: "parent_collection.fieldPath" }
```

Retrieve field metadata in a single query:
```sql
SELECT f.name, f.type, f.interface, f.options::jsonb->>'target' as target,
       f.options::jsonb->>'foreignKey' as fk,
       c.options::jsonb->>'titleField' as target_title
FROM fields f
LEFT JOIN collections c ON c.name = (f.options::jsonb->>'target')
WHERE f."collectionName" = $1
ORDER BY f.sort;
```

---

## 2. Required vs Inferable Parameters

### CreateFormModel / EditFormModel

| Parameter | Required? | Default / Inference |
|-----------|-----------|-------------------|
| `resourceSettings.init.collectionName` | **Required** | -- |
| `resourceSettings.init.dataSourceKey` | Auto | `"main"` |
| `resourceSettings.init.associationName` | Required for sub-tables | e.g. `"nb_tts_customers.contacts"` |
| `resourceSettings.init.sourceId` | Required for sub-tables | `"{{ctx.view.inputArgs.sourceId}}"` |
| `resourceSettings.init.filterByTk` | Auto for Edit | `"{{ctx.view.inputArgs.filterByTk}}"` |
| `formModelSettings.layout` | Optional | If unset, uses system default; manual: `{layout:"vertical", labelAlign:"left", labelWidth:120, labelWrap:true, colon:true}` |
| `formModelSettings.dataScope.filter` | Optional | Used when EditForm filters by record ID |
| `eventSettings.linkageRules` | Optional | Not needed when there is no linkage |

### FormItemModel

| Parameter | Required? | Default / Inference |
|-----------|-----------|-------------------|
| `fieldSettings.init.fieldPath` | **Required** | Field name or nested path `"repair.device_name"` |
| `fieldSettings.init.collectionName` | Auto | Inherited from parent Form |
| `fieldSettings.init.dataSourceKey` | Auto | `"main"` |
| `editItemSettings.required` | Optional | `{required: true}` to set as required |
| `editItemSettings.initialValue.defaultValue` | Optional | Static value / `"{{ ctx.user.nickname }}"` / object |
| `editItemSettings.pattern` | Optional | `{pattern: "readPretty"}` to set as read-only |
| `editItemSettings.showLabel` | Optional | Default true |
| `editItemSettings.model.use` | Optional | Override child field model, e.g. `"SubFormFieldModel"` |
| `editItemSettings.titleField` | Optional | Display name for association fields; can be inferred from target collection |
| Child FieldModel's `use` | **Auto** | Inferred from fields.interface |

### RecordSelectFieldModel (Child Field)

| Parameter | Required? | Default / Inference |
|-----------|-----------|-------------------|
| `selectSettings.fieldNames.label` | Optional | Inferred from target collection titleField or `"name"` |
| `fieldBinding.use` | Optional | Override display model: `"SubFormFieldModel"` / `"DisplayTextFieldModel"` |
| `popupSettings.openView` | Auto | Inferred from fields table target + associationName |
| `displayFieldSettings.displayStyle` | Optional | `"tag"` |
| `displayFieldSettings.clickToOpen` | Optional | Default true |

### FormSubmitActionModel

| Parameter | Required? | Default / Inference |
|-----------|-----------|-------------------|
| `buttonSettings.general.title` | Optional | `"Submit"` |
| `buttonSettings.general.type` | Optional | `"primary"` |
| `buttonSettings.general.icon` | Optional | `"saveoutlined"` / `"sendoutlined"` |
| `buttonSettings.general.htmlType` | Auto | `"submit"` |
| `submitSettings.confirm` | Optional | `{enable:true, title:"Submit record", content:"..."}` |
| `submitSettings.saveResource.requestConfig` | Auto | `{params:{}}` |
| `formTriggerWorkflowsActionSettings` | Optional | `{setTriggerWorkflows:{group:[{workflowKey:"xxx"}]}}` |
| `flowRegistry` (click event) | Optional | Execute JS before submit |

---

## 3. Actual Data Validated from DB

### CreateFormModel (with Linkage Rules)

```jsonc
// stepParams
{
  "resourceSettings": {
    "init": { "dataSourceKey": "main", "collectionName": "nb_tts_customers" }
  },
  "formModelSettings": {
    "layout": { "layout": "vertical", "labelAlign": "left", "labelWidth": 120, "labelWrap": true, "colon": true }
  },
  "eventSettings": {
    "linkageRules": {
      "value": [
        {
          "key": "7b64qp4ytk0", "title": "Personal", "enable": true,
          "condition": {
            "logic": "$and",
            "items": [{ "path": "{{ ctx.formValues.customer_type }}", "operator": "$eq", "value": "PERSONAL", "noValue": false }]
          },
          "actions": [{
            "key": "r4iso5l2fyr", "name": "linkageSetFieldProps",
            "params": { "value": { "fields": ["e241777a612", "decf23aef5b"], "state": "hidden" } }
          }]
        }
      ]
    }
  }
}
```

### FormItemModel Examples

```jsonc
// Basic required field
{ "fieldSettings": { "init": { "dataSourceKey": "main", "collectionName": "nb_tts_customers", "fieldPath": "company_name" } },
  "editItemSettings": { "required": { "required": true } } }

// Read-only + default value + model override
{ "fieldSettings": { "init": { "dataSourceKey": "main", "collectionName": "nb_tts_tickets", "fieldPath": "biz_type_mto" } },
  "editItemSettings": {
    "pattern": { "pattern": "readPretty" },
    "showLabel": { "showLabel": true },
    "titleField": { "titleField": "name" },
    "model": { "use": "DisplayTextFieldModel" },
    "initialValue": { "defaultValue": { "id": 1, "code": "REPAIR", "name": "Equipment Repair" } }
  } }

// Template expression default value
{ "fieldSettings": { "init": { "dataSourceKey": "main", "collectionName": "nb_tts_tickets", "fieldPath": "contact_name" } },
  "editItemSettings": { "initialValue": { "defaultValue": "{{ ctx.user.nickname }}" } } }

// SubForm (embedded association form)
{ "fieldSettings": { "init": { "dataSourceKey": "main", "collectionName": "nb_tts_tickets", "fieldPath": "repair" } },
  "editItemSettings": { "model": { "use": "SubFormFieldModel" } } }
```

### RecordSelectFieldModel Examples

```jsonc
// Basic association select
{ "selectSettings": { "fieldNames": { "label": "name" } } }

// With popup + display style
{ "selectSettings": { "fieldNames": { "label": "name" } },
  "fieldBinding": { "use": "DisplayTextFieldModel" },
  "fieldSettings": { "init": { "dataSourceKey": "main", "collectionName": "nb_tts_tickets", "fieldPath": "biz_type_mto" } },
  "popupSettings": { "openView": { "dataSourceKey": "main", "collectionName": "nb_tts_skill_configs", "associationName": "nb_tts_tickets.biz_type_mto" } },
  "displayFieldSettings": { "clickToOpen": { "clickToOpen": false }, "displayStyle": { "displayStyle": "tag" } } }
```

### FormSubmitActionModel Examples

```jsonc
// Full configuration (with confirm + click event)
{
  "use": "FormSubmitActionModel",
  "subKey": "actions", "subType": "array",
  "stepParams": {
    "buttonSettings": { "general": { "icon": "saveoutlined", "type": "default", "title": "Internal Note", "htmlType": "submit" } },
    "submitSettings": {
      "confirm": { "title": "Submit record", "enable": true, "content": "Are you sure you want to save it?" },
      "saveResource": { "requestConfig": { "params": {} } }
    }
  },
  "flowRegistry": {
    "raiagxf6olm": {
      "on": { "eventName": "click", "defaultParams": { "condition": { "items": [], "logic": "$and" } } },
      "key": "raiagxf6olm", "title": "Event flow",
      "steps": {
        "789eti24l7e": { "key": "789eti24l7e", "use": "runjs", "sort": 1, "flowKey": "raiagxf6olm",
          "defaultParams": { "code": "ctx.form.setFieldsValue({ 'message_type': 'internal_note' });" } }
      }
    }
  }
}

// With workflow trigger
{ "stepParams": {
    "submitSettings": { "saveResource": { "requestConfig": { "params": {} } } },
    "formTriggerWorkflowsActionSettings": {
      "setTriggerWorkflows": { "group": [{ "workflowKey": "st4b1c10s27" }] } }
} }
```

---

## 4. Linkage Rules Quick Reference

Configuration location: `CreateFormModel/EditFormModel.stepParams.eventSettings.linkageRules.value[]`

### Action Types

| name | Purpose | params Format |
|------|---------|--------------|
| `linkageSetFieldProps` | Set field visibility | `{ value: { fields: ["uid1","uid2"], state: "hidden" \| "hiddenReservedValue" } }` |
| `linkageAssignField` | Assign value to field | `{ value: { field: "uid", assignValue: "value" \| "{{ ctx.formValues.xxx }}" } }` |

### Condition Operators

| operator | Meaning | noValue |
|----------|---------|---------|
| `$eq` | Equal to | false |
| `$ne` | Not equal to | false |
| `$empty` | Is empty | true |

### Condition Path Variables

- `{{ ctx.formValues.fieldName }}` -- Current form value
- `{{ ctx.formValues.parent.xxx }}` -- Parent form value (sub-form scenario)
- `{{ ctx.role }}` -- Current user role

### state Values

- `hidden` -- Fully hidden (value is NOT submitted)
- `hiddenReservedValue` -- Hidden but value is preserved (value IS still submitted)

---

## 5. flowRegistry Event Flow Quick Reference

Configuration location: `options.flowRegistry` (sibling of stepParams)

### Structure

```jsonc
{
  "flowKey": {
    "key": "flowKey",
    "title": "Event flow",
    "on": {
      "eventName": "click" | "beforeRender",
      "defaultParams": { "condition": { "logic": "$and", "items": [] } }
    },
    "steps": {
      "stepKey": {
        "key": "stepKey", "use": "runjs" | "customVariable",
        "sort": 1, "flowKey": "flowKey",
        "defaultParams": { "code": "..." }  // runjs
        // or: "variables": [{ "key":"form1", "type":"formValue", "formUid":"uid" }]  // customVariable
      }
    }
  }
}
```

### Event Type Applicability

| eventName | Applicable Models |
|-----------|------------------|
| `click` | FormSubmitActionModel |
| `beforeRender` | RootPageModel, ListBlockModel, JSItemModel, TableColumnModel, CreateFormModel, DetailsItemModel, DetailsBlockModel, MailSendBlockModel |

### runjs ctx Context

- `ctx.form` -- Ant Design Form instance (`setFieldsValue()`, `getFieldsValue()`)
- `ctx.model` -- Current FlowModel (`setHidden(true)`)
- `ctx.record` -- Current record data
- `ctx.React` -- React reference
- `ctx.antd` -- Ant Design component library (`message`, `Modal`, etc.)
- `ctx.role` -- Current role
- `ctx.render()` -- Render React component in JSItemModel

---

## 6. Non-Field Form Items

| Model | stepParams | Purpose |
|-------|-----------|---------|
| MarkdownItemModel | `{ markdownBlockSettings: { editMarkdown: { content: "# Title" } } }` | Static Markdown |
| DividerItemModel | `{ markdownItemSetting: { title: { label, orientation, color, borderColor } } }` | Divider line |
| JSItemModel | `{ jsSettings: { runJs: { version: "v1", code: "ctx.render(<Comp />)" } } }` | Custom React component |

---

## 7. All Field Model Types (by Usage Frequency)

| Model | Count | Description |
|-------|-------|-------------|
| InputFieldModel | 189 | Text input |
| DisplayTextFieldModel | 167 | Read-only text |
| SelectFieldModel | 68 | Dropdown select |
| TextareaFieldModel | 40 | Multi-line text |
| RecordSelectFieldModel | 38 | Association record select |
| DisplayNumberFieldModel | 35 | Read-only number |
| DisplayEnumFieldModel | 33 | Read-only enum |
| CheckboxFieldModel | 27 | Checkbox |
| NumberFieldModel | 25 | Number input |
| VditorFieldModel | 17 | Rich text editor |
| RadioGroupFieldModel | 14 | Radio group |
| DateOnlyFieldModel | 10 | Date picker |
| UploadFieldModel | 3 | File upload |
| CascadeSelectFieldModel | 3 | Cascade select |
| CheckboxGroupFieldModel | 2 | Checkbox group |
| DateTimeTzFieldModel | 2 | Date-time with timezone |

---

## 8. API Form Creation Validation

### API Endpoint

```
POST http://localhost:14000/api/flowModels:save
Authorization: Bearer <token>
Content-Type: application/json
```

### Key Findings

1. **Payload format**: Fields go directly at the body top level, NOT wrapped in `options`. The API automatically stores the body as the `options` column.
2. **Return value**: On success returns `{"data":"<uid>"}`
3. **Tree path**: The API automatically maintains `flowModelTreePath`; no manual insertion needed
4. **Creation order**: Parent before child (FormGrid -> FormItem -> FieldModel), because parentId must already exist

### Complete CreateFormModel Creation Example

```jsonc
// 1. CreateFormModel
{
  "uid": "pm_cform_001",
  "use": "CreateFormModel",
  "subKey": "items",
  "subType": "array",
  "parentId": "parent BlockGridModel uid",
  "sortIndex": 0,
  "stepParams": {
    "resourceSettings": {
      "init": { "dataSourceKey": "main", "collectionName": "nb_pm_projects" }
    }
  },
  "flowRegistry": {}
}

// 2. FormGridModel (layout container)
{
  "uid": "pm_fgrid_001",
  "use": "FormGridModel",
  "subKey": "grid",
  "subType": "object",
  "parentId": "pm_cform_001",
  "sortIndex": 0,
  "stepParams": {
    "gridSettings": {
      "grid": {
        "rows": {
          "row_nm": [["pm_fi_name01", "pm_fi_code01"]],
          "row_ct": [["pm_fi_cate01", "pm_fi_team01"]],
          "row_sp": [["pm_fi_stat01", "pm_fi_prio01"]],
          "row_dt": [["pm_fi_sdat01", "pm_fi_edat01"]],
          "row_bg": [["pm_fi_budg01", "pm_fi_acst01"]],
          "row_ds": [["pm_fi_desc01"]]
        },
        "sizes": {
          "row_nm": [12, 12],
          "row_ct": [12, 12],
          "row_sp": [12, 12],
          "row_dt": [12, 12],
          "row_bg": [12, 12],
          "row_ds": [24]
        }
      }
    }
  },
  "flowRegistry": {}
}

// 3. FormItemModel (one per field)
{
  "uid": "pm_fi_name01",
  "use": "FormItemModel",
  "subKey": "items",
  "subType": "array",
  "parentId": "pm_fgrid_001",
  "sortIndex": 0,
  "stepParams": {
    "fieldSettings": {
      "init": { "dataSourceKey": "main", "collectionName": "nb_pm_projects", "fieldPath": "name" }
    },
    "editItemSettings": { "required": { "required": true } }
  },
  "flowRegistry": {}
}

// 4. Child FieldModel (use is inferred from interface)
{
  "uid": "pm_ff_name01",
  "use": "InputFieldModel",        // Determined by fields.interface="input"
  "subKey": "field",
  "subType": "object",
  "parentId": "pm_fi_name01",
  "sortIndex": 0,
  "stepParams": {},
  "flowRegistry": {}
}

// 5. RecordSelectFieldModel (association fields need selectSettings)
{
  "uid": "pm_ff_cate01",
  "use": "RecordSelectFieldModel",
  "subKey": "field",
  "subType": "object",
  "parentId": "pm_fi_cate01",
  "sortIndex": 0,
  "stepParams": {
    "selectSettings": { "fieldNames": { "label": "name" } }
  },
  "flowRegistry": {}
}

// 6. FormSubmitActionModel
{
  "uid": "pm_submit_001",
  "use": "FormSubmitActionModel",
  "subKey": "actions",
  "subType": "array",
  "parentId": "pm_cform_001",
  "sortIndex": 1,
  "stepParams": {},
  "flowRegistry": {}
}
```

### Verified Field Type Creation Results

| fieldPath | interface | Created Model | stepParams |
|-----------|-----------|--------------|-----------|
| name | input | InputFieldModel | `{}` |
| code | input | InputFieldModel | `{}` |
| description | textarea | TextareaFieldModel | `{}` |
| category | m2o | RecordSelectFieldModel | `{selectSettings:{fieldNames:{label:"name"}}}` |
| team | m2o | RecordSelectFieldModel | `{selectSettings:{fieldNames:{label:"name"}}}` |
| status | select | SelectFieldModel | `{}` |
| priority | select | SelectFieldModel | `{}` |
| start_date | date | DateOnlyFieldModel | `{}` |
| end_date | date | DateOnlyFieldModel | `{}` |
| budget | number | NumberFieldModel | `{}` |
| actual_cost | number | NumberFieldModel | `{}` |

### Validation Query

```sql
-- View the complete form tree
SELECT t.depth, fm.uid, fm.options->>'use' as model,
       fm.options::jsonb->'stepParams'->'fieldSettings'->'init'->>'fieldPath' as field
FROM "flowModelTreePath" t
JOIN "flowModels" fm ON fm.uid = t.descendant
WHERE t.ancestor = 'form_uid'
ORDER BY t.depth, t.sort;
```

---

## Related Documents

- [Page Building Overview](/300000-projects/300008-nocobase-builder/02-page-building/)
- [Event Flow Research -- flowRegistry & Form Logic](/300000-projects/300008-nocobase-builder/02-page-building/research-event-flows/) -- Event flow mechanics, ctx context, CRM quotation case study
- [Research: Actions, Popups, ChildPage](/300000-projects/300008-nocobase-builder/02-page-building/research-actions/)
- [Research: Detail Blocks, Tabs](/300000-projects/300008-nocobase-builder/02-page-building/research-details/)
- [Research: Block Grid Layout](/300000-projects/300008-nocobase-builder/02-page-building/research-layouts/)
