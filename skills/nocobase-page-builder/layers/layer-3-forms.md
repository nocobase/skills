---
title: "Layer 3: Forms & Sections"
description: "Rich form layouts with section grouping, field validation, and popup-internal forms."
---

# Layer 3: Forms & Sections

## What this layer adds

Layer 1 creates basic addnew/edit forms. Layer 3 enriches them:
- Section dividers grouping related fields
- Popup-internal forms (create/edit inside subtable popups)
- Required field marking
- Form field count matching the reference

## Typical Layer 3 gap

```
Layer 3: Forms (inside popups)
  Current:   2 forms
  Reference: 6 forms
  ❌ Missing 4 forms (popup-internal create/edit forms)
```

The missing forms are inside Layer 2's subtable popups — each subtable needs its own addnew/edit forms.

## Form section pattern (MUST use)

All forms MUST use `<section>/<row>/<field>` XML children:

```xml
<addnew>
  <section title="Basic Info">
    <row><field name="name" required="true" /><field name="code" /></row>
    <row><field name="status" /><field name="category" /></row>
  </section>
  <section title="Financial">
    <row><field name="amount" /><field name="currency" /></row>
    <row><field name="discount_rate" /><field name="total" /></row>
  </section>
  <section title="Notes">
    <field name="description" />
  </section>
</addnew>
```

Rules:
- 2 fields per row (recommended), max 4
- Group by business domain (Basic, Financial, Contact, Schedule, Notes)
- `required="true"` on key fields (name, code, etc.)
- Description/notes fields always full width (no `<row>`)

## Adding forms to subtable popups

After Layer 2 adds subtable tabs, each subtable's AddNew button creates a bare popup. Enrich it:

```python
# Find the subtable's AddNewActionModel
# The subtable structure: TableBlockModel → actions → AddNewActionModel → page → ChildPageModel

# Create form inside the popup
addnew_form_markup = """name|phone
email|title
is_primary"""

# Or use the NB client to build the form
form_grid = nb.form_grid("nb_crm_contacts", addnew_form_markup)
# Attach to the popup's CreateFormModel
```

## When you're done with Layer 3

Run `page_gap.py` — Layer 3 is complete when:
- ✅ All forms have section dividers
- ✅ Subtable popups have their own create/edit forms
- ✅ Form count matches reference

Proceed to `layer-4-js.md`.
