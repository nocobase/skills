---
title: "Page Structure Export (JSON)"
description: "Export complete FlowModel v2 page trees as JSON via the three-API chain — for analysis, cross-instance comparison, agent reference, and debugging."
tags: [nocobase, flowmodel, export, api, page-building]
---

# Page Structure Export (JSON)

> Export the complete node tree of FlowModel v2 pages as JSON files. Use for structure analysis, cross-instance comparison, AI agent learning reference, and debugging.

## Step 0: Get the Route Tree

Before exporting page content, fetch the complete menu structure via the routes API:

```
GET /api/desktopRoutes:list?tree=true&paginate=false
```

Returns a nested route tree. Each node contains:

| Field | Description |
|-------|-------------|
| `id` | Route ID (integer) |
| `parentId` | Parent route ID |
| `title` | Menu display name |
| `type` | `group` / `page` / `flowPage` / `tabs` / `link` |
| `schemaUid` | Associated schema UID (flowPage/tabs use this to query flowModels) |
| `icon` | Menu icon (Ant Design icon name) |
| `sort` | Sort order among siblings |
| `hideInMenu` | Whether hidden from menu |
| `enableTabs` | Whether multi-tab is enabled |
| `children` | Child routes (nested when tree=true) |

### Route Types

| type | Description | Has content? |
|------|-------------|-------------|
| `group` | Menu folder | No, only contains child routes |
| `page` | Legacy uiSchema page (1.x) | Yes, but uses uiSchemas system |
| `flowPage` | FlowModel v2 page (2.0+) | Yes, uses flowModels system |
| `tabs` | Tab under a page | Yes, schemaUid is the parentId for content queries |
| `link` | External link | No |

### Route Tree Example

```
group       CRM                    icon=bookoutlined
  flowPage    Dashboard            schema=c583sib22fj
    tabs        (untitled)         schema=pd58qd1uomq     ← content lives here
  flowPage    Leads                schema=w38ecefrtwz
    tabs        (untitled)         schema=ap7o44vwa23     ← content lives here
  flowPage    Products             schema=cd57hg1ja87
    tabs        products           schema=v8cez3d1v7w     ← content lives here
  group       Settings             icon=settingoutlined
    flowPage    Demo Data          schema=unf5udwxt7w
      tabs        (untitled)       schema=qeou29m2rgm   ← content lives here
```

> **Key point**: flowPage itself is the shell; actual content is stored under its tabs child route's schemaUid.

## Three-API Chain for Page Content Export

After getting the route tree, for each flowPage's tabs, the frontend makes three sequential API calls to fetch page content:

```
1. uiSchemas:getJsonSchema/{schemaUid}     → confirm page exists (legacy schema layer)
2. flowModels:findOne?parentId={schemaUid}&subKey=page  → get RootPageModel
3. flowModels:findOne?parentId={tabUid}&subKey=grid      → get full content tree
```

**Step 3 is the key**: `findOne` recursively returns `subModels`, fetching the entire node tree in one call (blocks, fields, buttons, popups — everything nested inside).

### API Details

| # | API | Input | Returns | Purpose |
|---|-----|-------|---------|---------|
| 1 | `uiSchemas:getJsonSchema/{uid}` | Route's schemaUid | `{type, x-component, x-uid}` | Verify page exists; confirm identity via x-uid |
| 2 | `flowModels:findOne?parentId={schemaUid}&subKey=page` | Page schemaUid | RootPageModel (uid, use, subModels=[]) | Confirm it's a FlowModel v2 page |
| 3 | `flowModels:findOne?parentId={tabUid}&subKey=grid` | **Tab's** schemaUid | BlockGridModel + recursive subModels | Complete page content tree |

> **Key distinction**: Step 2's `parentId` is the flowPage's schemaUid, while step 3's `parentId` is the **tab's** schemaUid.
> A page can have multiple tabs; each tab requires a separate step 3 call.

### UID Relationship

```
Route (flowPage)
  schemaUid = "w38ecefrtwz"          ← used by steps 1 and 2
  └─ Route (tabs)
       schemaUid = "ap7o44vwa23"     ← used by step 3
```

The route tree is obtained via `desktopRoutes:list?tree=true`, which contains all schemaUids.

## Export Script

A ready-to-run Python script is provided at [scripts/export_pages.py](../../scripts/export_pages.py).

### Usage

```bash
# Export all pages
python scripts/export_pages.py --base http://localhost:14000 --output ./export

# Export only pages under the "CRM" group
python scripts/export_pages.py --base http://localhost:14000 --output ./export --prefix "CRM"
```

### Example Output

```
Found 16 pages to export

  Analytics             161 nodes  [(default)(161)]  -> Dashboards_Analytics_z6hewbckw91.json
  Overview               45 nodes  [(default)(45)]   -> Dashboards_Overview_ohlak5xbwo1.json
  Leads                1037 nodes  [(default)(1037)] -> Leads_e9478uhrdve.json
  Customers             415 nodes  [Customers(312) + Merge(103)]  -> Customers_c137kk6hghm.json
  ...

Total: 16 pages, 4022 nodes -> ./export/
```

## JSON Structure

### Top-level format

```json
{
  "title": "Orders",
  "path": "Orders",
  "uid": "x9u01x7l8wj",
  "tabs": [
    {
      "title": null,
      "uid": "v2cip6snhwt",
      "nodes": 102,
      "tree": {
        "uid": "a576535033e",
        "use": "BlockGridModel",
        "parentId": "v2cip6snhwt",
        "subKey": "grid",
        "stepParams": {
          "gridSettings": {
            "grid": { "rows": {"rowId": [["uid1"],["uid2"]]} },
            "sizes": {"rowId": [24]}
          }
        },
        "subModels": {
          "items": [
            { "uid": "...", "use": "TableBlockModel", "subModels": { "..." } }
          ]
        }
      }
    }
  ]
}
```

### Node Type Quick Reference

| use | Description | Typical Location |
|-----|-------------|-----------------|
| `BlockGridModel` | Layout grid container | Root node under tab |
| `TableBlockModel` | Data table | grid → items |
| `FormBlockModel` | Form | grid → items or inside popup |
| `DetailsBlockModel` | Detail block | Inside popup |
| `JSBlockModel` | JS sandbox block | grid → items (KPI cards, filters, etc.) |
| `ChartBlockModel` | Chart block | grid → items |
| `FilterFormBlockModel` | Filter form | grid → items |
| `ChildPageModel` | Popup / drawer | Button's subModels |

### gridSettings.rows Layout Rules

`rows` controls how blocks are arranged on the page:

```json
{
  "rows": {
    "row1": [["uid_a"], ["uid_b"]],
    "row2": [["uid_c"]]
  },
  "sizes": {
    "row1": [12, 12],
    "row2": [24]
  }
}
```

- `row1: [["uid_a"], ["uid_b"]]` → one row, two columns, uid_a and uid_b side by side
- `sizes: [12, 12]` → each takes 12/24 width (Ant Design 24-column grid)
- Row order = dict key insertion order

## Important: findOne does NOT return popups

`findOne?subKey=grid` only returns the top-level grid and its direct subModels. **Popups (ChildPageModel) are loaded asynchronously** and are NOT included in the findOne response.

The export script (`scripts/export_pages.py`) uses `flowModels:list` (flat) to build complete trees that include everything. This is the correct approach for full exports.

```
TableBlockModel
  └─ subModels.actions
      └─ AddNewActionModel
          └─ subModels.page
              └─ ChildPageModel              ← popup shell
                  └─ subModels.tabs
                      └─ ChildPageTabModel
                          └─ subModels.grid
                              └─ BlockGridModel
                                  └─ subModels.items
                                      └─ CreateFormModel   ← form inside popup
```

A typical CRM page has 2-50+ ChildPageModel nodes (addnew, edit, detail popups, nested sub-popups).

## Real export examples

See [examples/exported-json/](../../examples/exported-json/) for 3 real CRM page exports with JS blocks, computed columns, and popup trees.

## Use Cases for Exported JSON

| Use Case | How |
|----------|-----|
| **Structure analysis** | Parse JSON to count node types, field coverage, JS block count |
| **Cross-instance comparison** | Export from two instances, diff to find differences |
| **AI agent reference** | Let agents read JSON to understand page structure as a template for building new systems |
| **Documentation generation** | Auto-generate business documentation from the node tree |
| **Quick debugging** | Search exported JSON with regex to find specific fields, UIDs, or configurations |
| **Backup** | Combine with pg_dump for complete backup; JSON enables structure-level quick verification |

## Analysis Tips

### Find all JS blocks and their code

```bash
# Extract all JSBlockModel nodes with their titles
cat export/*.json | python3 -c "
import json, sys
for line in sys.stdin:
    data = json.loads(line) if line.strip().startswith('{') else None
"
# Or use jq:
jq -r '.. | select(.use? == "JSBlockModel") | .uid + " " + (.stepParams.title // "untitled")' export/*.json
```

### Count nodes by type

```bash
grep -oh '"use": "[^"]*"' export/*.json | sort | uniq -c | sort -rn
```

### Find all collections used

```bash
grep -oh '"collection": "[^"]*"' export/*.json | sort -u
```

### Compare two exports

```bash
diff <(jq -S . old/Page.json) <(jq -S . new/Page.json)
```
