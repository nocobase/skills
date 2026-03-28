---
title: "Event Flow Research -- flowRegistry & Form Logic"
description: "NocoBase FlowPage 2.0 event flow mechanics, available events, ctx context, and real-world use cases"
tags: [nocobase, flowmodel, event-flow, research]
sidebar:
  order: 15
---

## Overview

Event flows are defined on the `flowRegistry` of FlowModel nodes. They allow JS logic to run in response to specific events -- such as form value changes, rendering, clicks, etc. This is the primary mechanism for form logic control (auto-calculation, auto-fill, validation), replacing traditional linkage rules and default value patterns with more flexible JS code.

## Available Event Names

Source: `FlowEventName` enum in source code and actual usage scenarios:

- `formValuesChange` -- Form value change; used for auto-calculation, auto-fill, linkage
- `beforeRender` -- Before render (parallel execution + caching); used for initialization
- `click` -- Click event
- `submit` -- Submit event
- `reset` -- Reset event
- `remove` -- Delete event
- `openView` -- Open view
- `dropdownOpen` / `popupScroll` / `search` -- UI interaction events
- `customRequest` -- Custom request
- `collapseToggle` -- Collapse toggle
- Supports arbitrary custom strings

## ctx Context Object

Key properties available in `runjs` steps:

- `ctx.form` -- Form instance (`ctx.form.values`, `ctx.form.setFieldsValue({...})`)
- `ctx.model` -- Current FlowModel (`ctx.model.setFieldsValue()`)
- `ctx.api` -- API requests (`ctx.api.request({url, method, params})`)
- `ctx.record` -- Current record data (read-only)
- `ctx.formValues` -- Form values snapshot
- `ctx.React` -- React module
- `ctx.antd` -- Ant Design component library
- `ctx.antdConfig` -- Ant Design configuration (theme, etc.)
- `ctx.dayjs` -- Date handling
- `ctx.message` -- Message toast
- `ctx.notification` -- Notifications
- `ctx.modal` -- Modal dialog
- `ctx.t()` -- i18n translation
- `ctx.token` -- Auth token
- `ctx.exit()` -- Stop flow execution

## flowRegistry JSON Structure

```json
{
  "flowKey": {
    "key": "flowKey",
    "title": "Event flow",
    "on": {
      "eventName": "formValuesChange",
      "defaultParams": {
        "condition": { "logic": "$and", "items": [] }
      }
    },
    "steps": {
      "stepKey": {
        "key": "stepKey",
        "use": "runjs",
        "sort": 1,
        "flowKey": "flowKey",
        "defaultParams": {
          "code": "// JS code here\nctx.form.setFieldsValue({total: 100})"
        }
      }
    }
  }
}
```

## CRM v3 Real-World Case: Quotation Calculation

From the quotation form on port 14003:

### Structure

- `CreateFormModel` with a `formValuesChange` event flow attached
- A single `runjs` step with 9352 characters of async calculation code
- Listens to all form field changes; auto-calculates subtotal/discount/tax/total
- Dynamically queries price tiers via `ctx.api.request()`
- Writes calculated results back via `ctx.form.setFieldsValue()`

### Default Value Patterns

- `editItemSettings.initialValue.defaultValue` supports template expressions
- `"{{ ctx.popup.parent.record }}"` -- Inherit from parent popup's record
- `"{{ ctx.popup.parent.record.contact }}"` -- Inherit an association field

### JSItem Use Cases

- Embedded info tips within forms (rendered using `ctx.antd` components)
- Formula explanations, operation hints
- Supports dark theme detection

### JSFormActionModel

- Custom action button in forms
- Empty `stepParams`; behavior defined via `flowRegistry`

## Event Attachment Locations

| Model Type | Common Events | Purpose |
|-----------|--------------|---------|
| CreateFormModel | formValuesChange | Auto-calculation in create forms |
| EditFormModel | formValuesChange | Auto-calculation in edit forms |
| MailSendBlockModel | beforeRender | Initialize default values before render |
| FormItemModel | Custom | Field-level events (rarely used) |
| Any Model | beforeRender | Initialization logic |

## Encapsulation Patterns for Builder

```python
# 1. Add formValuesChange event to a form
nb.event_flow(form_uid, "formValuesChange", """
// Requirement: Auto-calculate total
// ctx.form.values has all field values
// Use ctx.form.setFieldsValue({field: value}) to update
""")

# 2. JS requirement placeholder block
nb.js_block(grid_uid, "Statistics Chart", """
// TODO: Implement project statistics chart
// ctx.api.request() to query data
// ctx.React.createElement() to render
// ctx.antd has all Ant Design components available
""")

# 3. JS form hint
nb.js_item(form_grid_uid, "Instructions", """
ctx.render(ctx.React.createElement('div',
  {style:{padding:8, color:'#999'}},
  'Hint text'))
""")
```

## Related Documents

- [FlowModel API Key Findings](/300000-projects/300008-nocobase-builder/02-page-building/research-api-patterns/)
- [Page Building Standard Workflow](/300000-projects/300008-nocobase-builder/02-page-building/usage/)
- [Form Research](/300000-projects/300008-nocobase-builder/02-page-building/research-forms/)
