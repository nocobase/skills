# Local Edit Quick Route

Use this file as the default first stop for normal edits on an existing live Modern page.

Stay on this route when the request is "change one part of an existing page" rather than "rebuild the whole page".

## Common-case flow

1. Read the current surface first with `nocobase-ctl flow-surfaces get`.
2. Use `describe-surface` only when the richer public tree really helps.
3. Use `catalog` only when capability uncertainty is the blocker.
4. Choose the smallest write family that matches the intent: `compose`, `add-*`, `configure`, `update-settings`, `move-*`, or `remove-*`.
5. Keep common public keys inline when possible: `title`, `label`, `required`, `displayTitle`, simple button `type`, and similar semantic `settings` do not need a deep settings pass first.
6. Open [tool-shapes.md](./tool-shapes.md) only when you are ready to form the exact CLI body or MCP fallback envelope.

## Minimal routing table

| Intent | Default path |
| --- | --- |
| add/update content under an existing surface | `compose` / `add-*` / `configure` / `update-settings` |
| replace existing event flow | `set-event-flows` |
| reorder/remove tabs or popup tabs | `move-tab` / `remove-tab` / `move-popup-tab` / `remove-popup-tab` |
| reorder/remove nodes | `move-node` / `remove-node` |

## Default artifact-only output

For artifact-only localized edits, write only under:

```text
.artifacts/nocobase-ui-builder/<scenario-id>/
```

Leave exactly:

- `mutation-plan.json`
- `readback-checklist.md`

The JSON can stay schematic. It only needs the target locator, chosen write family, and the minimum readback target.

## Open next only if needed

- [runtime-playbook.md](./runtime-playbook.md) for the full family / locator model
- [capabilities.md](./capabilities.md) when the main question is block vs field vs action
- [settings.md](./settings.md) only when the change no longer fits the common public semantic keys above
- [template-quick.md](./template-quick.md) if the live target already carries a template reference
- [reaction-quick.md](./reaction-quick.md) if the real request is default values, linkage, computed fields, or show/hide / disable state

## Switch away when

- the request is really whole-page create / replace -> [whole-page-quick.md](./whole-page-quick.md)
- the request is really reaction work -> [reaction-quick.md](./reaction-quick.md)
