# Phase 3B: Form & Detail Refinement

## Tools

| Tool | Purpose |
|------|---------|
| nb_auto_forms(scope) | Scan forms, generate task table with coverage % |
| nb_set_form(table_uid, type, dsl, events?) | Replace addnew/edit form |
| nb_set_detail(table_uid, detail_json) | Replace detail popup with tabs |

## Step 3B.1: Scan Form Quality [sequential]

Call `nb_auto_forms("{PREFIX}")`. Copy task table to `notes.md`.
Cross-reference with "Detail & Form Design" from Phase 3.

## Step 3B.2: Refine Forms & Details

**Read `ref/detail-patterns.md` now** — it has detail JSON examples and design rules.

### Detail Tab Rules

`nb_set_detail` auto-validates — it rejects execution when multiple tabs lack `assoc` subtable associations.

**Tab 1 = "Overview"**: all main table fields grouped with `--- Section` + js_items
**Tab 2+ = Subtables only**: one tab per o2m relation (must have `assoc` and `coll`)

Fields from the same table go in one tab with Section grouping. Associated subtable records go in separate tabs.

For each core business page:
1. Refine addnew/edit forms with sections (Fields DSL below)
2. Replace detail popup — first tab = ALL main fields + js_items, subtable tabs only for o2m
3. Mark `[x]` in notes.md after each

### Fields DSL (for nb_set_form)
```
--- Basic Info
name* | code
status | grade
--- Contact Info
phone | email
```

### Detail JSON (for nb_set_detail)
```json
[
  {"title": "Overview",
   "fields": "--- Basic Info\nname|code\nstatus|grade\n--- Contact Info\nphone|email\n--- Remarks\nremarks",
   "js_items": [{"title": "Profile", "desc": "Grade label + status + days since creation"}]},
  {"title": "Contacts", "assoc": "contacts", "coll": "nb_crm_contacts",
   "fields": ["name","phone","position"]}
]
```

**Note**: The first tab's fields must include all displayable main table fields, grouped with `---` sections.
Entities without subtable relations (e.g. payroll records, overtime records) only need 1 tab.

### Events (optional)
```python
nb_set_form(table_uid, "addnew", dsl,
    [{"on": "formValuesChange", "desc": "Map probability when stage changes"}])
```

## Step 3B.3: Verify [sequential]

- Re-run `nb_auto_forms` — all should be `[ok]`
- Update notes.md: `## Status: Phase 3B complete`, `## Next: phases/phase-4-js.md`

## After Phase 3B

Summarize to user: forms refined, detail popups created.
Ask: "Forms and detail popups are optimized. Try clicking Add New and table rows. Any adjustments needed?"
Wait for user response.

Next → `phases/phase-4-js.md`
