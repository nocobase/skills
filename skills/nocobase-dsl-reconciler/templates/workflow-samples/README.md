# Workflow Pattern Catalog

Read-only reference for node types the CRM workflows don't exercise. Each
file is a minimum-viable workflow that demonstrates **one** pattern; adapt
the shape, don't copy-paste the whole file.

These are NOT deployable as-is — collection names (`nb_demo_*`) and
workflow/channel keys are placeholders. Swap them for your project's
identities before any push.

| File | Pattern | Key nodes |
|---|---|---|
| `http_request_and_update.yaml` | Call an external HTTP API, store the response on a record | `request` → `update` |
| `loop_over_records.yaml` | Query a batch, iterate, update each | `query` → `loop` (body: `update`) |
| `parallel_fan_out.yaml` | Kick off independent branches simultaneously | `parallel` (3 branches: `notification`, `sql`, `request`) |
| `manual_review_step.yaml` | Pause for a human decision before continuing | `manual` → `condition` (`approved?`) → `update` |
| `call_subflow.yaml` | Delegate a chunk of logic to another workflow | `subflow` |
| `webhook_responder.yaml` | External system hits a webhook; respond with data | trigger: `webhook` → `query` → `response` |
| `end_and_output.yaml` | Terminate early or expose a return value | `condition` → `end` / `output` |

See `src/workflow/DSL.md` for the full format reference (trigger types,
node type → required core params, branch label table, variable namespaces).
