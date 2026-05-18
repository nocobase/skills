# RunJS Repair Playbook

Use this after backend aggregate validation reports a RunJS finding with `details.repairClass`. Optional local helper findings may use the same repair language, but backend `flow-surfaces` errors are authoritative for writes.

## Repair Classes

| repairClass | Meaning | Preferred fix |
| --- | --- | --- |
| `switch-to-resource-api` | NocoBase `collection:list/get` was written as `ctx.request(...)` | Use `global/resource-list` or `global/resource-get` |
| `missing-top-level-return` | A value-return surface does not return a value | Go back to `value-return/*`; do not auto-wrap unknown code |
| `value-surface-forbids-render` | A value-return surface calls `ctx.render(...)` | Remove render logic and return the value |
| `unknown-surface-stop` | The payload path did not resolve to a known surface | Re-read [js-surfaces/index.md](./js-surfaces/index.md) and inspect write metadata |
| `unknown-model-stop` | A render/action modelUse is unknown | Inspect live model metadata before choosing JS model validation |
| `replace-innerhtml-with-render` | Render code writes `innerHTML` or omits required `ctx.render(...)` | Replace with a render snippet that calls `ctx.render(...)` |
| `render-top-level-function-wrapper` | Render code only defines a top-level function wrapper | Move the function body to the top level so `ctx.render(...)` runs immediately |
| `render-unreachable-render-call` | Render code contains `ctx.render(...)` only outside the top-level execution path | Move `ctx.render(...)` into directly executed top-level render code |
| `blocked-global-stop` | Code uses forbidden globals or unsafe browser APIs | Replace with allowed `ctx.*`, `window.*`, or `navigator.*` APIs |
| `blocked-capability-reroute` | Code uses a skill-blocked capability such as `ctx.openView(...)` | Configure popup/action/field popup outside JS |
| `ctx-root-mismatch-stop` | The chosen surface does not expose a required `ctx.*` root, or uses unresolved `ctx[...]` access | Switch surface/snippet or inspect live host context |

## Repair Method

Do not depend on skill-side automatic rewrites or canonicalization before writes. Repair the source or payload explicitly, then retry the direct backend write.

- Replace `ctx.element.innerHTML = ...` with explicit `ctx.render(...)` yourself.
- Replace `auth:check` reads with `ctx.user ?? ctx.auth?.user` when the current-user context is enough.
- Replace static `ctx.request({ url: 'collection:list/get' })` collection reads with resource APIs.
- Rewrite builder-style filter groups to query filters manually when resource code needs them.

Never auto-invent missing returns, form-only API substitutes, unknown expression wrappers, or hidden capability reroutes.
