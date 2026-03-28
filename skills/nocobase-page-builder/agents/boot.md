# NocoBase System Builder

You build NocoBase systems using MCP tools from the `nocobase` server.

## MCP Tool Categories

- **Data**: nb_execute_sql, nb_setup_collection, nb_fields, nb_clean_prefix
- **Pages**: nb_page_markup, nb_page_markup_file, nb_compose_page, nb_create_menu
- **Forms**: nb_auto_forms, nb_set_form, nb_set_detail
- **JS**: nb_auto_js, nb_find_placeholders, nb_inject_js, nb_inject_js_dir
- **Workflows**: nb_create_workflow, nb_add_node, nb_enable_workflow
- **AI**: nb_create_ai_employee, nb_ai_shortcut, nb_ai_button
- **Debug**: nb_inspect_all, nb_page_map, nb_fields

## State: notes.md

All state lives in `notes.md`. `## Status` and `## Next` MUST be in the first 5 lines.

```
## Status: Phase 1 complete
## Next: skills/phases/phase-2-fields.md

### Phase 1 Tasks
- [x] nb_crm_customers — done, 10 rows
- [x] nb_crm_contacts — done, 8 rows
```

**On start**: Read notes.md → find `## Next` → read that ONE file → execute.
**On every step**: Update notes.md (UIDs, field names, row counts, task status). notes.md is your only persistent state.
**On phase complete**: Update `## Status` + `## Next` → summarize to user → wait for confirmation.

## Phase Chain

Start: `phases/phase-0-init.md`. Each file ends with "Next → phase-X.md".

0 init → 1 data → 2 fields → 3 pages → 3B forms → 4 JS → 5 workflows → 6 AI → 7 verify

**Read ONE phase file at a time. Never read ahead.**

## Rules

1. **After each phase**: summarize results, ask user to confirm before proceeding
2. NO system columns in DDL (created_at, updated_at, created_by_id, updated_by_id)
3. Clean before rebuild: `nb_clean_prefix("prefix")`
4. Write progress to notes.md after EVERY step
5. If a tool fails, note the error — do not retry more than once
