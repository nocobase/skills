# Kimi Agent Build Issues (2026-04-10)

## Issue 1: edit recordAction UID not in state.yaml
- **Root cause**: deployer excludes edit/view from compose, creates via save_model in `_fill_block`, but doesn't write the new action UID back to `block_state.record_actions`
- **Impact**: `auto: [edit]` in enhance.yaml can't resolve `$page.table.record_actions.edit` ref
- **Fix needed**: `_fill_block` should write created popup-action UIDs to block_state

## Issue 2: Kimi modifies tool code (nb.py)
- PM kimi changed `nb.py` to handle select options format
- **Root cause**: YAML `options: [Active, On Leave]` vs deployer expecting string list
- **Fix needed**: `create_field` should handle both `[string]` and `[{value, label}]` formats
- **Skill doc**: add note "DO NOT modify files in tools/"

## Issue 3: Asset kimi abandoned DSL, switched to MCP tools
- After DSL enhance.yaml deploy failed, kimi fell back to nb_page/nb_compose_page MCP tools
- **Root cause**: DSL deploy errors not clear enough for kimi to fix
- **Impact**: lost the DSL workflow advantage

## Issue 4: select field options format
- YAML has `options: [active, probation]` (string list)
- `create_field` passes to `uiSchema.enum` as `[{value, label}]`
- But some formats use `[{value: "active", label: "Active", color: "green"}]`
- Need consistent handling
