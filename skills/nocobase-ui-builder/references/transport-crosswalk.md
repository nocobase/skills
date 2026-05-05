# nb API Surface Map

This file is the compact naming map for the agent-facing `nb-flow-surfaces.mjs` wrapper surface.

Use it when you already know the task family, but need the exact wrapper subcommand and the document that owns the payload/shape rules.

- `node skills/nocobase-ui-builder/runtime/bin/nb-flow-surfaces.mjs <subcommand>` is the agent-facing front door for flow-surfaces.
- Backend transport remains internal to the wrapper; agents should call it through `nb-flow-surfaces.mjs`.
- Payload rules still belong to [tool-shapes.md](./tool-shapes.md); this file does not duplicate them.
- If you find the family name here, jump to the listed shape-owner doc before writing; do not copy payloads from this file.

## Command Map

| Task / intent | Wrapper subcommand | Shape owner doc |
| --- | --- | --- |
| inspect one page / popup / tab | `get` | [tool-shapes.md](./tool-shapes.md) |
| richer structural readback | `describe-surface` | [tool-shapes.md](./tool-shapes.md) |
| capability discovery | `catalog` | [tool-shapes.md](./tool-shapes.md) |
| whole-page create / replace | `apply-blueprint` | [page-blueprint.md](./page-blueprint.md) + [tool-shapes.md](./tool-shapes.md) |
| localized content compose | `compose` | [tool-shapes.md](./tool-shapes.md) |
| semantic small update | `configure` | [tool-shapes.md](./tool-shapes.md) + [settings.md](./settings.md) |
| path-level fine-grained patch | `update-settings` | [settings.md](./settings.md) |
| event-flow replacement | `set-event-flows` | [settings.md](./settings.md) + [tool-shapes.md](./tool-shapes.md) + [js.md](./js.md) |
| menu lifecycle | `create-menu` / `update-menu` | [tool-shapes.md](./tool-shapes.md) |
| page lifecycle | `create-page` / `destroy-page` | [tool-shapes.md](./tool-shapes.md) |
| tab lifecycle | `add-tab` / `update-tab` / `move-tab` / `remove-tab` | [tool-shapes.md](./tool-shapes.md) |
| popup-tab lifecycle | `add-popup-tab` / `update-popup-tab` / `move-popup-tab` / `remove-popup-tab` | [tool-shapes.md](./tool-shapes.md) |
| node lifecycle | `move-node` / `remove-node` | [tool-shapes.md](./tool-shapes.md) |
| reaction discovery | `get-reaction-meta` | [reaction.md](./reaction.md) + [tool-shapes.md](./tool-shapes.md) |
| reaction write | `set-field-value-rules` / `set-field-linkage-rules` / `set-block-linkage-rules` / `set-action-linkage-rules` | [reaction.md](./reaction.md) |

## Practical Use

1. Start from [cli-command-surface.md](./cli-command-surface.md) when you only know the user task.
2. Use this file when you need the exact wrapper subcommand for the same task.
3. Use [tool-shapes.md](./tool-shapes.md) for nb body rules.
4. Use [page-blueprint.md](./page-blueprint.md) or [reaction.md](./reaction.md) for the inner business object itself.
