# RunJS Failure Taxonomy

Use this to decide whether to add a new snippet, repair mapping, or surface rule.

## Categories

- `surface mismatch`: code was written for event-flow/linkage/value/render/action in the wrong host.
- `ctx root mismatch`: selected snippet requires a `ctx.*` root not available on the chosen surface.
- `wrong effect style`: value code used side effects, render code returned values, or action code rendered UI.
- `resource access mismatch`: NocoBase resource reads used `ctx.request(...)` instead of resource APIs.
- `blocked capability`: code used APIs intentionally disallowed as final skill output, especially `ctx.openView(...)`.
- `missing metadata`: target field, source field, modelUse, or form/table context was not known before code generation.

## Decision Rule

If a failure repeats and has a short source-backed fix, add or refine a `safe` snippet. If it depends on runtime context or user confirmation, keep it in `guarded` or document a stop condition.
