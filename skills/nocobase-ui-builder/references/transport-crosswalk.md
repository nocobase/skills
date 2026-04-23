# nb API Surface Map

This file is the compact naming map for the canonical `nb api flow-surfaces ...` surface.

Use it when you already know the task family, but need the exact `nb` command family and the document that owns the payload/shape rules.

- `nb api ...` remains the only public front door.
- Payload rules still belong to [tool-shapes.md](./tool-shapes.md); this file does not duplicate them.
- If you find the family name here, jump to the listed shape-owner doc before writing; do not copy payloads from this file.

## Command Map

| Task / intent | Canonical nb command | Shape owner doc |
| --- | --- | --- |
| inspect one page / popup / tab | `nb api flow-surfaces get` | [tool-shapes.md](./tool-shapes.md) |
| richer structural readback | `nb api flow-surfaces describe-surface` | [tool-shapes.md](./tool-shapes.md) |
| capability discovery | `nb api flow-surfaces catalog` | [tool-shapes.md](./tool-shapes.md) |
| whole-page create / replace | `nb api flow-surfaces apply-blueprint` | [page-blueprint.md](./page-blueprint.md) + [tool-shapes.md](./tool-shapes.md) |
| localized content compose | `nb api flow-surfaces compose` | [tool-shapes.md](./tool-shapes.md) |
| semantic small update | `nb api flow-surfaces configure` | [tool-shapes.md](./tool-shapes.md) + [settings.md](./settings.md) |
| path-level fine-grained patch | `nb api flow-surfaces update-settings` | [settings.md](./settings.md) |
| event-flow replacement | `nb api flow-surfaces set-event-flows` | [settings.md](./settings.md) + [tool-shapes.md](./tool-shapes.md) + [js.md](./js.md) |
| menu lifecycle | `nb api flow-surfaces create-menu` / `update-menu` | [tool-shapes.md](./tool-shapes.md) |
| page lifecycle | `nb api flow-surfaces create-page` / `destroy-page` | [tool-shapes.md](./tool-shapes.md) |
| tab lifecycle | `nb api flow-surfaces add-tab` / `update-tab` / `move-tab` / `remove-tab` | [tool-shapes.md](./tool-shapes.md) |
| popup-tab lifecycle | `nb api flow-surfaces add-popup-tab` / `update-popup-tab` / `move-popup-tab` / `remove-popup-tab` | [tool-shapes.md](./tool-shapes.md) |
| node lifecycle | `nb api flow-surfaces move-node` / `remove-node` | [tool-shapes.md](./tool-shapes.md) |
| reaction discovery | `nb api flow-surfaces get-reaction-meta` | [reaction.md](./reaction.md) + [tool-shapes.md](./tool-shapes.md) |
| reaction write | `nb api flow-surfaces set-field-value-rules` / `set-field-linkage-rules` / `set-block-linkage-rules` / `set-action-linkage-rules` | [reaction.md](./reaction.md) |

## Practical Use

1. Start from [cli-command-surface.md](./cli-command-surface.md) when you only know the user task.
2. Use this file when you need the exact `nb api flow-surfaces` family for the same task.
3. Use [tool-shapes.md](./tool-shapes.md) for nb body rules.
4. Use [page-blueprint.md](./page-blueprint.md) or [reaction.md](./reaction.md) for the inner business object itself.
