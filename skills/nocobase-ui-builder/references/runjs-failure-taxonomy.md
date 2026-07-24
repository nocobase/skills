# RunJS Failure Taxonomy

Use this to decide whether to add a new snippet, repair mapping, or surface rule.

## Categories

- `surface mismatch`: code was written for event-flow/linkage/value/render/action in the wrong host.
- `ctx root mismatch`: selected snippet requires a `ctx.*` root not available on the chosen surface.
- `wrong effect style`: value code used side effects, render code returned values, or action code rendered UI.
- `resource access mismatch`: NocoBase resource reads used `ctx.request(...)` instead of resource APIs.
- `workspace capability unavailable`: a JS Block returned an explicit `FLOW_SURFACE_RUNJS_BOOTSTRAP_PROVIDER_UNAVAILABLE` or `RUNJS_SOURCE_KIND_UNSUPPORTED`, and the corresponding Workspace provider/action is confirmed unavailable. Apply [runjs-capability-gate.md](./runjs-capability-gate.md); no other error class permits single-file fallback.
- `workspace state failure`: pending/retryable initialization, authentication/permission, missing owner/Repository/base commit, stale CAS, compile diagnostics, archived Repository, resource limit, or network/5xx failure. Repair or report the real condition; do not relabel it as unsupported multi-file capability.
- `blocked capability`: code used a capability target that is invalid for the chosen surface, especially popup opening with an unresolved host, transient uid, `ChildPageModel`, page/tab, or popup subtree. For valid popup intent, resolve a template-first popup-capable FlowModel first, then use `global/open-popup-flow-model` / `ctx.openView(triggerUid, ...)`.
- `missing metadata`: target field, source field, modelUse, or form/table context was not known before code generation.

## Decision Rule

If a failure repeats and has a short source-backed fix, add or refine a `safe` snippet. If it depends on runtime context or user confirmation, keep it in `guarded` or document a stop condition. A generic 404, 401/403, 409, 413, compile diagnostic, or network/5xx failure never proves that Workspace capability is unavailable.
