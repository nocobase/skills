# nb Command Surface

This file maps UI Builder tasks to the canonical `nb` command families.

Use it together with:

- [cli-transport.md](./cli-transport.md) for transport selection
- [transport-crosswalk.md](./transport-crosswalk.md) for a compact nb command map
- [tool-shapes.md](./tool-shapes.md) for backend payload shapes
- [page-blueprint.md](./page-blueprint.md) and [reaction.md](./reaction.md) for authoring rules

## Help-first Rule

After the env is configured and `env update` has loaded runtime commands, before first use of a subcommand in the current task:

```bash
nb api flow-surfaces --help
nb api flow-surfaces <subcommand> --help
```

For complex writes, prefer `--body-file`; for example, `--body-file <json-file>` is usually better than long inline JSON flags.

## Canonical Families

| Task | Canonical nb family |
| --- | --- |
| inspect one page/tab/popup | `nb api flow-surfaces get` |
| richer structural readback | `nb api flow-surfaces describe-surface` |
| capability discovery | `nb api flow-surfaces catalog` |
| whole-page create / replace | `nb api flow-surfaces apply-blueprint` |
| localized content edit | `nb api flow-surfaces compose` / `configure` / `update-settings` / `add-*` / `move-*` / `remove-*` |
| menu lifecycle | `nb api flow-surfaces create-menu` / `update-menu` / `create-page` / `destroy-page` |
| tab lifecycle | `nb api flow-surfaces add-tab` / `update-tab` / `move-tab` / `remove-tab` |
| popup-tab lifecycle | `nb api flow-surfaces add-popup-tab` / `update-popup-tab` / `move-popup-tab` / `remove-popup-tab` |
| event-flow replacement | `nb api flow-surfaces set-event-flows` |
| reaction discovery | `nb api flow-surfaces get-reaction-meta` |
| reaction write | `nb api flow-surfaces set-field-value-rules` / `set-field-linkage-rules` / `set-block-linkage-rules` / `set-action-linkage-rules` |

## Practical Routing

- Whole-page page-building still starts from one draft page blueprint JSON plus the local `node skills/nocobase-ui-builder/runtime/bin/nb-page-preview.mjs --prepare-write` gate before the first remote write.
- For the first real whole-page write, keep `prepare-write` and the remote write as separate steps: run `node skills/nocobase-ui-builder/runtime/bin/nb-page-preview.mjs --prepare-write` from the repo root first, then send only the prepared `result.cliBody` to `nb api flow-surfaces apply-blueprint`.
- Localized edits still use the same backend families documented in `runtime-playbook.md`; the canonical front door is always `nb api ...`.
- Existing-surface event-flow replacement routes through `nb api flow-surfaces set-event-flows`; keep the full `flowRegistry` shape from live readback instead of inventing a partial patch.
- Reaction work still starts from `get-reaction-meta`, then writes the matching `set-*` rules command.
- If you need the compact command list for the same family, open [transport-crosswalk.md](./transport-crosswalk.md). This file stays focused on practical routing.

## Payload Rule

- `tool-shapes.md` shows the backend JSON objects.
- In nb flows, those objects are usually passed through `--body` or `--body-file`. For the first whole-page write after `prepare-write`, that object is the prepared `cliBody`, not the original draft blueprint.
- Do not add a wrapper around the prepared business object before passing it to `nb api`.

## Failure Rule

If a command family is missing after `nb env update`:

1. verify the target env and token
2. verify `swagger:get` exposure
3. verify the relevant module/resource is still included in `nb.config.json`
4. rerun `nb env update <name>` and report the unresolved `nb` command if the family is still missing
