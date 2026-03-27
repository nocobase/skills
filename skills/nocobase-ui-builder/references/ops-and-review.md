# Run logging and review

## When to read this file

- any discovery or write action exists in the run
- phase, gate, or cache events need to be recorded
- write-after-read reconciliation is required
- a review or improve report needs to be generated
- the run needs to explain why it is `success`, `partial`, or `failed`

## Default directories

- the current session root is resolved automatically in normal cases
- pin the session root with `--session-id`, `NOCOBASE_UI_BUILDER_SESSION_ID`, or `NOCOBASE_UI_BUILDER_SESSION_ROOT` when needed
- move the whole state directory with `NOCOBASE_UI_BUILDER_STATE_DIR`
- stable local state defaults to `~/.nocobase/state/...`; the older `~/.codex/state/...` path is reused if needed

## Default phases

- `schema_discovery`
- `stable_metadata`
- `write`
- `readback`
- `browser_attach`
- `smoke`

## Optimization baseline

### Stable metadata cache

- cache only stable results: `schemaBundle`, `schemas`, collection fields, and relation metadata
- never cache live tree state, post-write readback, or runtime results
- prefer `scripts/stable_cache.mjs`

### Platform noise baseline

- React invalid prop, deprecated warnings, duplicate registration noise, and FlowEngine circular warnings should be treated as baseline noise first
- real runtime exceptions remain blocking
- prefer `scripts/noise_baseline.mjs`

### Contract normalization and gates

- when the flow can compile into BuildSpec or VerifySpec, prefer `scripts/spec_contracts.mjs`
- prefer `scripts/gate_engine.mjs` for gate decisions
- stop conditions should not live only in free-form prompt text

## tool_journal rules

1. persist the `logPath` returned by `start-run`
2. record `tool_call` immediately after each MCP call
3. record `tool_call` for local script calls too
4. record major branch decisions as `note`
5. record important stages as `phase`
6. record gate decisions as `gate`
7. record cache hits and invalidations as `cache-event`
8. always finish the run with `run_finished`

## Ad-hoc write entrypoint

1. The agent calls MCP first, then passes artifacts to the wrapper. The wrapper always runs `start-run -> guard -> consume write artifact -> consume readback artifact -> finish-run`.
2. `--action create-v2|save|mutate|ensure` is normalized through the wrapper. Only bypass it when implementing or debugging the wrapper itself.
3. Default to `mode=validation-case`. Only use `preflight_write_gate.mjs` directly for draft debugging.
4. Exit code `2` means a guard blocker stopped the write. Exit code `1` means the write or readback verification failed.
5. `flow_write_wrapper.mjs` may remain for flow-only compatibility, but it is not the default entrypoint.
6. Before writing, the wrapper should read live topology where possible. If an existing uid tries to change `parentId/subKey/subType`, fail before the write.
7. Explicit layout grids must reconcile `gridSettings.rows/rowOrder/sizes` with `subModels.items`. Orphaned row references or items missing from rows are tree-path failures.
8. `save ok` with incomplete slot membership in readback is still `failed` or `partial`. Do not report it as fully persisted.

## tool_call evidence requirements

- `toolType=mcp` success or error records must keep raw evidence
- `result-file` and `error-file` must trace back to the top-level `call_id`
- if the tool exposes `exec_id`, record it too
- do not replace evidence with only free-form `summary` or `error` text

## write-after-read conclusions

Track at least:

- `save` or `mutate` returned `ok`
- `createV2` succeeded
- the flow model anchor exists
- target page, tab, or grid exists
- explicit tabs and duplicate tabs
- `filterManager`
- selector, `filterByTk`, and `dataScope` summary
- whether each block really landed in the expected slot
- whether `gridSettings.rows` and `subModels.items` agree

## tool_review_report

The review report should include:

- result axes: `pageShellCreated`, `routeReady`, `readbackMatched`, `dataReady`, `runtimeUsable`, `browserValidation`, `dataPreparation`
- run summary: task, runId, status, duration, and page target
- page URL when available
- tool statistics: call count, failures, skips
- failed calls: tool, error summary, key args
- guard summary: `audit-payload`, blocker or warning counts, and risk-accept
- timeline: `tool_call`, `note`, `phase`, `gate`
- improvement ideas for reaching the same result faster next time

Allowed conservative statuses:

- `not-recorded`
- `evidence-insufficient`
- `skipped (not requested)`
- `not-run`

## Improve rules

Focus on:

1. discovery happening too late or too granularly
2. repeated reads or repeated calls
3. retrying by guessing parameters after failure
4. whether adjacent writes can be merged into one `PostFlowmodels_mutate`
5. whether a reusable minimal-success template is missing
6. whether validation issues can be moved back into guard, recipe, or reference docs

## Final reporting rules

Always report these axes separately:

- `pageShellCreated`
- `routeReady`
- `readbackMatched`
- `dataReady`
- `runtimeUsable`
- `browserValidation`
- `dataPreparation`
- `pageUrl`
- report path and improve path
