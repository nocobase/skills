# Normative Contract

This page is the single source of truth for `nocobase-ui-builder`. Rules involving DSL-first drafting/execution, confirmation threshold, `catalog`, popup shell fallback, and schema drift / recovery are defined here exactly once. Other documents only reference them and must not redefine them.

## 1. Precedence

Rule precedence is always:

1. live MCP schema / live `validateDsl` / `executeDsl` / `describeSurface` / `get` / `catalog` / `context` / `readback`
2. this `Normative Contract`
3. topic references (`popup` / `settings` / `verification` / `runtime-playbook`, etc.)
4. example payloads / heuristic explanations

If a lower-priority document conflicts with a higher-priority live fact, follow the higher-priority source.

## 2. DSL-First Contract

### Default principles

- High-level page-building requests must first become `blueprint DSL`, even when the page uses nested popups, popup-scoped bindings such as `currentRecord` / `associatedRecords`, same-row layouts, or field `clickToOpen/openView`.
- Existing-surface structural edits must first become `patch DSL` when the required change is covered.
- Complexity, missing local examples, or low subjective confidence are not valid reasons to skip DSL. Let `validateDsl` decide current coverage.
- DSL drafting is read-only. Do not call any `flow_surfaces_*` write API before the task is ready to execute.

### Allowed read surface during DSL authoring

During DSL authoring, the skill may use:

- `desktop_routes_list_accessible(tree=true)` for menu discovery
- `flow_surfaces_describe_surface` when an existing surface needs public-tree / refs / fingerprint facts
- `flow_surfaces_get`, `flow_surfaces_catalog`, `flow_surfaces_context` for live UI capability and target-state inspection
- read-only collection/schema discovery such as `collections:list` and `collections:get`

Do not use collection reads to mutate schema, and do not use schema reads as a substitute for UI writes.

### Collection discovery priority during DSL authoring

- Use `collections:list` only to narrow candidate collections.
- Use `collections:get(appends=["fields"])` as the default field-schema truth whenever field coverage, `interface`, or relation metadata matters. Treat this as the primary source for both scalar fields and relation fields.
- When the question is "can this target/container add this field now?", the source of truth is `flow_surfaces_catalog({ target, sections: ["fields"] })`, not collection schema alone.

### Data-bound vs non-data blocks

- Every `data-bound block` in DSL must be backed by a real collection / association path / live binding fact.
- `non-data block`s may omit a data source entirely.
- Do not overstate this as "every block must bind a collection". Static or tool-like blocks such as `markdown`, `iframe`, `actionPanel`, or `jsBlock` may stay unbound.
- If a requested field or binding does not exist in live schema facts, stop guessing. Surface the gap in DSL or hand off to `nocobase-data-modeling`.

### DSL correctness gates

- Always emit explicit `dsl.kind` and `dsl.version = "1"`. Do not rely on backend inference.
- Keep `assumptions` visible. If a decision still needs user confirmation, put it in `unresolvedQuestions` instead of pretending certainty.
- `executeDsl` is only allowed when `unresolvedQuestions` is empty.
- `blueprint DSL` must keep `target.mode`, popup `completion`, and full page `layout` explicit.
- `patch DSL` must keep `target.locator` explicit, and each change must use either a stable DSL id or a live locator.

### Confirmation threshold

Show a DSL draft and stop for confirmation when any of the following is true:

- the request is ambiguous, high-impact, destructive, or spans multiple plausible structures
- the DSL still has non-empty `unresolvedQuestions`
- the page depends on guessed business semantics rather than proven live facts
- the user explicitly asks to review the structure first

Direct execution is allowed only when all of the following are true:

- the request is clear and bounded
- the target is unique
- `unresolvedQuestions` is empty
- the skill is not inventing fields, bindings, popup content, or destructive scope

## 3. Execution Entry Contract

### Default principles

- Structural create/update should first attempt `validateDsl -> executeDsl -> readback`, not hand-written primitive chaining.
- For new pages, prefer `blueprint DSL -> validateDsl -> executeDsl -> readback`.
- For existing-surface writes, prefer `describeSurface -> patch DSL -> validateDsl -> executeDsl -> readback` so the DSL run is anchored to a live fingerprint.
- Use `verificationMode = "strict"` by default on `executeDsl`.
- The low-level path `get -> [catalog] -> createPage/compose/add*/configure -> readback` is a fallback, not the default, and it does not become allowed merely because the page is complex.

### When DSL execution is the default

Use DSL execution by default when any of the following is true:

- you are creating a new page from high-level intent
- you are updating an existing page through whole-surface structure semantics
- you are making an existing-surface edit covered by patch ops such as block / field / action / recordAction / layout / node / tab / settings changes
- you want backend selector resolution, fingerprint validation, or strict verification around the same structural request

### Existing-surface anchoring rules

- For existing-surface DSL execution, read `describeSurface` first when the next step is structural execution.
- Pass `expectedFingerprint` from `describeSurface` into `validateDsl` / `executeDsl` for existing-surface runs.
- Use `bindRefs` only when you need stable names for already existing nodes. Do not surface declared-ref persistence details as user-facing workflow steps.

### When low-level fallback is allowed

Use direct lifecycle / low-level APIs only when any of the following is true:

- the work is a lifecycle-only exception outside current DSL coverage, such as isolated menu-group creation, menu moves, or template-record management
- a prior `validateDsl` attempt has returned concrete unsupported / schema / contract evidence showing that the current change is outside DSL coverage or cannot preserve the required semantics

Allowed fallback families include `createMenu`, `updateMenu`, `createPage`, `compose`, `addBlock`, `addField`, `addAction`, `addRecordAction`, `configure`, `updateSettings`, `setLayout`, and other flow-surfaces public writes that preserve the intended semantics.

### Required fallback evidence

- Do not fall back to low-level writes merely because the page is complex, popup-heavy, relation-heavy, or under-documented locally.
- When fallback happens after a DSL attempt, the commentary must identify the failing `validateDsl` attempt, the concrete error, and why that error proves the current change is outside DSL coverage.

## 4. Catalog Contract

In this section, `catalog(...)` is shorthand for `flow_surfaces_catalog(...)`.

### Default principles

- `catalog` is smart by default.
- `catalog` is not globally mandatory.
- For an existing surface, default to `get` first. Only append `catalog` when a specific contract requires it.
- For lifecycle APIs, fixed payload shapes, and simple writes that do not depend on live capability, do not mechanically add `catalog` out of habit.

### When you must read `catalog`

You must read `catalog({ target })` first when any of the following is true:

- You need to decide whether the current target truly supports creating a certain block / field / action type.
- You need live `configureOptions` / `settingsContract`.
- You need to inspect popup `resourceBindings`, for example whether `currentRecord` is exposed.
- You need to narrow live capability for JS / chart / association-popup / filterForm multi-target scenarios.
- `get` alone cannot determine the container's public capability, configuration entry, or semantic guard.

### When you can skip `catalog`

You can usually skip `catalog` in the following cases:

- pure `inspect`, where `get` / menu-tree data is already enough to answer the user
- lifecycle APIs such as `createMenu`, `updateMenu`, `createPage`, `moveTab`, or `removeTab`, when the payload does not depend on live capability
- the target is already explicit, and this write is only a small lifecycle change with a fixed shape

### Output and phrasing requirements

- Do not describe "did not read `catalog`" as "capability confirmed".
- If skipping `catalog` means you can only confirm structure, keep the result phrased at the structural level. Do not escalate it to semantic confirmation.

## 5. Popup Shell Fallback Contract

### Terms

- `shell-only popup`: a popup entry whose DSL `completion = "shell-only"`. Only create the opener / popup subtree. Do not add `details`, `editForm`, `submit`, or similar content in this run.
- `completed popup`: a popup entry whose DSL `completion = "completed"`. This run creates the opener and also completes the popup content semantics requested by the user, either through explicit popup blocks or through backend-supported default CRUD popup completion.

### Allowed conditions

`shell-only popup` is only allowed when the user intent is explicitly "create the entry / button / shell / popup shell first", and not "complete the content".

### Forbidden conditions

You must not degrade to `shell-only popup` in the following cases:

- The user asks to "view the current record / edit the current record / this record / this row".
- The user explicitly asks for `details`, `editForm`, `submit`, or record-popup content.
- The scenario semantics are already "complete a usable popup", but the live guard / binding is not satisfied.

In these cases, either complete the popup content the user asked for, or stop and report the guard / capability gap. Do not silently degrade to an empty shell.

### Output and acceptance requirements

- A `shell-only popup` may only be described as "entry / popup shell created". It must not be described as "popup completed".
- The maximum success level for `shell-only popup` is `structural-confirmed`, not `semantic-confirmed`.

## 6. Schema Drift / Recovery Contract

### Trigger signals

Treat the following as schema drift / recovery situations:

- MCP is unreachable or unauthenticated.
- A critical tool is missing.
- The schema is stale.
- The live capability / contract / guard disagrees with local docs.
- A server validation error suggests that the current payload shape drifted away from the live schema.

### Unified handling

- When any of the signals above appears, stop guessing writes.
- This skill does not define an abstract automatic `refresh -> retry` chain.
- This skill does not allow the agent to perform an ad hoc schema refresh without a standardized tool.

### Allowed recovery actions

Only the following recovery suggestions are allowed:

- refresh the current MCP connection
- re-authenticate the current NocoBase MCP
- use `nocobase-mcp-setup`

After the user completes the external recovery, restart from the relevant read path for the current task. If field truth or relation metadata matters, restart from `collections:get(appends=["fields"])`. If the question is current-target field addability, then read `flow_surfaces_catalog({ target, sections: ["fields"] })`. For other structural questions, return to the normal read path for the current task and append `catalog` only when required.

### Explicitly forbidden

- Do not keep writing `refresh/get/catalog/context -> recompute payload -> retry` into the docs.
- Do not describe "abstract refresh" as an executable capability that the current agent already has.
