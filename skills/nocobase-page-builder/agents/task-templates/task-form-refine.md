# Task: Refine {FORM_TYPE} for "{PAGE_NAME}"

## Context
- Table UID: {TABLE_UID}
- Collection: {COLLECTION}
- Form type: {FORM_TYPE}
- Available fields: {AVAILABLE_FIELDS}
- Current coverage: {COVERAGE}%

## For addnew/edit

Design field layout with logical sections and side-by-side pairs:
```
--- Basic Info
name* | code
status | grade
--- Contact Info
phone | email
--- Notes
remarks
```

{EVENTS_SPEC}

Call `nb_set_form("{TABLE_UID}", "{FORM_TYPE}", dsl_string{, events_json})`

## For detail — TREAT AS A FULL PAGE

The detail popup is the user's workspace for this record. Design it thoroughly.

**First tab** = record home page:
1. `js_items` — visual summary card at the top (key metrics/status at a glance)
2. `fields` — ALL fields grouped with `---` sections, paired with `|`

**Subsequent tabs** = one per o2m relation:

{PLANNED_TABS}

O2M relations: {O2M_LIST}

Build detail_json array:
```json
[
  {"title": "Basic Info",
   "fields": "--- Overview\nname|code\nstatus|grade\n--- Contact Info\nphone|email\n--- Notes\nremarks",
   "js_items": [{"title": "Overview Card", "desc": "Visual summary of key metrics"}]},
  {"title": "Contacts", "assoc": "contacts", "coll": "target_coll",
   "fields": ["name","phone","email","position"]}
]
```

Call `nb_set_detail("{TABLE_UID}", detail_json)`

## Steps
1. Design the layout following context above
2. Call the appropriate tool
3. Update notes.md: mark Form Tasks row as `[done]` or `[fail]`
