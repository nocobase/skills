# Normative Contract

This page is the single source of truth for `nocobase-ui-builder`. Rules involving `catalog`, popup shell fallback, and schema drift / recovery are defined here exactly once. Other documents only reference them and must not redefine them.

## 1. Precedence

Rule precedence is always:

1. live MCP schema / live `get` / `catalog` / `context` / `readback`
2. this `Normative Contract`
3. topic references (`popup` / `settings` / `verification` / `runtime-playbook`, etc.)
4. example payloads / heuristic explanations

If a lower-priority document conflicts with a higher-priority live fact, follow the higher-priority source.

## 2. Catalog Contract

### Default Principles

- `catalog` is not globally mandatory.
- For an existing surface, default to `get` first. Only append `catalog` when a specific contract requires it.
- For lifecycle APIs, fixed payload shapes, and simple writes that do not depend on live capability, do not mechanically add `catalog` out of habit.

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

## 3. Popup Shell Fallback Contract

### Terms

- `shell-only popup`: only create the opener / popup subtree. Do not add `details`, `editForm`, `submit`, or similar content in this run.
- `completed popup`: this run creates the opener and also completes the popup content semantics requested by the user.

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

## 4. Schema Drift / Recovery Contract

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
