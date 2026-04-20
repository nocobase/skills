# Workflow DSL

Flat, NB-native YAML for `workspaces/<project>/workflows/<slug>/workflow.yaml`.
Agent fills only the core params. The deployer fills NB boilerplate.

## Shape

```yaml
title: <human name>              # required
type: <trigger type>             # required — see Triggers table
enabled: false                   # default false (safe); flip to true after review
key: <runtime key>               # filled by pull; used to rewrite page refs after revision
sync: false                      # optional; immutable after create
description: <text>              # optional

trigger:                         # required; shape depends on `type`
  ...core trigger params...

graph:                           # required; Mermaid-ish edges (see Graph)
  - <head node>
  - <source> --> <target>
  - <source> --> [<label>] <target>

nodes:                           # required; DSL-name → NodeSpec
  <name>:
    type: <node type>
    title: <display name>        # optional; defaults to <name>
    config: { ...core params... }
```

## Triggers

Only the core keys per trigger are listed. The deployer fills defaults like
`appends: []`. Any extra NB-native key the user provides is passed through.

| type | Required core | Notes |
|---|---|---|
| `collection` | `collection`, `mode` | `mode` bitmask: 1=create, 2=update, 3=create\|update, 4=delete, 7=all. `changed: [f1,f2]` + `condition: {$and: [...]}` optional. |
| `schedule` | `mode` (0=cron, 1=date-field) | mode=0 → `cron: '...'`; mode=1 → `collection`, `startsOn: { field: <date_field> }`. |
| `action` | — | Triggered by a page action button (DSL wires this via `workflowTrigger` action). |
| `custom-action` | — | Same, scoped to a collection. |
| `request-interception` | — | Pre-action hook. |
| `webhook` | `path` | Exposes a public HTTP endpoint. |
| `approval` | `collection`, `approvalUid`, `taskCardUid` | Applicant form + task card UIs live under `workflows/<slug>/ui/`. |

## Nodes

Only document the core `config` keys per node. Any other NB-native key is
passed through verbatim. `$ref` configs (large payloads factored out into
`components/<name>.yaml`) are resolved at deploy time and defaulted then.

| type | Required core | Notes / filled defaults |
|---|---|---|
| `query` | `collection`, `params.filter` | Default: `multiple: false`, `dataSource: main`, `params.sort: []`, `page: 1`, `pageSize: 20`, `appends: []`. |
| `create` | `collection`, `params.values` | Default: `dataSource: main`, `params.individualHooks: false`. |
| `update` | `collection`, `params.filter`, `params.values` | Same defaults as create. |
| `destroy` | `collection`, `params.filter` | Same defaults. |
| `sql` | `sql` | Default: `dataSource: main`. Use `{{$context.data.id}}` for variable interpolation. |
| `aggregate` | `collection`, `params.filter`, `params.field`, `params.method` | Default: `dataSource: main`. |
| `condition` | `calculation` | Default: `engine: basic`, `rejectOnFalse: false`. One `calculation.group` with `type: and\|or` and `calculations: [...]`. |
| `multi-condition` | `branches` | Default: `engine: basic`. Each branch picks a downstream via its `branchIndex`. |
| `calculation` | `expression`, `result` | Default: `engine: math.js`. Result name shows up as `{{$jobsMapByNodeKey.<name>.<result>}}`. |
| `notification` | `channelName`, `title`, `content`, `receivers[].filter` | `receivers` is a list of `{filter: {$and: [...]}}` clauses resolved against `users`. |
| `mailer` | `from`, `to`, `subject`, `html` | |
| `request` | `url`, `method` | Optional `headers`, `data`, `params`, `timeout`. |
| `delay` | `duration`, `unit` | `unit`: `ms`/`s`/`m`/`h`/`d`. |
| `manual` | `assignees`, `forms` | Assignee IDs or NB variables resolving to user ids. |
| `loop` | `target` | Body branch runs per item; use `{{$scopes.<loop_name>.item}}`. |
| `parallel` | `mode` | `mode`: `all`/`any`/`race`. Downstream nodes on each branch. |
| `approval` | `collection`, `approvalUid`, `taskCardUid`, `assignees` | UI trees in `workflows/<slug>/ui/<node>_form.yaml` + `<node>_card.yaml`. |
| `subflow` | `workflowId` | Calls another workflow synchronously. |
| `end` / `output` | — | Terminal nodes. |
| `script` | `source` | JS string; receives `ctx`. |
| `json-query` / `json-variable-mapping` | `input`, `mapping` | Map/transform a JSON value. |
| `response` / `response-message` | `body` | Used with `webhook` trigger. |

Plugin nodes (`loop`, `parallel`, `sql`, `mailer`, `cc`, `request`, `script`,
`approval`, `subflow`, `json-*`, `response*`, `aggregate`, `manual`) require
the matching plugin installed on the target NB instance.

## Graph

Flat Mermaid-inspired list. First bare name = chain head. Edges are one per
line. Branch labels are written in `[brackets]`.

```yaml
graph:
  - review              # chain head (must match a node name)
  - review --> approve  # main chain
  - approve --> [approved] do_update
  - approve --> [rejected] notify_rejection
```

Branch labels map to NB's `branchIndex`:

| Parent type | Label | branchIndex |
|---|---|---|
| `condition` | `yes` / `true` | 1 |
| `condition` | `no` / `false` / `otherwise` / `default` | 0 |
| `approval` | `approved` | 2 |
| `approval` | `rejected` | -1 |
| `approval` | `returned` | 1 |
| `loop` | `body` / `loop` | 0 |
| `parallel` / `multi-condition` | `0`, `1`, `2` … | as written |

Any integer written as a label (`[2]`) is used verbatim.

### Merge points are not supported

NB stores one upstream per node, so `A --> X; B --> X` can't express rejoin.
The validator errors. Route convergence through a downstream node (e.g. put
a `notification` in each branch), or finish each branch independently.

## Variable references

Mustache-style double braces. Known namespaces:

| Prefix | Meaning |
|---|---|
| `{{$context.data.<field>}}` | Trigger record fields (collection/action trigger). |
| `{{$jobsMapByNodeKey.<node_name>.<path>}}` | Upstream node result. Use the DSL `<name>`; the deployer rewrites it to the runtime node key. |
| `{{$scopes.<loop_name>.item}}` / `.index` | Loop scope. |
| `{{$system.now}}` / `{{$system.genSnowflakeId}}` | Runtime helpers. |
| `{{$env.<ENV_NAME>}}` | NB environment variables. |

Filter/condition objects **must** root on `$and` or `$or` — a flat
`{field: {...}}` at the root is a silent footgun (the validator errors).

## Approval UIs (and other `flow-model` trees)

For `approval` triggers and `approval` nodes, the form shown to the applicant
and the card shown to each approver are FlowModel trees. The DSL does **not**
reinvent that surface — it stores the tree verbatim under
`workflows/<slug>/ui/<purpose>.yaml`:

```
workflows/new_quotation/
  workflow.yaml
  ui/
    trigger_form.yaml        # applicant's form (maps to workflow.config.approvalUid)
    trigger_card.yaml        # applicant's task card (workflow.config.taskCardUid)
    manager_approval_form.yaml
    manager_approval_card.yaml
```

Pull captures these trees as-is; push upserts them preserving the UIDs, so a
duplicated workspace carries its approval UIs with it. If you need to redesign
an approval form, use `nocobase-ui-builder` on the live NB instance and pull.

## What the deployer fills in

- Workflow: `options.stackLimit: 1`, `options.deleteExecutionOnStatus: []`
- Collection/schedule trigger: `appends: []`
- `query` node: `multiple: false`, `dataSource: main`, `params.sort/page/pageSize/appends`
- `create`/`update`/`destroy`: `dataSource: main`, `params.individualHooks: false`
- `sql`/`aggregate`: `dataSource: main`
- `condition`: `engine: basic`, `rejectOnFalse: false`
- `multi-condition`: `engine: basic`
- `calculation`: `engine: math.js`

Pull runs the inverse: any field whose value equals the default is stripped,
so round-tripping keeps YAML minimal.

## Frozen versions

If a workflow has been executed (`versionStats.executed > 0`), the deployer
creates a new revision via `workflows:revision` with body `{current: true}`
before touching it. NB atomically flips `current` across versions: the old
row becomes inactive (`current=false`, `enabled=false`), the new row becomes
the live version. The new version inherits the same `key`, so any page action
referencing `workflowKey: <key>` keeps working.

Verified end-to-end: push a spec at an executed workflow → deployer logs
`* <slug>: frozen (executed=N) — created revision #<id> (now current)`,
then applies the DSL changes to the fresh revision.

## Minimal example

See `templates/starter/workflows/notify_on_new_project/workflow.yaml` — one
collection trigger + one notification node, 15 lines total.

## CRM references

Real shapes to consult (read-only, copy ideas, don't `cp -r`):

| Pattern | Example |
|---|---|
| Simple SQL+query+notify | `templates/crm/workflows/lead_assignment/workflow.yaml` |
| Schedule + condition branch | `templates/crm/workflows/follow_up_reminder/workflow.yaml` |
| LLM + `$ref` components | `templates/crm/workflows/lead_scoring/workflow.yaml` |
| Approval with 3-way branch + UI tree | `templates/crm/workflows/new_quotation/` |
