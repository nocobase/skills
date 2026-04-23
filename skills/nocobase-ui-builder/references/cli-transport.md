# nb Transport

This file defines the transport policy for `nocobase-ui-builder`.

## Canonical Front Door

- Use `nb api flow-surfaces` whenever it is available.
- Treat the retained `applyBlueprint`, `flowSurfaces:*`, and backend API docs as the backend contract and payload reference, not as a separate user-facing transport.
- Keep `nb-page-preview` and `nb-runjs` as local helper CLIs only. Invoke them through `node skills/nocobase-ui-builder/runtime/bin/<helper>.mjs` from the repo root, or through the equivalent absolute path; do not probe bare PATH commands first.
- `node skills/nocobase-ui-builder/runtime/bin/nb-page-preview.mjs --prepare-write` is a local/read-only gate: it prepares `result.cliBody`, but the remote write still happens in a separate `nb api flow-surfaces apply-blueprint` step.

## Selection Rule

1. Check whether `nb` is available in the current environment.
2. If it is available, use `nb api flow-surfaces`.
3. If `nb` is available but its runtime/auth is not ready, stop and report the blocked command state.
4. If `nb` itself is unavailable, report that the task is blocked on a usable `nb` command.

## Required CLI Preparation

Before the first runtime command in a task:

1. `nb --help`
2. `nb api flow-surfaces --help`
3. Before first use of a specific subcommand, run `nb api flow-surfaces <subcommand> --help`

## Stop Conditions

Stop and report the blocked nb command state when:

- `nb` exists but cannot authenticate to the target app
- the required `flow-surfaces` family or generated subcommand is missing
- the chosen nb path returns auth failures such as `401`, `403`, or equivalent token errors

When blocked, report the exact `nb api ...` command/output that failed. Do not switch transports inside this skill.

## Why the Docs Stay

- `nb --help` tells you the live command surface and flags.
- The retained UI Builder docs in this repo still define:
  - page blueprint authoring rules
  - reaction semantics
  - preview/self-check rules
  - payload invariants
  - readback/verification rules

The nb CLI does not replace those authoring rules; it only becomes the canonical transport.
