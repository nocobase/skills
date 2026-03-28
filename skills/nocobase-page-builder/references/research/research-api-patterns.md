---
title: "FlowModel API Key Findings"
description: "Trial-and-error lessons and critical patterns for the NocoBase FlowPage 2.0 API"
tags: [nocobase, flowmodel, api, research]
sidebar:
  order: 11
---

# FlowModel API Key Findings

> **Source**: Pitfalls and solutions discovered during hands-on page building. Every item here is a real bug or a behavioral quirk that took half a day of debugging to figure out.

---

## 1. flowModels:update Is a Full Replace (Critical Bug Pattern)

**The most dangerous pitfall**: When you call `flowModels:update?filterByTk=<uid>` with `{"options": {...}}`, the **entire options object is replaced**, not merged.

If you only send:

```json
POST /api/flowModels:update?filterByTk=abc123
{
  "options": {
    "stepParams": {
      "gridSettings": { "grid": { "rows": {"r1": [["b1"]]} } }
    }
  }
}
```

**Result**: `use`, `parentId`, `subKey`, `subType`, `sortIndex`, `flowRegistry` are all lost. The node becomes a crippled record with only `stepParams`, and the frontend shows a blank screen.

### Safe Update Pattern

**You must GET the full data first, deep merge, then PUT the complete result**:

```python
import copy

def _deep_merge(base: dict, patch: dict) -> dict:
    """Recursively merge patch into base, modifying base in place and returning it."""
    for k, v in patch.items():
        if k in base and isinstance(base[k], dict) and isinstance(v, dict):
            _deep_merge(base[k], v)
        else:
            base[k] = v
    return base

def safe_update(session, base_url, uid, patch):
    """Safely update a FlowModel: GET → merge → PUT."""
    r = session.get(f"{base_url}/api/flowModels:get?filterByTk={uid}")
    data = r.json().get("data", {})
    # GET returns flat data; strip uid/name to form options
    opts = {k: v for k, v in data.items() if k not in ("uid", "name")}
    _deep_merge(opts, patch)
    session.post(
        f"{base_url}/api/flowModels:update?filterByTk={uid}",
        json={"options": opts}
    )
```

**Rule**: Never call `flowModels:update` directly unless you are sending a complete options object.

---

## 2. GET vs UPDATE Data Format Asymmetry

This is the second biggest source of confusion: **read and write use different data formats**.

| API | Data Format | Example |
|-----|-------------|---------|
| `flowModels:get` | **Flat** | `{uid, name, use, parentId, subKey, subType, stepParams, sortIndex, flowRegistry}` |
| `flowModels:list` | **Flat** | Same as above |
| `flowModels:update` | **Wrapped in options** | `{"options": {use, parentId, subKey, subType, stepParams, ...}}` |
| `flowModels:save` | **Flat** | `{uid, use, parentId, subKey, subType, stepParams, ...}` |

**Notes**:
- On `get`/`list` responses, NocoBase automatically expands the `options` JSON field into top-level properties
- On `update` writes, you must manually wrap back into `{"options": {...}}`
- `save` is a special interface (`upsertModel`) that accepts flat data directly and handles the conversion internally

**Practical advice**: Prefer `flowModels:save` over `flowModels:update`. The save format matches get, eliminating the need for back-and-forth conversion.

---

## 3. Limitations of flowModels:findOne

`flowModels:findOne` accepts `{"uid": "xxx", "includeAsyncNode": false}` and returns a tree structure with `subModels`.

**However, it returns empty for two types of nodes**:

1. **Tab nodes created via routes** — Tabs created through `desktopRoutes:create` have FlowModels with only `{uid, name, options: {schema: {use: "RouteModel"}}}`. findOne returns empty subModels for these nodes, even when they actually have child nodes.

2. **Certain nodes with ChildPageModel** — Such as `DisplayTextFieldModel` subtrees associated via `popupSettings` with ChildPageModel, which findOne may also not return.

### Alternative: Build tree manually from list

```python
def build_tree(session, base_url):
    """Build a complete tree from flowModels:list."""
    r = session.get(f"{base_url}/api/flowModels:list?paginate=false")
    models = r.json().get("data", [])

    by_uid = {m["uid"]: m for m in models}
    children = {}  # parentId -> [child_models]

    for m in models:
        pid = m.get("parentId")
        if pid:
            children.setdefault(pid, []).append(m)

    # Sort
    for kids in children.values():
        kids.sort(key=lambda x: x.get("sortIndex", 0))

    return by_uid, children
```

**Use case**: When you need to traverse the full page tree, do bulk analysis, or perform migrations, building from list + parentId is more reliable than findOne.

---

## 4. gridSettings.rows Format

The `BlockGridModel` layout is controlled by `stepParams.gridSettings.grid.rows` and `stepParams.gridSettings.grid.sizes`.

### rows Structure

`rows` is a dict where keys are rowIds and values are 2D arrays:

```json
{
  "rows": {
    "row-uid-1": [["block-uid-a", "block-uid-b"]],
    "row-uid-2": [["block-uid-c"], ["block-uid-d"]]
  }
}
```

**Interpretation**:
- Each element of the outer array = **one column**
- Each element of the inner array = blocks **stacked vertically** within that column

| Expression | Meaning |
|------------|---------|
| `[["uid1", "uid2"]]` | **Single column**, two blocks stacked vertically |
| `[["uid1"], ["uid2"]]` | **Two columns**, one block each, side by side |
| `[["uid1", "uid2"], ["uid3"]]` | **Two columns**, left column has two stacked blocks, right column has one |

### sizes Structure

`sizes` controls column widths using the Ant Design 24-column grid system:

```json
{
  "sizes": {
    "row-uid-1": [24],
    "row-uid-2": [12, 12]
  }
}
```

- `[24]` = single column, full width
- `[12, 12]` = two columns at 50% each
- `[8, 16]` = left column 33%, right column 67%
- The sizes array length must match the number of columns in the corresponding row

---

## 5. Route Nodes vs FlowModel Nodes

`desktopRoutes:create` affects two tables simultaneously — understanding this distinction is important.

### What Happens on Creation

```
desktopRoutes:create(type="flowPage", schemaUid="X", children=[{type="tabs", schemaUid="Y"}])
```

**Auto-created**:
1. `desktopRoutes` table: route records (page + tab sub-routes)
2. `flowModels` table: RouteModel stubs (uid=X and uid=Y, options only contains `{schema: {use: "RouteModel"}}`)
3. RootPageModel is automatically mounted under the page RouteModel

### Different Lifecycles for the Two Tables

| Operation | desktopRoutes | flowModels |
|-----------|--------------|------------|
| Create route | New route record added | RouteModel stubs auto-created |
| Add blocks | No change | New BlockGridModel/TableBlockModel etc. added |
| Rebuild page content | No change | Delete FlowModel descendants, RouteModel preserved |
| Delete entire page | `desktopRoutes:destroy` | All associated FlowModels cascade-deleted |

**Practical implication**: If you only need to rebuild page content (keeping the menu), just delete the FlowModel descendants — don't touch desktopRoutes.

### How to Find the Tab UID

```python
# Get accessible route tree
r = session.get(f"{base_url}/api/desktopRoutes:listAccessible?paginate=false")
routes = r.json().get("data", [])

for route in routes:
    if route["type"] == "flowPage":
        page_uid = route["schemaUid"]
        # Tab UID is in children
        for child in route.get("children", []):
            if child["type"] == "tabs":
                tab_uid = child["schemaUid"]
```

---

## 6. Upsert Behavior of flowModels:save

`flowModels:save` is an upsert interface:

| Condition | Behavior |
|-----------|----------|
| uid does not exist | Creates new record + auto-creates flowModelTreePath entries |
| uid already exists | Updates existing record (preserves existing tree path relationships) |

### Key Details

1. **parentId auto-handles tree paths**: When saving with a parentId, the closure table `flowModelTreePath` automatically gets all ancestor-descendant relationships inserted — no manual management needed.

2. **Flat format**: The body is the model data directly, no wrapping needed:

```json
POST /api/flowModels:save
{
  "uid": "abc12345678",
  "use": "TableBlockModel",
  "parentId": "parent-uid",
  "subKey": "items",
  "subType": "array",
  "stepParams": { ... },
  "sortIndex": 0,
  "flowRegistry": {}
}
```

3. **Return value**: `{"data": "<uid>"}` — only returns the uid string, not the full model.

4. **Difference from update**: save is safer because it accepts flat format and won't accidentally lose fields. **Prefer save over update**.

---

## 7. flowModels:save Cannot Re-parent Existing Nodes

**Pitfall scenario**: Trying to use `flowModels:save` to move an existing block from `parentId=tab` to `parentId=grid` — at the data level the parentId does change, but **the frontend rendering engine doesn't recognize it**, and the page appears blank.

### Cause

The NocoBase rendering tree relies on the `flowModelTreePath` closure table to find ancestor-descendant relationships for nodes. The upsert behavior of `flowModels:save` automatically maintains the closure table **on creation**, but **does not rebuild closure table paths** when an existing node's `parentId` changes. The result:

- `flowModels:list` shows the updated `parentId` ✓
- `flowModelTreePath` ancestor chain still points to the old parent ✗
- Frontend traverses the tree via the closure table and can't find the node → blank

### Correct Approach

**Don't re-parent. Instead, create the container first, then create child nodes directly under the correct parent.**

```python
# ✗ Wrong: create then re-parent
tbl = nb.save("TableBlockModel", tab_uid, "items", "array", ...)   # Mount to tab first
grid = nb.save("BlockGridModel", tab_uid, "grid", "object", ...)   # Create grid
nb.s.post("flowModels:save", json={"uid": tbl, "parentId": grid})  # re-parent — doesn't work!

# ✓ Correct: create container first, mount children directly under it
grid = nb.save("BlockGridModel", tab_uid, "grid", "object", ...)   # Create grid first
tbl = nb.save("TableBlockModel", grid, "items", "array", ...)      # Mount directly to grid
```

### Implementation in the Builder

```python
# page_layout() only creates the grid, returns UID
grid = nb.page_layout(tab_uid)

# All blocks are created directly under the grid
js1 = nb.js_block(grid, "KPI", code, sort=0)
tbl, an, ac = nb.table_block(grid, coll, fields, sort=1)

# Set layout last
nb.set_layout(grid, [
    [(js1, 12), (js2, 12)],
    (tbl,),
])
```

**Rule**: A node's parentId must be determined at `flowModels:save` creation time and cannot be changed afterward.

---

## 8. filterManager — BlockGridModel's Filter Association Configuration

**How it was discovered**: After creating a filter form, input had no effect. By intercepting browser network requests, we found that `filterManager` is a **top-level field** on BlockGridModel (not inside stepParams or options).

### filterManager Structure

`filterManager` is an array on BlockGridModel that connects filter inputs to target tables:

```json
POST /api/flowModels:save
{
  "uid": "grid-uid",
  "filterManager": [
    {
      "filterId": "filter-form-item-uid",
      "targetId": "table-block-uid",
      "filterPaths": ["title", "ticket_no", "customer.company_name", "customer.email"]
    }
  ]
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `filterId` | string | UID of the FilterFormItemModel (filter input) |
| `targetId` | string | UID of the TableBlockModel (target table) |
| `filterPaths` | string[] | List of fields this input searches (supports association field paths like `customer.email`) |

### Key Points

1. **One input searches multiple columns**: The `filterPaths` array determines which fields a single input can search. The CRM v3 ticket search box has filterPaths with 7 fields (title, ticket_no, customer name, email, phone, etc.), achieving "search the whole table from one input"

2. **Top-level field, not inside options**: Must be written via `flowModels:save` (flat format), not via `flowModels:update` (which wraps it in options, rendering it ineffective)

3. **Mounted on BlockGridModel**: Not on FilterFormBlockModel or TableBlockModel, but on the BlockGridModel (page grid) that contains them

4. **Multiple filter-table pairs**: The filterManager array can contain multiple entries, supporting multiple filter forms on the same page each associated with different tables

### Implementation in the Builder

```python
# filter_form() creates the filter input and records the mapping
fb, fi = nb.filter_form(grid, "nb_pm_projects", "name",
    target_uid=tbl, label="Search",
    search_fields=["name", "code", "description"])

# set_layout() automatically writes the mapping to BlockGridModel's filterManager
nb.set_layout(grid, [
    (fb, tbl),  # filter form + table in same row
])
# → Internally executes flowModels:save({uid: grid, filterManager: [{filterId: fi, targetId: tbl, filterPaths: [...]}]})
```

**Rule**: After creating a filter form, you must set filterManager on the BlockGridModel, otherwise filtering has no effect.

---

## 8. filterManager — BlockGridModel's Filter Association Configuration

**Discovery scenario**: `FilterFormModel` + `FilterFormItemModel` were created, the form was visible but clicking filter had no effect. The cause was a missing `filterManager` configuration.

### What is filterManager

`filterManager` is a **top-level field on BlockGridModel** (not inside `stepParams` or `options`), used to connect filter forms to target tables.

```json
GET /api/flowModels:get?filterByTk=<grid_uid>
{
  "uid": "grid-uid",
  "use": "BlockGridModel",
  "parentId": "...",
  "stepParams": { "gridSettings": {...} },
  "filterManager": [
    {
      "filterId": "filter-form-item-uid",
      "targetId": "table-block-uid",
      "filterPaths": ["title", "ticket_no", "customer.company_name", "customer.email"]
    }
  ]
}
```

### Key Fields

| Field | Meaning |
|-------|---------|
| `filterId` | UID of FilterFormItemModel (**not** FilterFormModel, but the specific input) |
| `targetId` | UID of the target TableBlockModel |
| `filterPaths` | String array — list of field paths this input searches |

### The Power of filterPaths

`filterPaths` is the key to "one input searches multiple columns". For example, the CRM v3 ticket search box configuration:

```json
{
  "filterId": "search-input-uid",
  "targetId": "ticket-table-uid",
  "filterPaths": [
    "title",
    "ticket_no",
    "customer.company_name",
    "customer.email",
    "customer.phone",
    "biz_type_mto.name",
    "contact_name"
  ]
}
```

A user types in one search box and it fuzzy-matches across 7 fields simultaneously (including association table fields like `customer.company_name`).

### How to Write filterManager

Since `filterManager` is a top-level field, it must be written via `flowModels:save` (flat format):

```python
# ✓ Correct: use flowModels:save to write top-level fields
session.post(f"{base_url}/api/flowModels:save", json={
    "uid": grid_uid,
    "filterManager": [
        {"filterId": fi_uid, "targetId": tbl_uid, "filterPaths": ["name", "code", "description"]}
    ]
})

# ✗ Wrong: flowModels:update options doesn't have filterManager
session.post(f"{base_url}/api/flowModels:update?filterByTk={grid_uid}", json={
    "options": {"filterManager": [...]}  # won't work
})
```

### Implementation in the Builder

```python
# filter_form() stores the mapping
fb, fi = nb.filter_form(grid, coll, "name", target_uid=tbl,
    label="Search", search_fields=["name", "code", "description"])

# set_layout() automatically writes filterManager
nb.set_layout(grid, [
    (fb, tbl),           # filter + table
])
# → Internally detects _filter_mappings and calls flowModels:save to write filterManager
```

**Rule**: FilterFormItemModel only creates the input control. What actually makes filtering work is the `filterManager` configuration on the BlockGridModel.

---

## Summary: API Selection Decision Tree

```
Need to create a new node?
  → flowModels:save (flat format, auto-mounts to tree)

Need to update an existing node?
  → Prefer flowModels:save (flat format, upsert)
  → If you must use flowModels:update → GET first, deep merge, then PUT the full object

Need to read a single node?
  → flowModels:get?filterByTk=<uid> (flat response)

Need to read the page tree?
  → flowModels:list?paginate=false + build tree by parentId
  → Don't rely on flowModels:findOne (returns empty for RouteModel tab nodes)

Need to delete?
  → flowModels:destroy?filterByTk=<uid>
  → Delete page including menu: desktopRoutes:destroy
```

---

## Related Documents

- [Page Building Standard Workflow](/300000-projects/300008-nocobase-builder/02-page-building/usage/) — Complete page creation steps and verified APIs
- [Event Flow Research — flowRegistry and Form Logic](/300000-projects/300008-nocobase-builder/02-page-building/research-event-flows/) — Event flow mechanism, available events, ctx context
- [Full Automation Workflow Overview](/300000-projects/300008-nocobase-builder/automation-overview/) — Five-phase automation pipeline panorama
