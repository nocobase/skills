# nb Transport

This file defines the transport policy for `nocobase-ui-builder`.

## Canonical Front Door

- Use `nb api flow-surfaces <action>` as the agent-facing front door for `flow-surfaces` work.
- Treat `applyBlueprint`, `flowSurfaces:*`, and backend API docs as the payload reference.
- Keep `nb-template-decision` as the only local helper CLI. It is a planning aid.
- Do not require skill-local helper output, wrapper envelopes, or `cliBody` before writes.

## Selection Rule

1. Check whether `nb` is available in the current environment.
2. If it is available, use `nb api flow-surfaces <action>`.
3. If `nb` is available but its runtime/auth is not ready, stop and report the blocked command state.
4. If `nb` itself is unavailable, report that the task is blocked on a usable `nb` command.

## Required CLI Preparation

Before the first runtime command in a task:

1. `nb --help`
2. Before first use of a specific action, run `nb api flow-surfaces <action> --help` when the installed CLI supports action-level help.

## Stop Conditions

Stop and report the blocked command state when:

- `nb` exists but cannot authenticate to the target app
- the required `flow-surfaces` family or action is missing
- the chosen `nb api flow-surfaces` command returns auth failures such as `401`, `403`, or equivalent token errors

When blocked, report the exact `nb api flow-surfaces <action>` command/output that failed. Do not switch transports inside this skill.

## Why the Docs Stay

- `nb --help` tells you the live command surface and flags.
- The retained UI Builder docs in this repo still define:
  - page blueprint authoring rules
  - reaction semantics
  - local self-check rules
  - payload invariants
  - readback/verification rules

The nb CLI does not replace those authoring rules; it only becomes the canonical transport.
