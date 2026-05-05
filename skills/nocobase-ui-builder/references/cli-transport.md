# nb Transport

This file defines the transport policy for `nocobase-ui-builder`.

## Canonical Front Door

- Use `node skills/nocobase-ui-builder/runtime/bin/nb-flow-surfaces.mjs` as the agent-facing front door for `flow-surfaces` work.
- The wrapper routes to backend flow-surfaces transport; treat the retained `applyBlueprint`, `flowSurfaces:*`, and backend API docs as the backend contract and payload reference, not as a separate user-facing transport.
- Keep `nb-runjs`, `nb-template-decision`, and `nb-localized-write-preflight` as local helper CLIs only. Invoke them through `node skills/nocobase-ui-builder/runtime/bin/<helper>.mjs` from the repo root, or through the equivalent absolute path; do not probe bare PATH commands first.
- `node skills/nocobase-ui-builder/runtime/bin/nb-flow-surfaces.mjs apply-blueprint` runs internal prepare-write before backend execution and sends only the prepared `result.cliBody` to the backend.

## Selection Rule

1. Check whether `nb` is available in the current environment.
2. If it is available, use the wrapper `node skills/nocobase-ui-builder/runtime/bin/nb-flow-surfaces.mjs`.
3. If `nb` is available but its runtime/auth is not ready, stop and report the blocked command state.
4. If `nb` itself is unavailable, report that the task is blocked on a usable `nb` command.

## Required CLI Preparation

Before the first runtime command in a task:

1. `nb --help`
2. Before first use of a specific subcommand, run `node skills/nocobase-ui-builder/runtime/bin/nb-flow-surfaces.mjs <subcommand> --help`

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
  - local self-check rules
  - payload invariants
  - readback/verification rules

The nb CLI does not replace those authoring rules; it only becomes the canonical transport.
