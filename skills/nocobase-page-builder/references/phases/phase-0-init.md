# Phase 0: Initialize

## Step 0.1: Read Requirements

Read the requirements file (`*-requirements.md`). Extract:
- Table prefix (e.g. `nb_crm_`)
- Table list with field types, enums, relations
- Menu structure (groups → pages)
- Per-page UX expectations from "User Focus" sections
- If HTML prototypes exist (`*.html` + `design-notes.md`), scan them for visual patterns

Write to `notes.md`:
```
# Build Notes
## System: {name}
## Prefix: {prefix}
## Tables: {count}
## Has HTML prototypes: yes/no
## Status: Phase 0 complete
```

## Step 0.2: Clean Previous Build (if rebuilding)

`nb_clean_prefix("{prefix}")` handles everything in one call:

| Step | What it cleans | How |
|------|---------------|-----|
| 1 | Collections (NocoBase metadata) | API `collections:destroy` per match |
| 2 | Database tables | SQL `DROP TABLE CASCADE` per match |
| 3 | Workflows | Deletes workflows whose collection matches prefix |
| 4 | Routes (menu) | Deletes top-level route group matching system name |

The system name is derived from prefix: `nb_crm_` → `CRM`, `nb_am_` → `AM`.

**Usage**:
```
nb_clean_prefix("nb_crm_")
```

**If workflows use a title prefix** (e.g. "CRM-CustomerNumber"):
```
nb_delete_workflows_by_prefix("CRM-")
```

**Verify after clean**:
- `nb_list_routes()` — old menu should be gone
- If routes remain, manually check — the clean matches exact top-level title only

**Known edge cases**:
- AI employees are NOT cleaned by `nb_clean_prefix` — delete manually if needed
- Routes with non-matching titles (e.g. "Customer Management" instead of "CRM") need manual `desktopRoutes:destroy`
- If clean reports "0 collections deleted" but tables exist, the collections were already unregistered — tables still get dropped via SQL

## After Phase 0

Show the user your plan: tables, fields, menu structure, key relations.
Ask: "Does this data model design look good? Any adjustments needed?"
Wait for user response.

Next → `phases/phase-1-data.md`
