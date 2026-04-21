# RunJS runtime

Read this file when you need to run the local RunJS validator CLI. For JS model selection and code rules, see [js.md](./js.md).

## Contents

1. Canonical repo-root entry
2. Canonical payload example for `validate --stdin-json`
3. Dev entry points inside the runtime directory
4. Network-mode constraints
5. Validator semantics overview

## Canonical repo-root entry

The commands below assume that the current cwd is the repository root and that the Node version is `>=18`.

```bash
node "${CODEX_HOME:-$HOME/.codex}/skills/nocobase-ui-builder/runtime/bin/nb-runjs.mjs" validate --stdin-json --skill-mode
node "${CODEX_HOME:-$HOME/.codex}/skills/nocobase-ui-builder/runtime/bin/nb-runjs.mjs" batch --input "${CODEX_HOME:-$HOME/.codex}/skills/nocobase-ui-builder/runtime/fixtures/batch.json" --skill-mode
```

The canonical execution path for this skill always includes `--skill-mode`:

- This is the conservative mode intended for normal skill execution
- public runtime mode is fixed to `validate`
- only absent/mock network is allowed
- network reads are only allowed through `ctx.request(...)` / `ctx.api.request(...)`; `fetch` is not part of the public contract
- under `mode = "mock"`, an unmatched request returns the default auto-mock `200 + {}`
- `network.mode = "live"` is blocked immediately

## Canonical payload example for `validate --stdin-json`

When using `validate --stdin-json`, the recommended stdin JSON follows this canonical shape:

```json
{
  "surface": "js-model.render",
  "model": "JSColumnModel",
  "code": "ctx.render(String(ctx.record?.nickname || ''));",
  "context": {}
}
```

Field notes:

- `surface`: optional but recommended for skill-mode RunJS; it may also be provided via CLI `--surface`, but if both are present they must match
- `model`: required for `js-model.render` and `js-model.action`; value/event/linkage surfaces may omit it because the runtime uses a conservative internal validation profile
- `code`: required string
- `context`: optional JSON object
- `network`: optional JSON object; constraints continue to follow "Network-mode constraints" below
- `skillMode`: optional; if the CLI explicitly passes `--skill-mode`, the CLI wins
- `version`: optional; if the CLI explicitly passes `--version`, the CLI wins
- `timeoutMs`: optional; if the CLI explicitly passes `--timeout`, the CLI wins
- `filename`: optional; defaults to `<stdin>`

## Dev entry points inside the runtime directory

If the current cwd is already `skills/nocobase-ui-builder/runtime`, you can use these shorter development commands:

```bash
node ./bin/nb-runjs.mjs validate --surface js-model.render --model JSBlockModel --code-file ./fixtures/js-block-code.js
node ./bin/nb-runjs.mjs validate --surface js-model.render --model JSBlockModel --code-file ./fixtures/js-block-code.js --context-file ./fixtures/js-block-context.json
node ./bin/nb-runjs.mjs validate --surface js-model.render --model JSBlockModel --code-file ./fixtures/js-block-code.js --network-file ./fixtures/network-mock.json
node ./bin/nb-runjs.mjs validate --surface reaction.value-runjs --stdin-json
node ./bin/nb-runjs.mjs validate --model ChartOptionModel --stdin-json
node ./bin/nb-runjs.mjs validate --model ChartEventsModel --stdin-json
node ./bin/nb-runjs.mjs batch --input ./fixtures/batch.json
```

These commands are mainly for local runtime development or debugging. Normal skill execution should still prefer the repo-root canonical entry above.

Additional notes:

- Single validation can pass mock network config through `--network-file`
- Batch tasks support either `network` or `networkFile`

## Network-mode constraints

- `network` is omitted by default
- When request reads are needed, prefer `mode = "mock"` and route them through `ctx.request(...)` / `ctx.api.request(...)`
- `mode = "live"` is not allowed under `--skill-mode`
- If you truly need to debug live network, explicitly step outside this skill's canonical execution chain

Optional mock-network config example:

```json
{
  "mode": "mock",
  "responses": [
    {
      "url": "https://example.com/api/users",
      "body": { "nickname": "Alice" }
    }
  ]
}
```

## Validator semantics overview

This file only keeps CLI/runtime-layer semantics. For model selection, strict render rules, context contracts, and gate rules, [js.md](./js.md) remains authoritative.

- The public CLI only exposes `validate` / `batch`
- When `surface` is present, `nb-runjs` first runs the same surface-first static contract as `runjs_guard.mjs`
- JSX goes through compat lowering before execution
- The syntax layer uses Node `vm.Script` as a baseline syntax gate
- The context layer checks the static contract of `ctx.*` / top-level aliases
- The policy layer statically blocks side effects such as navigation, write requests, `fetch`, and dynamic code generation
- The runtime layer only provides a minimal compat surface; the result returns a validation report, not a public preview payload
