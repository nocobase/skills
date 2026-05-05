# Flow Surfaces Wrapper Command Surface

This file maps UI Builder tasks to the canonical wrapper entry.

Use it together with:

- [cli-transport.md](./cli-transport.md) for transport selection
- [transport-crosswalk.md](./transport-crosswalk.md) for a compact wrapper command map
- [tool-shapes.md](./tool-shapes.md) for backend payload shapes
- [page-blueprint.md](./page-blueprint.md) and [reaction.md](./reaction.md) for authoring rules

## Help-first Rule

Before first use of a subcommand in the current task:

```bash
node skills/nocobase-ui-builder/runtime/bin/nb-flow-surfaces.mjs <subcommand> --help
```

For complex writes, prefer `--body-file`; for example, `--body-file <json-file>` is usually better than long inline JSON flags.

## Canonical Families

| Task | Agent-facing wrapper |
| --- | --- |
| inspect one page/tab/popup | `nb-flow-surfaces.mjs get` |
| richer structural readback | `nb-flow-surfaces.mjs describe-surface` |
| capability discovery | `nb-flow-surfaces.mjs catalog` |
| whole-page create / replace | `nb-flow-surfaces.mjs apply-blueprint` |
| localized content edit | `nb-flow-surfaces.mjs compose` / `configure` / `update-settings` / `add-*` / `move-*` / `remove-*` |
| menu lifecycle | `nb-flow-surfaces.mjs create-menu` / `update-menu` / `create-page` / `destroy-page` |
| tab lifecycle | `nb-flow-surfaces.mjs add-tab` / `update-tab` / `move-tab` / `remove-tab` |
| popup-tab lifecycle | `nb-flow-surfaces.mjs add-popup-tab` / `update-popup-tab` / `move-popup-tab` / `remove-popup-tab` |
| event-flow replacement | `nb-flow-surfaces.mjs set-event-flows` |
| reaction discovery | `nb-flow-surfaces.mjs get-reaction-meta` |
| reaction write | `nb-flow-surfaces.mjs set-field-value-rules` / `set-field-linkage-rules` / `set-block-linkage-rules` / `set-action-linkage-rules` |

## Practical Routing

- Whole-page page-building starts from one draft page blueprint JSON sent through `node skills/nocobase-ui-builder/runtime/bin/nb-flow-surfaces.mjs apply-blueprint`.
- For the first real whole-page write, the wrapper runs internal `prepare-write` first, then sends only the prepared `result.cliBody` to backend execution.
- Localized edits still use the same flow-surfaces families documented in `runtime-playbook.md`; the agent-facing front door is `nb-flow-surfaces.mjs`.
- Existing-surface event-flow replacement routes through `nb-flow-surfaces.mjs set-event-flows`; keep the full `flowRegistry` shape from live readback instead of inventing a partial patch.
- Reaction work still starts from `get-reaction-meta`, then writes the matching `set-*` rules command through the wrapper.
- If you need the compact command list for the same family, open [transport-crosswalk.md](./transport-crosswalk.md). This file stays focused on practical routing.

## Payload Rule

- `tool-shapes.md` shows the backend JSON objects.
- In nb flows, those objects are usually passed through `--body` or `--body-file`. For the first whole-page write after `prepare-write`, that object is the prepared `cliBody`, not the original draft blueprint.
- Do not add a wrapper around the prepared business object before passing it to `nb-flow-surfaces.mjs`.

## Failure Rule

If a command family is missing, report the unresolved `nb api ...` command and the missing family. Do not switch transports or document environment-management steps inside this skill.
