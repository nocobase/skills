# Flow Surfaces Command Surface

This file maps UI Builder tasks to the canonical backend API entry.

Use it together with:

- [cli-transport.md](./cli-transport.md) for transport selection
- [tool-shapes.md](./tool-shapes.md) for backend payload shapes
- [page-blueprint.md](./page-blueprint.md) and [reaction.md](./reaction.md) for authoring rules

## Help-first Rule

Before first use of an action in the current task, use action-level help when available:

```bash
nb api flow-surfaces <action> --help
```

For complex writes, prefer `--body-file`; for example, `--body-file <json-file>` is usually better than long inline JSON flags.

## Canonical Families

| Task | Agent-facing command |
| --- | --- |
| inspect one page/tab/popup | `nb api flow-surfaces get` |
| richer structural readback | `nb api flow-surfaces describe-surface` |
| capability discovery | `nb api flow-surfaces catalog` |
| whole-page create / replace | `nb api flow-surfaces apply-blueprint` |
| localized content edit | `nb api flow-surfaces compose` / `configure` / `update-settings` / `add-*` / `move-*` / `remove-*` |
| menu lifecycle | `nb api flow-surfaces create-menu` / `update-menu` / `create-page` / `destroy-page` |
| tab lifecycle | `nb api flow-surfaces add-tab` / `update-tab` / `move-tab` / `remove-tab` |
| popup-tab lifecycle | `nb api flow-surfaces add-popup-tab` / `update-popup-tab` / `move-popup-tab` / `remove-popup-tab` |
| event-flow discovery | `nb api flow-surfaces get-event-flow-meta` |
| localized event-flow edit | `nb api flow-surfaces add-event-flow` / `set-event-flow` / `remove-event-flow` |
| event-flow replacement | `nb api flow-surfaces set-event-flows` |
| reaction discovery | `nb api flow-surfaces get-reaction-meta` |
| reaction write | `nb api flow-surfaces set-field-value-rules` / `set-field-linkage-rules` / `set-block-linkage-rules` / `set-action-linkage-rules` |

## Practical Routing

- Whole-page page-building starts from one draft page blueprint JSON sent through `nb api flow-surfaces apply-blueprint --body-file <payload>.json -j`.
- The backend authoring compiler normalizes compatible payloads and rejects hard validation failures with aggregate `errors[]` before write side effects.
- Localized edits still use the same flow-surfaces families documented in `runtime-playbook.md`; the agent-facing front door is `nb api flow-surfaces`.
- Existing-surface localized event-flow work starts with `nb api flow-surfaces get-event-flow-meta`, then uses `add-event-flow`, `set-event-flow`, or `remove-event-flow`. Full replacement still routes through `set-event-flows`; keep the full `flowRegistry` shape from live readback instead of inventing a partial replacement.
- Reaction work still starts from `get-reaction-meta`, then writes the matching `set-*` rules command through `nb api flow-surfaces`.

## Payload Rule

- `tool-shapes.md` shows the raw business object backend JSON shapes.
- In nb flows, those objects are usually passed through `--body` or `--body-file`.
- Do not add a wrapper envelope or `cliBody` around the business object before passing it to `nb api flow-surfaces`; repair backend aggregate `errors[]` when validation fails.

## Failure Rule

If a command family is missing, report the unresolved `nb api flow-surfaces <action>` command and the missing family. Do not switch transports or document environment-management steps inside this skill.
