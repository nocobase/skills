---
title: Cross-Block Filter Linking
description: Implementing cross-block data filter linking via ctx.initResource + addFilterGroup in JS Block
tags: [nocobase, js-sandbox, resource, filter, cross-block, flow-engine, ctx]
type: guide
status: active
updated: "2026-03-26"
---

# Cross-Block Filter Linking

## Core Problem

A page has multiple blocks (e.g., a Header with stats + a Kanban board). Clicking a filter button in the Header should trigger a linked refresh of the Kanban data.

## Key APIs

### ctx.initResource — Give a JS Block Its Own Resource

JSBlockModel has no `ctx.resource` by default (inheritance chain: `JSBlockModel → BlockModel`, lacking the resource layer from `CollectionBlockModel`).

Create one manually with `ctx.initResource`:

```js
// Initialize resource in a JS Block
ctx.initResource('MultiRecordResource');
ctx.resource.setResourceName('my_collection');
ctx.resource.setPageSize(500);
ctx.resource.setAppends(['customer', 'owner']);
await ctx.resource.refresh();

const data = ctx.resource.getData();  // get data
```

After initialization, `ctx.resource` has the full MultiRecordResource API: `addFilterGroup`, `removeFilterGroup`, `refresh`, `getData`, `getFilter`, etc.

### Cross-Block Communication — ctx.engine.getModel

```js
// From Block A, get Block B's model
const targetModel = ctx.engine.getModel('block-b-uid');

// Add a filter to Block B's resource
targetModel.resource.addFilterGroup('my-filter-key', {
  status: { $eq: 'active' }
});

// Refresh Block B (triggers the 'refresh' event)
await targetModel.resource.refresh();
```

### Block B Listens for Refresh

```js
// During Block B initialization
ctx.resource.on('refresh', () => {
  const data = ctx.resource.getData();
  // Re-render with new data
  setData(data);
});
```

---

## Complete Pattern: Header + Kanban Linking

### Block A: Header (initiates filtering)

```js
const TARGET_BLOCK_UID = 'kanban-block-uid';

const handleFilter = async (filterKey, filterValue) => {
  const targetModel = ctx.engine?.getModel(TARGET_BLOCK_UID);
  if (!targetModel?.resource) return;

  if (filterKey === 'all') {
    // Clear filter
    targetModel.resource.removeFilterGroup(ctx.model?.uid);
  } else {
    // Add filter condition
    targetModel.resource.addFilterGroup(ctx.model?.uid, {
      [filterKey]: { $eq: filterValue }
    });
  }
  await targetModel.resource.refresh();
};
```

### Block B: Kanban (receives filtering)

```js
// Initialize resource
ctx.initResource('MultiRecordResource');
ctx.resource.setResourceName('my_collection');
ctx.resource.setPageSize(500);
ctx.resource.setAppends(['customer', 'owner']);

const KanbanBoard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    setData(ctx.resource.getData() || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    ctx.resource.refresh().then(loadData);
    ctx.resource.on('refresh', loadData);
    return () => ctx.resource.off('refresh', loadData);
  }, []);

  // ... render with data
};
```

---

## addFilterGroup vs setFilter

| Method | Behavior | Use Case |
|--------|----------|----------|
| `addFilterGroup(key, filter)` | Add a named filter group; multiple groups can stack | Multiple filter sources linking together |
| `removeFilterGroup(key)` | Remove a specific filter group | Clear a single filter source |
| `setFilter(filter)` | Replace the entire filter | Exclusive filtering |
| `resetFilter()` | Reset filter to initial state | Clear all filters |

**Recommended: use `addFilterGroup`** — each filter source uses its own key (e.g., `ctx.model.uid`), avoiding interference.

---

## Cross-Page Parameter Passing: URL Parameters + Auto-Filtering

A Dashboard KPI card click navigates to a list page, where the filter button automatically focuses on the corresponding condition.

### Sender: KPI card navigation

```js
const handleClick = () => {
  ctx.router.navigate('/admin/e9478uhrdve?status=new');
};
```

### Receiver: List page filter button reads URL parameters

```js
// ⚠️ Sandbox limitations:
//   - window.location.search is not available ("Access to location property is not allowed")
//   - URLSearchParams is not available (not on the allowlist)
//   - ctx.router.location is undefined

// ✅ Correct: ctx.router.state.location.search + regex parsing
const _search = ctx.router?.state?.location?.search || '';
const _match = _search.match(/[?&]status=([^&]*)/);
const initStatus = _match ? decodeURIComponent(_match[1]) : null;

// Determine initial selected state based on URL parameter
const INIT_KEY = STATS.find(s => s.key === initStatus) ? initStatus : 'all';
const [active, setActive] = useState(INIT_KEY);

// Auto-trigger filter on first render
const appliedRef = ctx.React.useRef(false);
useEffect(() => {
  if (!appliedRef.current && INIT_KEY !== 'all') {
    appliedRef.current = true;
    const stat = STATS.find(s => s.key === INIT_KEY);
    if (stat) setTimeout(() => applyFilter(stat), 500);
  }
}, []);
```

### Complete Flow

```
Dashboard KPI card
  → ctx.router.navigate('/admin/xxx?status=new')
    → List page renders
      → JS filter button reads ctx.router.state.location.search
        → Auto-selects the "New" button
          → addFilterGroup + refresh filters the table below
```

---

## Notes

- `ctx.initResource` must be called at the top level of the JS Block (not inside a React component)
- Resource data loading is async; the first load requires `await ctx.resource.refresh()`
- Drag-and-drop updates can use `ctx.resource.update(filterByTk, data)`
- In Kanban scenarios, avoid filtering by stage (stage = column; filtering leaves only one column). Filter by owner/date/amount instead
- Use `ctx.router.state.location.search` for URL parameters (not `ctx.router.location`)
- `URLSearchParams` is not on the sandbox allowlist; use regex for parsing
- Use `await ctx.getVar('ctx.user.id')` for current user ID (not `ctx.currentUser`)

---

## Related Documents

- [ctx.openView Popups & Parameter Passing](/200000-guides/nocobase-js-sandbox/open-view/) — Opening popups and passing parameters
- [Popup Context](/200000-guides/nocobase-js-sandbox/popup-context/) — Accessing records inside popups
- [JS Sandbox Home](/200000-guides/nocobase-js-sandbox/) — Full documentation index
- [JS Block Reference](/300000-projects/300008-nocobase-builder/02-page-building/js-blocks-reference/) — Summary row patterns and more
