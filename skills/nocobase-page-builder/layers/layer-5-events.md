---
title: "Layer 5: Event Flows"
description: "Form calculations, status sync, auto-fill, and workflow action buttons."
---

# Layer 5: Event Flows

## What this layer adds

Event flows add interactive business logic to forms and blocks:
- **formValuesChange** — auto-calculate totals when fields change (e.g., quotation line items → subtotal → tax → total)
- **beforeRender** — initialize form values, sanitize filters, set defaults
- **afterSubmit** — trigger actions after form submission
- **click** — workflow action buttons (approve, reject, convert)

## Typical Layer 5 gap

```
Layer 5: Event Flows
  Current:   0 events
  Reference: 10 events
  Reference event types:
    4x EditFormModel→formValuesChange
    4x CreateFormModel→formValuesChange
    2x TableBlockModel→beforeRender
```

## Event flow storage

Events are stored in `flowRegistry` on the FlowModel node:

```json
{
  "flowRegistry": {
    "unique_key": {
      "title": "Event flow",
      "key": "unique_key",
      "on": {
        "eventName": "formValuesChange",
        "defaultParams": { "condition": { "items": [], "logic": "$and" } }
      },
      "steps": {
        "step_key": {
          "use": "runjs",
          "sort": 1,
          "key": "step_key",
          "defaultParams": {
            "code": "... your JS code here ..."
          }
        }
      }
    }
  }
}
```

## Adding events via Python

```python
# Add a formValuesChange event to a CreateFormModel
from nocobase_mcp.utils import uid

event_key = uid()
step_key = uid()

code = """
/**
 * Quotation Total Calculation
 * Auto-calculates when form values change.
 */
(async function() {
  var values = ctx.form.values || {};
  var items = values.items || [];

  // Calculate line amounts
  var subtotal = 0;
  items.forEach(function(item) {
    var qty = Number(item.quantity) || 0;
    var price = Number(item.unit_price) || 0;
    item.line_amount = qty * price;
    subtotal += item.line_amount;
  });

  // Calculate totals
  var discount = Number(values.discount_rate) || 0;
  var discount_amount = subtotal * discount;
  var tax_rate = Number(values.tax_rate) || 0;
  var tax_amount = (subtotal - discount_amount) * tax_rate;
  var total = subtotal - discount_amount + tax_amount;

  // Update form fields
  ctx.form.setFieldsValue({
    subtotal: Math.round(subtotal * 100) / 100,
    discount_amount: Math.round(discount_amount * 100) / 100,
    tax_amount: Math.round(tax_amount * 100) / 100,
    total_amount: Math.round(total * 100) / 100,
  });
})();
"""

nb.update(create_form_uid, {
    "flowRegistry": {
        event_key: {
            "title": "Event flow",
            "key": event_key,
            "on": {
                "eventName": "formValuesChange",
                "defaultParams": {"condition": {"items": [], "logic": "$and"}}
            },
            "steps": {
                step_key: {
                    "use": "runjs",
                    "sort": 1,
                    "key": step_key,
                    "defaultParams": {"code": code}
                }
            }
        }
    }
})
```

## Event JS rules (same as chart rules)

- Use `var` not `const`/`let`
- Use `function(){}` not `=>`
- Use `ctx.form.values` or `ctx.form.getFieldsValue()` to read form data
- Use `ctx.form.setFieldsValue({...})` to update fields
- Use `ctx.api.request({url:...})` for API calls
- Wrap in `(async function(){...})()` for async operations

## CRM reference events

From `examples/exported-json/Opportunities_*.json`:
- **Quotation calculation** (9,352b): price tier lookup, line amount calc, discount/tax/total
- **Filter sanitize** (5,407b): fix $dateBetween for flowSql compatibility
- **Mail auto-fill** (181b): set default values on beforeRender

Extract event code:
```python
import json
d = json.load(open("examples/exported-json/Opportunities_vga8g2pgnnu.json"))
# Search for flowRegistry → steps → runjs → defaultParams.code
```

## When you're done with Layer 5

Run `page_gap.py` — Layer 5 is complete when event count matches reference.
The page is now production-ready.
