# Phase 3: Menu & Pages

## Tools

| Tool | Purpose |
|------|---------|
| nb_create_menu(title, parent_id, pages, icon) | Create menu group + pages, returns tab UIDs |
| nb_page_markup(tab_uid, markup) | Build one page from XML |
| nb_page_markup_file(file_path) | Build multiple pages from JSON file |
| nb_inspect_all(prefix) | Verify built pages |

## Step 3.1: Design ALL Pages [sequential]

Read requirements + HTML prototypes. For each page, decide layout pattern and JS blocks.
**Read `ref/layout-patterns.md` now** — it has patterns A-F and XML tag reference.

### LAYOUT RULES (CRITICAL — violations make pages look like plain CRUD)

1. **Every non-reference page MUST use `<row>` with `span`** — table + sidebar layout
2. **Sidebar MUST have `<js-block>` charts/statistics** — cannot be just tables
3. **KPI strip `<row>` at the top** — 3-5 `<kpi>` side by side
4. **Filter directly above table**
5. **No full-width stacking** — do not stack all elements vertically with span=24

```xml
<!-- Correct: table + sidebar -->
<row>
  <table id="tbl" span="16" fields="..." />
  <stack span="8">
    <js-block title="XX Distribution">Pie chart grouped by XX field</js-block>
    <js-block title="XX Trend">Line chart for last 30 days</js-block>
  </stack>
</row>

<!-- Wrong: plain CRUD, no charts or layout -->
<filter fields="..." target="tbl" />
<table id="tbl" fields="..." />
```

Write **Page Task Table** to `notes.md`:
```
### Page Tasks
| # | Page | Collection | Tab UID | Pattern | JS Blocks | JS Cols | Status |
|---|------|-----------|---------|---------|-----------|---------|--------|
| 1 | Customers | nb_crm_customers | — | A | Industry Distribution,Source Analysis | composite(name,city+source) | [ ] |
```

Also write **Detail & Form Design** for Phase 3B:
- Core pages (high-frequency, many relations): first tab with all fields + js-items, subtables as separate tabs
- Every detail popup first tab MUST have at least one js-item
- Secondary pages: 1 tab (all fields + 1 js-item)
- Reference/Config: auto (skip in Phase 3B)

## Step 3.2: Create Menu [sequential]

Always create **top-level group** first, then sub-groups:
```
nb_create_menu("CRM", null, [])                       → gid
nb_create_menu("Customer Mgmt", gid, ["Customers","Contacts"])   → sub-group + pages
```

Fill Tab UID column in Page Task Table.

## Step 3.3: Build Pages [each page = 1 task]

For each `[ ]` row, build the page with `nb_page_markup(tab_uid, xml)`.
**Build order**: Reference/Config pages first (simple), then Core pages.
Mark `[x]` after each page.

## Step 3.4: Verify [sequential]

- `nb_inspect_all("{prefix}")` — check structure
- Fix broken: `nb_clean_tab(tab_uid)` → rebuild
- Update notes.md: all `[x]`, `## Status: Phase 3 complete`, `## Next: phases/phase-3b-forms.md`

## After Phase 3

Summarize to user: pages built, menu structure, `nb_inspect_all` output.
Ask: "Page skeletons are built. You can check them in NocoBase now. Any adjustments needed?"
Wait for user response.

Next → `phases/phase-3b-forms.md`
