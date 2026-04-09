# Normative Contract

This page is the single source of truth for `nocobase-ui-builder`. Rules involving blueprint-first page planning, high-level execution entry, `catalog`, popup shell fallback, and schema drift / recovery are defined here exactly once. Other documents only reference them and must not redefine them.

## 1. Precedence

Rule precedence is always:

1. live MCP schema / live `describeSurface` / `get` / `catalog` / `context` / `readback`
2. this `Normative Contract`
3. topic references (`popup` / `settings` / `verification` / `runtime-playbook`, etc.)
4. example payloads / heuristic explanations

If a lower-priority document conflicts with a higher-priority live fact, follow the higher-priority source.

## 2. Blueprint-First Contract

### Default Principles

- High-level page-building requests default to `blueprint-first`.
- `blueprint-first` means: discover real schema facts, produce a `pageBlueprint`, let the user confirm it, and only then enter UI writes.
- Blueprint planning is read-only. Do not call any `flow_surfaces_*` write API before confirmation.
- This contract applies to requests like "build/create/design a page", including business-intent requests such as "build a user management page", unless the user is clearly asking for a low-level patch on an existing surface.

### Allowed Read Surface During Planning

During blueprint planning, the skill may use:

- `desktop_routes_list_accessible(tree=true)` for menu discovery
- `flow_surfaces_describe_surface` when an existing surface needs public-tree / refs / fingerprint facts
- `flow_surfaces_get`, `flow_surfaces_catalog`, `flow_surfaces_context` for live UI capability and target-state inspection
- read-only collection/schema discovery such as `collections:list`, `collections:get`, and `collections/{collectionName}/fields:list`

Do not use collection reads to mutate schema, and do not use schema reads as a substitute for UI writes.

### Data-Bound vs Non-Data Blocks

- Every `data-bound block` in a blueprint must be backed by a real collection / association path / live binding fact.
- `non-data block`s may omit a data source entirely.
- Do not overstate this as "every block must bind a collection". Static or tool-like blocks such as `markdown`, `iframe`, `actionPanel`, or `jsBlock` may stay unbound.
- If a requested field or binding does not exist in live schema facts, stop guessing. Surface the gap in the blueprint or hand off to `nocobase-data-modeling`.

### Confirmation Requirement

- For page-building requests, showing the blueprint is mandatory before writes.
- Only after the user confirms the blueprint may the skill enter `validatePlan` / `executePlan`, or low-level mutation flows such as `createPage`, `compose`, `add*`, `configure`, or `setLayout`.
- If the user confirms only part of the blueprint, only execute the confirmed subset.

## 3. Execution Entry Contract

### Default Principles

- Confirmed structural edits should default to backend planning execution, not hand-written primitive chaining.
- For an existing surface, prefer `describeSurface -> validatePlan -> executePlan`.
- For bootstrap menu/page creation, prefer `validatePlan -> executePlan` without a surface.
- The low-level path `get -> [catalog] -> createPage/compose/add*/configure -> readback` is a fallback, not the default.
- For the action mapping, `compose vs add*` choice, popup compilation rules, and coverage / fallback rules, follow [planning-compiler.md](./planning-compiler.md).

### When High-Level Execution Is the Default

Use backend planning execution by default when any of the following is true:

- you are executing a confirmed `pageBlueprint`
- you are creating a menu/page/tab chain that can be expressed as ordered plan steps
- you are making a structural edit on an existing surface and can describe it as `plan.steps[]`
- you want backend selector resolution, step refs, or fingerprint validation

### When Low-Level Fallback Is Allowed

Use direct primitive APIs only when any of the following is true:

- the required action is not covered by current plan actions
- the task is template search/save/manage rather than structure execution
- the user explicitly asks for low-level control on a concrete target
- the high-level plan path cannot express the change without losing required semantics

### Encapsulation Requirement

- `bindRefs` persistence and declared-ref storage are backend details. Do not surface them as required user-facing parameters or workflow steps.
- Reverse persistence / ref persistence details are backend internals. Do not add them to the caller-facing workflow or parameter checklist.

## 4. Catalog Contract

### Default Principles

- `catalog` is smart by default.
- `catalog` is not globally mandatory.
- When you call `catalog` without explicit `sections`, trust the returned `scenario` and `selectedSections` as the backend-chosen light response.
- Only add `sections` when you need to override the default response shape.
- Only add `expand` when you truly need heavier metadata such as `configureOptions`, contracts, or allowed container uses.
- For an existing surface, default to `get` first. Only append `catalog` when a specific contract requires it.
- For lifecycle APIs, fixed payload shapes, and simple writes that do not depend on live capability, do not mechanically add `catalog` out of habit.

### Smart Response Workflow

- Start with the light response: `catalog({ target })`.
- Only add `expand` when you truly need heavier metadata such as `configureOptions`, contracts, or allowed container uses.
- Only add `sections` when the default `selectedSections` is not enough, or when you intentionally want a narrower response surface.
- Do not mechanically combine `sections + expand` on every call. Let the returned `selectedSections` drive the next step first.

### Scenario Is Response Metadata

- `scenario` is response metadata that explains how the backend interpreted the current target.
- `scenario.surfaceKind` is always the stable top-level surface signal.
- Depending on the target, the response may also include `scenario.popup`, `scenario.fieldContainer`, or `scenario.actionContainer`.
- Do not invent request parameters such as `scenarioMode`, `smartMode`, or `surfaceScenario`. The caller only controls `target`, optional `sections`, and optional `expand`.

### When You Must Read `catalog`

You must read `catalog(target)` first when any of the following is true:

- You need to decide whether the current target truly supports creating a certain block / field / action type.
- You need live `configureOptions` / `settingsContract`.
- You need to inspect popup `resourceBindings`, for example whether `currentRecord` is exposed.
- You need to narrow live capability for JS / chart / association-popup / filterForm multi-target scenarios.
- `get` alone cannot determine the container's public capability, configuration entry, or semantic guard.

### When You Can Skip `catalog`

You can usually skip `catalog` in the following cases:

- Pure `inspect`, where `get` / menu-tree data is already enough to answer the user.
- Lifecycle APIs such as `createMenu`, `updateMenu`, `createPage`, `moveTab`, or `removeTab`, when the payload does not depend on live capability.
- The target is already explicit, and this write is only a small lifecycle change with a fixed shape.

### Output and Phrasing Requirements

- Do not describe "did not read `catalog`" as "capability confirmed".
- If skipping `catalog` means you can only confirm structure, keep the result phrased at the structural level. Do not escalate it to semantic confirmation.

## 5. Popup Shell Fallback Contract

### Terms

- `shell-only popup`: a popup entry whose blueprint `completion = "shell-only"`. Only create the opener / popup subtree. Do not add `details`, `editForm`, `submit`, or similar content in this run.
- `completed popup`: a popup entry whose blueprint `completion = "completed"`. This run creates the opener and also completes the popup content semantics requested by the user, either through explicit popup blocks or through backend-supported default CRUD popup completion.

### Allowed Conditions

`shell-only popup` is only allowed when the user intent is explicitly "create the entry / button / shell / popup shell first", and not "complete the content".

Typical allowed phrasings:

- "Add a popup button first"
- "Create the popup entry first"
- "Build only the shell first; content will be configured later"

### Forbidden Conditions

You must not degrade to `shell-only popup` in the following cases:

- The user asks to "view the current record / edit the current record / this record / this row".
- The user explicitly asks for `details`, `editForm`, `submit`, or record-popup content.
- The scenario semantics are already "complete a usable popup", but the live guard / binding is not satisfied.

In these cases, either complete the popup content the user asked for, or stop and report the guard / capability gap. Do not silently degrade to an empty shell.

### Output and Acceptance Requirements

- A `shell-only popup` may only be described as "entry / popup shell created". It must not be described as "popup completed".
- The maximum success level for `shell-only popup` is `structural-confirmed`, not `semantic-confirmed`.

## 6. Schema Drift / Recovery Contract

### Trigger Signals

Treat the following as schema drift / recovery situations:

- MCP is unreachable or unauthenticated.
- A critical tool is missing.
- The schema is stale.
- The live capability / contract / guard disagrees with local docs.
- A server validation error suggests that the current payload shape drifted away from the live schema.

### Unified Handling

- When any of the signals above appears, stop guessing writes.
- This skill does not define an abstract automatic `refresh -> retry` chain.
- This skill does not allow the agent to perform an ad hoc schema refresh without a standardized tool.

### Allowed Recovery Actions

Only the following recovery suggestions are allowed:

- refresh the current MCP connection
- re-authenticate the current NocoBase MCP
- use `nocobase-mcp-setup`

After the user completes the external recovery, restart from the read path again, usually from `get`, and append `catalog` only if required.

### Explicitly Forbidden

- Do not keep writing `refresh/get/catalog/context -> recompute payload -> retry` into the docs.
- Do not describe "abstract refresh" as an executable capability that the current agent already has.
