# Forms and actions recipe

## Read first

- [../blocks/filter-form.md](../blocks/filter-form.md)
- [../blocks/create-form.md](../blocks/create-form.md)
- [../blocks/edit-form.md](../blocks/edit-form.md)
- [../blocks/details.md](../blocks/details.md)
- [../patterns/index.md](../patterns/index.md)

## Default steps

1. Confirm the page skeleton and section layout before assembling an action tree
2. Use the local graph or runtime schemas to confirm:
   - the target action family
   - the page or popup subtree shape
   - record context and relation context
3. Build relation filters or query filters through `flow_payload_guard.mjs build-filter` or `build-query-filter`
4. Perform the real write through MCP first, then hand artifacts to `ui_write_wrapper.mjs run --action save|mutate|ensure`

## Key rules

- do not treat generic `ActionModel` as the final structure for every action slot
- for clickable relation-title columns, prefer the native relation-column solution instead of defaulting to `JSFieldModel` or `JSColumnModel`
- popup or openView subtrees must match the correct `pageModelClass` and slot contracts
- do not guess `associationName`, relation path, or through structure before they are verified
- example JSON in this recipe is for wrapper input thinking only, not a direct execution entrypoint

## Validation reminders

When browser validation is explicitly requested, verify:

- whether popup or drawer really opens
- whether record actions are actually triggerable
- whether details and relation blocks work under real data
