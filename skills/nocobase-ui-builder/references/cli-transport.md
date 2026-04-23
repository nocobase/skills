# CLI Transport

This file defines the transport policy for `nocobase-ui-builder`.

## Canonical Front Door

- Use `nocobase-ctl flow-surfaces` whenever it is available.
- Treat the retained `applyBlueprint`, `flowSurfaces:*`, and MCP tool docs as the backend contract and fallback reference, not as the first front door.
- Keep `nb-page-preview` and `nb-runjs` as local helper CLIs only. Invoke them through `node skills/nocobase-ui-builder/runtime/bin/<helper>.mjs` from the repo root, or through the equivalent absolute path; do not probe bare PATH commands first.
- `node skills/nocobase-ui-builder/runtime/bin/nb-page-preview.mjs --prepare-write` is a local/read-only gate: it prepares `result.cliBody`, but the remote write still happens in a separate `nocobase-ctl flow-surfaces apply-blueprint` step.

## Selection Rule

1. Check whether `nocobase-ctl` is available in the current environment.
2. If it is available, use `nocobase-ctl flow-surfaces`.
3. If the CLI is available but its env/runtime/auth is not ready, stop and repair the CLI path instead of switching to MCP.
4. Only fall back to MCP when the CLI itself is unavailable, or when the current environment still cannot expose the required runtime command family through the CLI after the repair sequence has completed.

## Required CLI Preparation

Before the first runtime command in a task:

1. `nocobase-ctl --help`
2. `nocobase-ctl env --help`
3. If the current env is missing or incomplete, repair it first:
   - `nocobase-ctl env add --name <name> --base-url <http://host:port/api> --token <token>`
   - `nocobase-ctl env use <name>`
   - `nocobase-ctl env update`
4. After the env is ready, run `nocobase-ctl flow-surfaces --help`
5. Before first use of a specific subcommand, run `nocobase-ctl flow-surfaces <subcommand> --help`

## Stop Conditions

Stop and repair the CLI path when:

- `nocobase-ctl` exists but no env is configured yet
- the selected env is missing `base-url` or `token`
- `env update` fails because `swagger:get` is unavailable or the API documentation plugin is disabled
- `flow-surfaces` or the required generated subcommand is still missing after `env add/use/update`
- the chosen CLI path returns auth failures such as `401`, `403`, or equivalent token errors

Only after the CLI itself is unavailable, or after the repaired env still cannot expose the required runtime family, may the skill fall back to direct MCP/API execution.

## Why the Docs Stay

- CLI `--help` tells you the live command surface and flags.
- The retained UI Builder docs in this repo still define:
  - page blueprint authoring rules
  - reaction semantics
  - preview/self-check rules
  - payload invariants
  - readback/verification rules
  - MCP/API fallback mapping

The CLI does not replace those authoring rules; it only becomes the canonical transport.
