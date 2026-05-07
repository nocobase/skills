# Reconcile And Versioning

Use this reference before every mutating task in `nocobase-plan-executor`.

## Core Model

Every continuation task has three states:

- `baseline`: the last accepted normalized snapshot captured after a previous executor task.
- `live`: the current NocoBase readback from the target environment.
- `planned`: the intended output or write-set for the next task.

Decision rule:

```text
if live == baseline:
  execute planned
else if live changed paths do not intersect planned write-set:
  preserve live changes and execute merged task
else:
  stop and ask user to adopt / overwrite / merge / pause
```

Never assume plan files are the latest source of truth after the user has worked in the NocoBase UI.

## Drift Detection By Task Type

### UI Pages

Read:

- `desktopRoutes` for menu/page/tab placement.
- `flow-surfaces get` for each relevant `pageSchemaUid`.

Normalize and compare:

- menu group title, page title, tab title
- block type, title, collection/resource binding
- fields and dotted display paths
- actions and record actions
- layout rows/spans
- popup presence and important popup block structure
- reaction/linkage slots when the task touches them

Ignore:

- `uid`, `name`, `schemaUid` when used only as generated internal identity
- `createdAt`, `updatedAt`, `sort`, internal props that do not affect user-visible structure
- generated node map order when public layout and block ordering are unchanged

Conflict examples:

- user removed a field from a table and planned also rewrites the same table fields
- user moved blocks and planned uses whole-page replace
- user changed a popup and planned replaces the same popup

Merge policy:

- Prefer localized edits against live pages.
- Preserve user-added blocks, fields, actions, and layout when planned only adds a separate block/action.
- Use whole-page replace only when the user explicitly chooses overwrite.
- If adopting live UI changes, update the task ledger so future tasks target live `pageSchemaUid` and route IDs.

### Data Model

Read:

- `collections get --appends fields` for each relevant collection.

Normalize and compare:

- collection `name`, `title`, template
- field `name`, `interface`, `type`, `enum`, `defaultValue`, required/allowNull when available
- relation `target`, `foreignKey`, `targetKey`, reverse field when available

Ignore:

- field `key`
- timestamps
- generated relation keys unless the planned task targets relation internals

Conflict examples:

- user changed a field type and planned changes the same field
- user deleted a field that planned expects to populate
- user changed a relation target or foreign key

Merge policy:

- Adding new fields is usually safe when names do not collide.
- Preserve user-added fields.
- Field deletion, type changes, enum changes, and relation changes require explicit confirmation.
- If a planned field already exists with compatible shape, treat it as satisfied and continue.

### Workflows

Read:

- `workflow workflows get --appends nodes --appends versionStats`.

Normalize and compare:

- workflow title, key, type, enabled
- trigger config
- node chain order, node type, node config
- branch conditions and script bodies when applicable
- version execution stats

Ignore:

- node numeric IDs except as locators
- timestamps
- generated sort values when chain semantics are unchanged

Conflict examples:

- user enabled a workflow and planned edits the same workflow
- user changed trigger config
- user changed a node that planned also updates
- current version has executions and planned edits in place

Merge policy:

- New disabled workflow drafts are usually safe.
- If editing an existing workflow, create a revision when the workflow version is frozen or has executions.
- Enabling workflows always requires confirmation.
- Conflicting node or trigger changes require user choice before applying.

### ACL

Read:

- Use `nocobase-acl-manage` readback commands for roles, desktop routes, global role mode, data source permissions, resource actions, scopes, and user-role membership.

Normalize and compare:

- role identifiers and titles
- global role mode
- system snippets
- route IDs allowed per role
- collection/resource actions, fields, and scopes
- user-role bindings

Ignore:

- display ordering unless the task targets it
- timestamps

Conflict examples:

- user granted broader permissions than plan
- user restricted a role and planned grants broad access
- planned changes same role/resource action modified in live

Merge policy:

- Do not auto-merge ACL writes.
- Always present a confirmation summary with scope, actions, fields, and risk.
- If live differs from baseline, ask whether to adopt live policy first, overwrite it, or produce a revised ACL plan.

### Config And Seed Data

Read:

- Use `resource list` or collection-specific readback for records named in the plan.

Normalize and compare:

- use business keys, not record IDs, when possible
- examples: SLA policy by `priority`, category by `name`, customer by `name`
- compare fields the task plans to write

Ignore:

- generated IDs
- timestamps
- unrelated records outside the task scope

Conflict examples:

- user changed `responseHours` for priority `urgent` and planned also changes it
- user deleted a category required by planned UI defaults
- user added a same-name config record with different semantics

Merge policy:

- Upsert by business key when no conflict exists.
- Preserve user-added records.
- Same business key with differing planned values is a conflict requiring confirmation.

## Write-Set Intersection

Represent planned writes as stable paths:

- UI: `page:<pageSchemaUid>.blocks.<blockKey>.fields`, `page:<uid>.layout`, `page:<uid>.actions`
- Data model: `collection:<name>.field:<fieldName>.<property>`
- Workflow: `workflow:<key>.trigger`, `workflow:<key>.node:<nodeKey>.config`
- ACL: `role:<role>.resource:<collection>.action:<action>`
- Config data: `collection:<name>.record:<businessKey>.<field>`

If drift paths intersect planned write paths, stop before writing.

## User Choices On Conflict

Offer these choices:

- `adopt`: accept live changes as the new plan baseline and adjust future tasks.
- `overwrite`: apply the planned change over live state; require explicit confirmation for destructive or broad impact.
- `merge`: ask for exact field/block/node/action choices, then execute a revised task.
- `pause`: record drift report and stop.

For ACL and destructive schema/workflow changes, do not offer silent auto-merge.

## Version Artifacts

When artifacts are available, keep:

- `baseline/<task-id>.json`: normalized accepted snapshot.
- `drift/<timestamp>-<task-id>.json`: baseline/live/planned summary and conflict paths.
- `PlanVersions.md`: human-readable version log.

Version log entry shape:

```text
Version: v<N>
Source: executor task | adopted live changes | manual merge
Target env: <env>
Changed targets:
- <collection/page/workflow/role/config>
Decision:
- adopted / overwritten / merged / paused
Evidence:
- <readback command or artifact path>
```
