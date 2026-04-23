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
3. If `nb` is available but its env/runtime/auth is not ready, stop and repair the `nb` path.
4. If `nb` itself is unavailable, report that the task is blocked on a usable `nb` command.

## Required CLI Preparation

Before the first runtime command in a task:

1. `nb --help`
2. `nb env --help`
3. If the current env is missing or incomplete, repair it first:
   - `nb env add --name <name> --base-url <http://host:port/api> --token <token>`
   - `nb env use <name>`
   - `nb env update`
4. After the env is ready, run `nb api flow-surfaces --help`
5. Before first use of a specific subcommand, run `nb api flow-surfaces <subcommand> --help`

## Stop Conditions

Stop and repair the nb path when:

- `nb` exists but no env is configured yet
- the selected env is missing `base-url` or `token`
- `env update` fails because `swagger:get` is unavailable or the API documentation plugin is disabled
- `flow-surfaces` or the required generated subcommand is still missing after `env add/use/update`
- the chosen nb path returns auth failures such as `401`, `403`, or equivalent token errors

When repair fails, report the `nb` command/output that blocked the task and the exact env step needed next.

## Why the Docs Stay

- `nb --help` tells you the live command surface and flags.
- The retained UI Builder docs in this repo still define:
  - page blueprint authoring rules
  - reaction semantics
  - preview/self-check rules
  - payload invariants
  - readback/verification rules

The nb CLI does not replace those authoring rules; it only becomes the canonical transport.
