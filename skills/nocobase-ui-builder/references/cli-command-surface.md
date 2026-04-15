# CLI Command Surface

This file maps UI Builder tasks to the canonical `nocobase-ctl` command families.

Use it together with:

- [cli-transport.md](./cli-transport.md) for transport selection
- [transport-crosswalk.md](./transport-crosswalk.md) for CLI <-> MCP fallback family names
- [tool-shapes.md](./tool-shapes.md) for backend payload shapes
- [page-blueprint.md](./page-blueprint.md) and [reaction.md](./reaction.md) for authoring rules

## Help-first Rule

After the env is configured and `env update` has loaded runtime commands, before first use of a subcommand in the current task:

```bash
nocobase-ctl flow-surfaces --help
nocobase-ctl flow-surfaces <subcommand> --help
```

For complex writes, prefer `--body-file`; for example, `--body-file <json-file>` is usually better than long inline JSON flags.

## Canonical Families

| Task | Canonical CLI family |
| --- | --- |
| inspect one page/tab/popup | `nocobase-ctl flow-surfaces get` |
| richer structural readback | `nocobase-ctl flow-surfaces describe-surface` |
| capability discovery | `nocobase-ctl flow-surfaces catalog` |
| whole-page create / replace | `nocobase-ctl flow-surfaces apply-blueprint` |
| localized content edit | `nocobase-ctl flow-surfaces compose` / `configure` / `update-settings` / `add-*` / `move-*` / `remove-*` |
| menu lifecycle | `nocobase-ctl flow-surfaces create-menu` / `update-menu` / `create-page` / `destroy-page` |
| tab lifecycle | `nocobase-ctl flow-surfaces add-tab` / `update-tab` / `move-tab` / `remove-tab` |
| popup-tab lifecycle | `nocobase-ctl flow-surfaces add-popup-tab` / `update-popup-tab` / `move-popup-tab` / `remove-popup-tab` |
| event-flow replacement | `nocobase-ctl flow-surfaces set-event-flows` |
| reaction discovery | `nocobase-ctl flow-surfaces get-reaction-meta` |
| reaction write | `nocobase-ctl flow-surfaces set-field-value-rules` / `set-field-linkage-rules` / `set-block-linkage-rules` / `set-action-linkage-rules` |

## Practical Routing

- Whole-page page-building still uses one page blueprint JSON plus the local `nb-page-preview --prepare-write` gate before the first remote write.
- Localized edits still use the same backend families documented in `runtime-playbook.md`; the difference is that the canonical front door is now the CLI command, not direct MCP invocation.
- Existing-surface event-flow replacement routes through `nocobase-ctl flow-surfaces set-event-flows`; keep the full `flowRegistry` shape from live readback instead of inventing a partial patch.
- Reaction work still starts from `get-reaction-meta`, then writes the matching `set-*` rules command.
- If you need the fallback MCP tool name for the same family, open [transport-crosswalk.md](./transport-crosswalk.md). This file stays CLI-centric and does not duplicate the fallback-name table.

## Payload Rule

- `tool-shapes.md` shows the backend JSON objects.
- In CLI flows, those objects are usually passed through `--body` or `--body-file`.
- In MCP fallback flows, the same business object may need to be wrapped under `requestBody` according to the tool schema.

## Failure Rule

If a command family is missing after `nocobase-ctl env update`:

1. verify the target env and token
2. verify `swagger:get` exposure
3. verify the relevant module/resource is still included in `nocobase-ctl.config.json`
4. only then consider MCP fallback
