# Normative Contract

This page is the single source of truth for `nocobase-ui-builder`. Other reference files may explain a topic, but they must not contradict this page.

## 1. Precedence

Rule precedence is always:

1. live MCP schema / live `executeDsl` / `get` / `describeSurface` / `catalog` / `context` / low-level `flow_surfaces_*` write contracts
2. this `Normative Contract`
3. topic references (`popup`, `verification`, `runtime-playbook`, etc.)
4. examples and heuristics

If a lower-priority local document conflicts with a live tool/schema fact, follow the live contract.

## 2. Public Structural Write Contract

### Default split

- **Whole-page create** -> simplified **page DSL** -> `executeDsl(mode="create")` -> readback.
- **Whole-page replace** -> simplified **page DSL** -> `executeDsl(mode="replace")` -> readback.
- **Localized edit on an existing surface** -> low-level APIs directly (`compose`, `configure`, `add*`, `move*`, `remove*`, `updateMenu`, `createPage`, etc.) -> readback.

### What the public page DSL is

The public `executeDsl` payload is:

- JSON only
- one page at a time
- structure-only
- centered on `navigation`, `page`, ordered `tabs`, `blocks`, `fields`, `actions`, `recordActions`, inline `popup`, and reusable `assets`
- written with canonical public names such as `collection`, `associationPathName`, `binding`, `field`, `target`, and `popup`
- key-oriented only inside the document itself: layout cells use block `key`, and `field.target` is only a string block key in the same tab/popup scope

Canonical resource rule:

- block-level shorthand uses `collection`, `binding`, and `associationPathName`
- nested `block.resource` uses `collectionName`, `binding`, and `associationPathName`
- block-level shorthand and nested `resource` are mutually exclusive on the same block

It is **not** a plan API and must not expose:

- `kind`, `target.mode`, or patch-style change lists
- plan preview / compiled steps / execution internals
- workflow-ish control fields
- `ref` / `$ref`
- object-style `field.target` selectors
- layout-cell `uid`
- deprecated executeDsl aliases such as block `collectionName` / `association` / `resourceBinding` and field `fieldPath` / `openView` / `targetBlock`
- deprecated nested-resource aliases such as `resource.collection` / `resource.association` / `resource.resourceBinding`

For `replace` runs:

- `target.pageSchemaUid` is required
- omitted page-level fields are left unchanged
- DSL tabs map to existing route-backed tab slots by index; each slot is rewritten in order, trailing old tabs are removed, and extra new tabs are appended
- if the current page has `enableTabs = false` and the new DSL contains multiple tabs, `page.enableTabs: true` must be set explicitly
- tab / block keys are optional in normal authoring; only add them when custom layout or in-document cross references need a stable local identifier
- layout cells are only block key strings or `{ key, span }`
- if layout is omitted, the server auto-generates a simple top-to-bottom layout

The public response returns only the resolved page `target` and final `surface` readback.

### Scope boundary

Use `executeDsl` only when the user is really describing one page as a whole. Do not use it for:

- add one block to an existing page
- rename one tab
- move one node
- delete one popup tab
- tweak one field/action setting

Those are low-level edit paths.

## 3. Read Facts Contract

### Allowed read sources

The skill may use:

- `desktop_routes_list_accessible(tree=true)` for visible menu discovery
- `flow_surfaces_get` for normal structural inspection and post-write readback
- `flow_surfaces_describe_surface` when a richer public tree snapshot helps analyze an existing surface
- `flow_surfaces_catalog` when current-target capability is the question
- `flow_surfaces_context` when popup/context variables are the question
- `collections:list` to narrow candidate collections
- `collections:get(appends=["fields"])` as the default field truth

### Field/schema fact priority

When field truth matters:

1. `collections:list` narrows candidates only
2. `collections:get(appends=["fields"])` is the default truth for scalar fields, relation fields, interface, and association metadata
3. `catalog({ target, sections: ["fields"] })` answers whether the current target can add/use that field now

Do not use UI-builder skill docs to invent missing schema. If the requested fields/relations do not exist, hand off to `nocobase-data-modeling`.

## 4. Confirmation Threshold

Show a draft first and stop for confirmation when any of the following is true:

- the request is ambiguous
- the request is destructive or high-impact
- `replace` would rebuild a page whose blast radius needs review
- data source / popup / tab structure still depends on assumptions
- the user explicitly asks to review the structure first

Direct execution is allowed only when all are true:

- the target is unique
- the structure is clear enough to serialize into one page DSL or one localized low-level write plan
- required collections/fields/bindings are backed by live facts
- the write will not guess hidden semantics

## 5. Low-level Fallback Contract

Low-level APIs are **not** a fallback from `executeDsl` because of complexity. They are the **default** for localized edits.

Use low-level APIs when:

- the user asks for a localized edit on an existing page/tab/popup/node
- the write is lifecycle-specific (`createMenu`, `updateMenu`, `moveTab`, `removeTab`, etc.)
- the public page DSL cannot express the task because the task is not a whole-page create/replace request

Do **not** emulate a plan-style patch workflow in user-facing authoring.

## 6. Popup / Catalog / JS Global Rules

- Nested popups are allowed in page DSL, but only as inline popup content beneath actions or fields.
- When popup resource bindings, target-specific field addability, or JS/chart capability matters, read `catalog` before writing.
- Any JS write must pass the local validator gate first.

## 7. Recovery / Stop Conditions

Stop instead of guessing when:

- MCP is unreachable or unauthenticated
- the live schema/tool surface is missing a required action
- the target is not unique
- schema facts are missing for required fields/relations/bindings
- the requested change crosses out of Modern page (v2) scope
