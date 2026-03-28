---
title: Critical Gotchas and Caveats
description: Key FlowModel API pitfalls distilled from real-world CRM/HRM/AM projects. Required reading when building or maintaining pages.
---

# Critical Gotchas and Caveats

## API Layer

### 1. flowModels:update Is a Full Replace (Most Dangerous!)

`flowModels:update?filterByTk=<uid>` with `{"options": {...}}` **replaces the entire options object**.

**Correct approach**: GET → deep_merge → PUT. Never send partial fields.

```python
# client.py update() already encapsulates this logic
old = nb._get_json(f"flowModels:get?filterByTk={uid}")
deep_merge(old["options"], patch)
nb._post(f"flowModels:update?filterByTk={uid}", json={"options": old["options"]})
```

### 2. API Format Asymmetry

| Operation | Format |
|-----------|--------|
| `flowModels:get/list` | Flat: `{uid, name, use, parentId, stepParams, ...}` |
| `flowModels:update` | Requires options wrapper: `{"options": {use, parentId, stepParams, ...}}` |
| `flowModels:save` | Flat format (safer, performs upsert) |

**Recommendation**: Prefer `flowModels:save` (flat format); avoid calling `flowModels:update` directly.

### 3. AI Employee API Uses Flat JSON

`aiEmployees:create` and `aiEmployees:update` do **not** use the `{"values": {...}}` wrapper. Send the flat JSON body directly.

This differs from the values wrapper pattern used by collections/fields/flowModels.

## Rendering Layer

### 4. gridSettings.rows Controls All Rendering

Nodes **must** be present in `gridSettings.grid.rows` to be displayed. Having only a sortIndex will **not** render them.

```json
// rows format
{
  "rowId1": [[uid1], [uid2]],  // uid1 and uid2 side by side (two columns)
  "rowId2": [[uid3, uid4]]     // uid3 and uid4 stacked (within one column)
}
// sizes format
{
  "rowId1": [12, 12]  // Ant Design 24-grid, width per column
}
```

Row order = dict key insertion order (Python 3.7+ / JSON parse order).

### 5. subKey + subType Must Be Preserved

Missing subKey/subType = frontend cannot locate the node = not rendered. Pay special attention during save_nested.

### 6. ChildPageModel enableTabs Must Be true

This matches the NocoBase framework default. If `enableTabs: false`, tabs inside popups will not display.

## Routing Layer

### 7. Route vs FlowModel UID Mapping

```
desktopRoutes:create creates:
  flowPage (schemaUid = pu)  ←  route shell
    └─ tabs child (schemaUid = tu)  ←  actual content mount point
```

- Content lives under **tu** (tabs child), not under pu (flowPage)
- `nb.route()` returns `(rid, pu, tu)` — use tu for building content
- `_collect_descendants(tu)` = full content tree
- `_collect_descendants(pu)` = only the RootPageModel shell

### 8. group vs page Route Types

| Method | Returns | Purpose |
|--------|---------|---------|
| `nb.group(title, parent_id)` | `gid` (int) | Menu folder, no content |
| `nb.route(title, parent_id)` | `(rid, pu, tu)` tuple | Page with content |
| `nb.menu(group, parent, pages)` | dict | Batch creation |

## JS Injection Layer

### 9. ctx.record Is undefined Inside Popups

JSBlockModel is a **sibling** of DetailsBlockModel inside popups, not part of the delegate chain.

```javascript
// Wrong
const id = ctx.record?.id;  // undefined!

// Correct
const popup = await ctx.popup;
const id = popup?.resource?.filterByTk;
const data = await ctx.request({url: 'COLL:get', params: {filterByTk: id}});
```

### 10. inject_js Validation Rules

The following patterns will be rejected by `inject_js()`:

| Forbidden Pattern | Correct Pattern | Reason |
|-------------------|-----------------|--------|
| `ctx.components` | `ctx.antd` | components does not exist |
| `Pie`, `Bar`, `echarts` | `ctx.React.createElement` manually | Chart libraries are not in the sandbox |
| `useState`, `useEffect` | Do not use hooks | eval context does not support them |
| `ctx.element.innerHTML` | `ctx.render(h(...))` | Must use React rendering |
| `api.collection()` | `ctx.api.request({url:...})` | collection() does not exist |

### 11. Fetch enum Values Dynamically from the API

Do not hardcode enum values. Use `nb._load_meta(coll)` to retrieve field enum options, then reference them correctly in JS.

The auto_js templates already handle this (reading color_map from metadata).

## Build Tooling Layer

### 12. nb_crud_page Is an Atomic Operation

Do not fall back to reassembling with individual tools. On failure, run clean_tab first, then retry the whole operation.

### 13. form_fields Is a DSL String; table_fields Is a JSON Array

```python
# form_fields — newline-separated DSL
"name\nshort_name\nindustry\nstatus"

# table_fields — JSON array, must include createdAt
["name", "industry", "status", "createdAt"]
```

### 14. Do Not Include System Columns in DDL

`created_at`, `updated_at`, `created_by_id`, `updated_by_id` are added automatically by NocoBase. Do not include them in DDL.

### 15. Filter Field Connection Is NOT in stepParams (FlowModel v2!)

**Do NOT confuse with the old uiSchema-based filter mechanism.** In FlowModel v2:

- Filter→table connection lives in **`BlockGridModel.options.filterManager`** (top-level, not in stepParams)
- Format: array of `{filterId, targetId, filterPaths}`
- Each FilterFormItemModel needs a `filterConfigs` entry mapping it to the TableBlockModel with explicit field paths

```python
# Correct: filterManager is a top-level option on BlockGridModel
nb.update(grid_uid, {
    'filterManager': [
        {"filterId": "filterItem1Uid", "targetId": "tableBlockUid", "filterPaths": ["status"]},
        {"filterId": "filterItem2Uid", "targetId": "tableBlockUid", "filterPaths": ["name"]},
    ]
})
```

Without this, only `name` (InputFieldModel) works via auto-matching. Select/date/relation filter fields need explicit `filterPaths`.

**Source**: `BlockGridModel.tsx` line 35-40 (init) and line 56-58 (serialize). `FilterManager.ts` for the config format.

### 16. m2o Fields Must Be Created Correctly (NOT our skill's responsibility)

If `RecordSelectFieldModel` crashes with `TypeError: Cannot read properties of undefined (reading 'interface')`, the problem is the **collection field metadata**, not the page builder.

This skill assumes m2o fields are already correctly created. See `.local/tests/m2o-field-creation-spec.md` for the correct payload format. Key rule: `fieldNames` must NOT be inside `uiSchema.x-component-props` — put it at the field's top level.

This is the `nocobase-data-modeling` skill's responsibility to get right.

## Best Practices

1. **Before building**: `nb_list_fields(collection)` to confirm fields exist
2. **After building**: `nb_inspect_page(title)` to verify the structure
3. **After JS injection**: Refresh the browser to verify rendering
4. **Rebuilding a page**: Run `nb_clean_tab(tu)` first, then rebuild entirely — do not patch partially
5. **Multiple pages**: Use `nb_page()` (XML markup) instead of calling low-level APIs one by one
