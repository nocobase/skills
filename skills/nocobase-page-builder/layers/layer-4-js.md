---
title: "Layer 4: JS Blocks & Columns"
description: "Custom JS rendering: composite columns, sidebar charts, detail item cards, KPI blocks."
---

# Layer 4: JS Blocks & Columns

## What this layer adds

JS is for logic-driven rendering that NocoBase can't do natively:
- **JSColumnModel** — composite columns (multi-field), currency, countdown, progress, stars
- **JSBlockModel** — sidebar charts, KPI cards, dashboard panels
- **JSItemModel** — custom items inside detail popups (profile cards, stage flows, AI analysis)
- **JSEditableFieldModel** — custom input with validation (duplicate check, auto-complete)

## Typical Layer 4 gap

```
Layer 4: JS Blocks & Columns
  Current:   2 JS nodes
  Reference: 15 JS nodes
    JSBlockModel              current=0 ref=1 ❌ need +1
    JSColumnModel             current=1 ref=2 ❌ need +1
    JSItemModel               current=1 ref=11 ❌ need +10
```

The biggest gap is usually **JSItemModel** — detail popup items like profile cards, AI analysis, stage flow visualizations.

## JS requirement writing guide

Only add JS when the rendering involves **logic, aggregation, or multi-field composition**:

```
Requirement (from user focus)                    → JS type
─────────────────────────────────────────────────────────────
"Bold name + gray industry + VIP badge"          → JSColumnModel (composite)
"Amount ¥ format, red when >100K"                → JSColumnModel (currency)
"Days left / overdue countdown"                  → JSColumnModel (countdown)
"Win probability progress bar 0-100%"            → JSColumnModel (progress)
"Star rating display ★★★★☆"                      → JSColumnModel (stars)
"Department distribution bar chart"              → JSBlockModel (sidebar)
"KPI: Total/Active/New this month"               → JSBlockModel (KPI card)
"Customer profile card with key metrics"         → JSItemModel (detail item)
"Stage pipeline visualization"                   → JSItemModel (detail item)
"Name input with duplicate check"                → JSEditableFieldModel
```

**Do NOT use JS for**: relation fields, select tags, dates, numbers, plain text.

## Auto-generation workflow

```python
# 1. Auto-generate from templates (handles column types)
result = nb.auto_js("CRM", "/tmp/crm-js/", "skills/nocobase-page-builder/templates/js/")

# 2. Review generated files
import os
for f in sorted(os.listdir("/tmp/crm-js/")):
    code = open(f"/tmp/crm-js/{f}").read()
    if code.startswith("// TODO"):
        print(f"MANUAL: {f} — {code.split(chr(10))[1]}")
    else:
        print(f"AUTO:   {f} — {len(code)}b")

# 3. Write TODO stubs manually, then inject all
for f in sorted(os.listdir("/tmp/crm-js/")):
    code = open(f"/tmp/crm-js/{f}").read().strip()
    if code and not code.startswith("// TODO"):
        nb.inject_js(f.replace(".js", ""), code)
```

## Adding JSItemModel to detail popups

Detail popup items (profile cards, AI analysis) need to be added AFTER the detail popup exists:

```python
# Find the detail popup's DetailsGridModel
# Add a JSItemModel to it
code = """(async function() {
  var h = ctx.React.createElement;
  var Spin = ctx.antd.Spin;
  ctx.render(h(Spin));
  // ... fetch and render
})();"""

nb.js_item(details_grid_uid, "Profile Card", code, sort=0)
```

## CRM reference examples

See `examples/exported-json/` for real JS code from the CRM:
- Leads: 27 JS nodes (duplicate check inputs, AI score column, sidebar charts)
- Opportunities: 19 JS nodes (pipeline header, kanban, stage flow, risk analysis)
- Customers: 15 JS nodes (merge page, customer health cards)

Extract JS code from exports:
```python
import json
d = json.load(open("examples/exported-json/Leads_e9478uhrdve.json"))
# Use the find_code() function from exported-json/README.md
```

## When you're done with Layer 4

Run `page_gap.py` — Layer 4 is complete when JS node count matches reference.
Proceed to `layer-5-events.md`.
