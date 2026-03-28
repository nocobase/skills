# Phase 2: Field Validation

**DO NOT SKIP this phase.** Page building (Phase 3) depends on exact field names and enum values.
Even if you set up fields in Phase 1, you MUST run `nb_fields()` to confirm what NocoBase actually registered.

## Step 2.1: Read All Fields [parallel-ok per collection]

For each collection: `nb_fields("{collection_name}")`

Record in `notes.md` under `### Field Details`:
- **Exact field names** (use these in pages, not guesses)
- **Enum option values with labels** (use these in JS filters — must match exactly)
- **O2M relations**: parent collections should show o2m fields
- **Field interfaces**: which fields are select, date, number, textarea, etc.

Example format in notes.md:
```
### nb_crm_customers fields
name(string), phone(string), email(email), grade(select: A/B/C/D),
status(select: New/Following Up/Signed/Lost), industry(select: Tech/Manufacturing/Finance/...),
source(select: Website/Referral/Exhibition/...), city(string), address(textarea), remarks(textarea)
O2M: contacts, opportunities, contracts, activities, tickets
```

If missing o2m: `nb_create_relation(collection, name, target, type="o2m", foreign_key)`

## Step 2.2: Verify titleField [CRITICAL]

Every collection that is a relation target MUST have `titleField` set.
Without it, relation fields render raw IDs or crash the UI.

Check: the `nb_setup_collection` output should show `[titleField] set to 'xxx'` for each collection.
If any collection shows the WARNING, fix it:
- `nb_setup_collection("collection_name", "Title", title_field="name")`

Common patterns:
- Collections with a `name` field → titleField = "name"
- Collections with `title` → titleField = "title"
- Collections with `code`/sequence → titleField = "code" or sequence field name

Record in `notes.md`: `titleField verified for all N collections ✓`

Update `notes.md`: `## Status: Phase 2 complete`, `## Next: phases/phase-3-pages.md`

## After Phase 2

Show user: field summary, any missing relations found, titleField status.
Ask: "Field validation complete. Ready to start building pages?"
Wait for user response.

Next → `phases/phase-3-pages.md`
