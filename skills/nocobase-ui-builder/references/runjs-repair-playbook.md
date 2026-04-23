# RunJS Repair Playbook

Use this after `runjs_guard`, `flow_payload_guard`, or `preflight_write_gate` reports a RunJS finding with `details.repairClass`.

## Repair Classes

| repairClass | Meaning | Preferred fix |
| --- | --- | --- |
| `switch-to-resource-api` | NocoBase `collection:list/get` was written as `ctx.request(...)` | Use `global/resource-list` or `global/resource-get` |
| `missing-top-level-return` | A value-return surface does not return a value | Go back to `value-return/*`; do not auto-wrap unknown code |
| `value-surface-forbids-render` | A value-return surface calls `ctx.render(...)` | Remove render logic and return the value |
| `unknown-surface-stop` | The payload path did not resolve to a known surface | Re-read [js-surfaces/index.md](./js-surfaces/index.md) and inspect write metadata |
| `unknown-model-stop` | A render/action modelUse is unknown | Inspect live model metadata before choosing JS model validation |
| `replace-innerhtml-with-render` | Render code writes `innerHTML` or omits required `ctx.render(...)` | Replace with a render snippet that calls `ctx.render(...)` |
| `blocked-global-stop` | Code uses forbidden globals or unsafe browser APIs | Replace with allowed `ctx.*`, `window.*`, or `navigator.*` APIs |
| `blocked-capability-reroute` | Code uses a skill-blocked capability such as `ctx.openView(...)` | Configure popup/action/field popup outside JS |
| `ctx-root-mismatch-stop` | The chosen surface does not expose a required `ctx.*` root, or uses unresolved `ctx[...]` access | Switch surface/snippet or inspect live host context |

## Deterministic Rewrites

The guard may auto-rewrite only these safe patterns:

- `ctx.element.innerHTML = ...` to `ctx.render(...)` when no later DOM dependency remains.
- `auth:check` request to `ctx.user ?? ctx.auth?.user`.
- Static `ctx.request({ url: 'collection:list/get' })` to resource API.
- Builder-style filter groups to query filters during resource rewrite.

The guard must not auto-invent missing returns, form-only API substitutes, or unknown expression wrappers.
