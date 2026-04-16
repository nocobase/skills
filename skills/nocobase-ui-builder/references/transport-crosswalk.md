# Transport Crosswalk

This file is the thin naming map between the canonical CLI surface and MCP fallback tools.

Use it when you already know the task family, but need to translate between:

- the canonical `nocobase-ctl flow-surfaces ...` command
- the MCP fallback tool family
- and the document that owns the payload/shape rules

Canonical rule:

- CLI remains the default front door.
- MCP names below are fallback-only after the CLI path is unavailable, or after repair still cannot expose the required runtime family.
- Payload/envelope rules still belong to [tool-shapes.md](./tool-shapes.md); this file does not duplicate them.
- If you find the family name here, jump to the listed shape-owner doc before writing; do not copy payloads from this file.

## Crosswalk

| Task / intent | Canonical CLI subcommand | MCP fallback tool family | Shape owner doc |
| --- | --- | --- | --- |
| inspect one page / popup / tab | `nocobase-ctl flow-surfaces get` | `flow_surfaces_get` | [tool-shapes.md](./tool-shapes.md) |
| richer structural readback | `nocobase-ctl flow-surfaces describe-surface` | `flow_surfaces_describe_surface` | [tool-shapes.md](./tool-shapes.md) |
| capability discovery | `nocobase-ctl flow-surfaces catalog` | `flow_surfaces_catalog` | [tool-shapes.md](./tool-shapes.md) |
| whole-page create / replace | `nocobase-ctl flow-surfaces apply-blueprint` | `flow_surfaces_apply_blueprint` | [page-blueprint.md](./page-blueprint.md) + [tool-shapes.md](./tool-shapes.md) |
| localized content compose | `nocobase-ctl flow-surfaces compose` | `flow_surfaces_compose` | [tool-shapes.md](./tool-shapes.md) |
| semantic small update | `nocobase-ctl flow-surfaces configure` | `flow_surfaces_configure` | [tool-shapes.md](./tool-shapes.md) + [settings.md](./settings.md) |
| path-level fine-grained patch | `nocobase-ctl flow-surfaces update-settings` | `flow_surfaces_update_settings` | [settings.md](./settings.md) |
| menu lifecycle | `nocobase-ctl flow-surfaces create-menu` / `update-menu` | `flow_surfaces_create_menu` / `flow_surfaces_update_menu` | [tool-shapes.md](./tool-shapes.md) |
| page lifecycle | `nocobase-ctl flow-surfaces create-page` / `destroy-page` | `flow_surfaces_create_page` / `flow_surfaces_destroy_page` | [tool-shapes.md](./tool-shapes.md) |
| tab lifecycle | `nocobase-ctl flow-surfaces add-tab` / `update-tab` / `move-tab` / `remove-tab` | `flow_surfaces_add_tab` / `flow_surfaces_update_tab` / `flow_surfaces_move_tab` / `flow_surfaces_remove_tab` | [tool-shapes.md](./tool-shapes.md) |
| popup-tab lifecycle | `nocobase-ctl flow-surfaces add-popup-tab` / `update-popup-tab` / `move-popup-tab` / `remove-popup-tab` | `flow_surfaces_add_popup_tab` / `flow_surfaces_update_popup_tab` / `flow_surfaces_move_popup_tab` / `flow_surfaces_remove_popup_tab` | [tool-shapes.md](./tool-shapes.md) |
| node lifecycle | `nocobase-ctl flow-surfaces move-node` / `remove-node` | `flow_surfaces_move_node` / `flow_surfaces_remove_node` | [tool-shapes.md](./tool-shapes.md) |
| reaction discovery | `nocobase-ctl flow-surfaces get-reaction-meta` | `flow_surfaces_get_reaction_meta` | [reaction.md](./reaction.md) + [tool-shapes.md](./tool-shapes.md) |
| reaction write | `nocobase-ctl flow-surfaces set-field-value-rules` / `set-field-linkage-rules` / `set-block-linkage-rules` / `set-action-linkage-rules` | `flow_surfaces_set_field_value_rules` / `flow_surfaces_set_field_linkage_rules` / `flow_surfaces_set_block_linkage_rules` / `flow_surfaces_set_action_linkage_rules` | [reaction.md](./reaction.md) |

## Practical Use

1. Start from [cli-command-surface.md](./cli-command-surface.md) when you only know the user task.
2. Use this file when you need the exact MCP fallback tool family for the same task.
3. Use [tool-shapes.md](./tool-shapes.md) for CLI body vs MCP fallback envelope rules.
4. Use [page-blueprint.md](./page-blueprint.md) or [reaction.md](./reaction.md) for the inner business object itself.
