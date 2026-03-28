# Phase 6: AI Employees

Can start after Phase 3 (needs pages), parallel with Phase 4/5.

## Tools

| Tool | Purpose |
|------|---------|
| nb_create_ai_employee(...) | Create AI employee |
| nb_ai_shortcut(tab_uid, shortcuts_json) | Add floating avatar to page |
| nb_ai_button(table_uid, username, tasks_json) | Add action button to table |
| nb_list_ai_employees() | List all employees |

## Step 6.1: Create AI Employees [parallel-ok]

One per business domain. Define:
- username, nickname, bio
- Skills and model configuration

## Step 6.2: Add Page Integrations [parallel-ok]

- `nb_ai_shortcut(tab_uid, shortcuts_json)` — floating avatars on pages
- `nb_ai_button(table_uid, username, tasks_json)` — action bar buttons on tables

## Step 6.3: Verify [sequential]

- `nb_list_ai_employees()` — all exist
- Update notes.md: `## Status: Phase 6 complete`

## After Phase 6

Show user: AI employees created (names + roles), page integrations.
Ask: "AI assistants are created. Want to try chatting with them?"
Wait for user response.

Next → `phases/phase-7-verify.md` (when Phase 4+5+6 all complete)
