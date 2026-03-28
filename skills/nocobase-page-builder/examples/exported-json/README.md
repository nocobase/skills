# Exported Page JSON — Primary Code Reference

Full page exports from a CRM system (16 pages, 3099 nodes). This is the **primary reference** for understanding real NocoBase page structures, JS code, and event flows. Use these instead of maintaining separate code snippets.

## Files

Exported from `http://localhost:14202` (CRM system) with `scripts/export_pages.py`.

| File | Nodes | JS | Events | Popups | Highlights |
|------|-------|-----|--------|--------|------------|
| Leads | 1037 | 27 | 21 | 37 | JSEditableField (duplicate check), AI Score column, mail events |
| Opportunities | 574 | 17 | 10 | 18 | **Quotation calc (9.3KB formValuesChange)**, pipeline kanban, stage flow |
| Customers | 415 | 14 | 1 | 18 | Merge page, customer health cards |
| Analytics | 161 | 11 | 3 | 11 | Dashboard charts, KPI blocks |
| Products | 124 | 1 | 0 | 5 | Category tree filter (9KB JSBlock) |
| Orders | 102 | 3 | 1 | 4 | Order progress column, payment items |
| Contacts | 257 | 2 | 8 | 14 | Mail send events |
| Others | ~500 | ~10 | ~10 | ~30 | Stage settings, exchange rates, emails |

## What's included (that findOne misses)

The script uses `flowModels:list` (flat) to build complete trees. Unlike `findOne?subKey=grid`, this includes:

- **Popups** (ChildPageModel) — addnew/edit/detail popups with all nested forms
- **Event flows** (flowRegistry) — formValuesChange calculations, beforeRender hooks
- **Deep nesting** — sub-table popups, nested detail tabs, multi-level drilldowns

## Key code examples inside the exports

### Event flows (flowRegistry → steps → runjs → defaultParams.code)

| Location | Event | Code size | What it does |
|----------|-------|-----------|-------------|
| Opportunities > Quotation addnew/edit | `formValuesChange` | 9,352b | Price tier lookup, line amount calc, discount/tax/total |
| Opportunities > Table | `beforeRender` | 5,407b | Filter sanitize ($dateBetween fix for flowSql) |
| Leads > Table | `beforeRender` | 5,125b | Same filter sanitize pattern |
| Emails > MailDraftSend | `beforeRender` | 181b | Auto-fill default values |

### JS blocks (stepParams.jsSettings.runJs.code)

| Location | Type | Code size | What it does |
|----------|------|-----------|-------------|
| Customers | JSBlockModel | 23,729b | Customer merge page with drag-drop |
| Activities (×3) | JSBlockModel | 16,944b | Activity calendar block |
| Products | JSBlockModel | 9,112b | Category tree filter sidebar |
| Opportunities | JSBlockModel | 8,434b | Pipeline header with filter tabs |
| Opportunities | JSBlockModel | 8,333b | Kanban board (resource-based) |

### JS columns (stepParams.jsSettings.runJs.code)

| Location | Title | Code size | What it does |
|----------|-------|-----------|-------------|
| Leads | Lead Name/Company | 4,793b | Composite column with company badge |
| Leads | AI Score | 3,728b | AI score badge with color coding |
| Orders | Order Progress | 4,649b | Progress bar column |

### JS items (stepParams.jsSettings.runJs.code)

| Location | Code size | What it does |
|----------|-----------|-------------|
| Opportunities | 8,437b | AI risk analysis card |
| Opportunities | 7,843b | Stage flow visualization |
| Orders | 5,519b | Order summary item |
| Leads | 4,484b | Lead profile card |

### JS editable fields

| Location | Code size | What it does |
|----------|-----------|-------------|
| Leads | 8,699b | Lead name with real-time duplicate check |
| Leads | 8,224b | Company name with duplicate check |

## How to extract code from exports

```python
import json

def find_code(obj, results=None):
    """Recursively find all JS code and event code in a tree."""
    if results is None: results = []
    if not isinstance(obj, dict): return results
    use = obj.get("use", "")
    sp = obj.get("stepParams") or {}

    # JS blocks/columns/items/fields
    if use.startswith("JS"):
        code = (sp.get("jsSettings") or {}).get("runJs", {}).get("code", "")
        if code:
            title = sp.get("title", "") or \
                ((sp.get("tableColumnSettings") or {}).get("title") or {}).get("title", "")
            results.append({"type": use, "uid": obj["uid"], "title": title,
                           "code": code, "len": len(code)})

    # Event flows
    fr = obj.get("flowRegistry") or {}
    if isinstance(fr, dict):
        for fv in fr.values():
            if not isinstance(fv, dict): continue
            on = fv.get("on", {})
            event = on.get("eventName", "") if isinstance(on, dict) else str(on)
            for sv in (fv.get("steps") or {}).values():
                if isinstance(sv, dict):
                    code = (sv.get("defaultParams") or {}).get("code", "")
                    if code and len(code) > 50:
                        results.append({"type": f"{use}→{event}", "uid": obj["uid"],
                                       "title": fv.get("title",""), "code": code, "len": len(code)})

    for child in (obj.get("children") or []):
        find_code(child, results)
    return results

# Usage
data = json.load(open("Opportunities_vga8g2pgnnu.json"))
for tab in data["tabs"]:
    if tab.get("tree"):
        codes = find_code(tab["tree"])
        for c in codes:
            print(f"{c['type']:30s} {c['len']:>6}b  {c['title'] or c['uid'][:15]}")
```

## How to regenerate

```bash
python scripts/export_pages.py --base http://localhost:14202 --output examples/exported-json
```
