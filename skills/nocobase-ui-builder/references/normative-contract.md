# Normative Contract

This page is the single source of truth for `nocobase-ui-builder`. Other reference files may explain a topic, but they must not contradict this page.

## 0. Canonical Transport

- Canonical front door: `nocobase-ctl flow-surfaces`
- Retained `applyBlueprint`, `flowSurfaces:*`, and MCP tool docs in this skill remain the backend contract, payload reference, and fallback map.
- `nb-page-preview` and `nb-runjs` remain local helper CLIs only.

## 1. Precedence

Rule precedence is always:

1. live `nocobase-ctl flow-surfaces --help` / live generated CLI behavior
2. live backend `applyBlueprint` / `get` / `describeSurface` / `catalog` / `getReactionMeta` / `context` / low-level `flow_surfaces_*` write contracts
3. this `Normative Contract`
4. topic references (`popup`, `verification`, `runtime-playbook`, etc.)
5. examples and heuristics

If a lower-priority local document conflicts with a live contract fact, follow the live contract. If CLI behavior and backend contract appear to diverge, repair the CLI/runtime generation path first and do not silently author against stale assumptions.

## 2. Public Structural Write Contract

### Default split

- **Whole-page create** -> `nocobase-ctl flow-surfaces apply-blueprint` -> simplified **page blueprint** -> backend `applyBlueprint(mode="create")` -> readback.
- **Whole-page replace** -> `nocobase-ctl flow-surfaces apply-blueprint` -> simplified **page blueprint** -> backend `applyBlueprint(mode="replace")` -> readback.
- **Whole-page interaction / reaction authoring** -> the same page blueprint with top-level `reaction.items[]` -> `nocobase-ctl flow-surfaces apply-blueprint` -> readback.
- **Localized edit on an existing surface** -> matching `nocobase-ctl flow-surfaces ...` command -> low-level APIs (`compose`, `configure`, `add*`, `move*`, `remove*`, `updateMenu`, `createPage`, etc.) -> readback.
- **Localized interaction / reaction edit** -> `nocobase-ctl flow-surfaces get-reaction-meta` -> matching `set*Rules` -> readback.

This file keeps backend action names because they are still the stable payload families and fallback names.

### What the public page blueprint is

The public `applyBlueprint` payload is:

- JSON only
- one page at a time
- structure-first, with optional top-level `reaction.items[]` for whole-page interaction logic
- centered on `navigation`, `page`, ordered `tabs`, `blocks`, `fields`, `actions`, `recordActions`, inline `popup`, and reusable `assets`
- written with canonical public names such as `collection`, `associationPathName`, `binding`, `field`, `target`, and `popup`
- key-oriented only inside the document itself: layout cells use block `key`, and `field.target` is only a string block key in the same tab/popup scope
- if `reaction.items[]` is present, every reaction target must be a same-run local key / bind key, not a live uid
- for form `fieldValue` / form-scene `fieldLinkage`, target the outer form block key/path, not the inner grid uid
- only explicitly listed reaction items are written; if a slot must exist after `replace`, include it explicitly rather than relying on omission
- `rules: []` clears the targeted reaction slot
- `layout` itself is only allowed on `tabs[]` and inline `popup` documents; do not place `layout` on individual blocks
- if `layout` is present, it must be an object; when layout is still uncertain, omit it instead of guessing
- generic `form` is not a public applyBlueprint block type; use `editForm` or `createForm`
- custom `edit` popups that provide `popup.blocks` must contain exactly one `editForm` block; that `editForm` may omit `resource` and inherit the opener's current-record context
- for normal single-page requests, default to exactly one real tab; do not carry empty / placeholder tabs in the draft
- do not add placeholder content such as `Summary` / `Later` / `备用` tabs or explanatory `markdown` / note / banner blocks unless the user explicitly asked for them
- field entries default to simple string field names; use a field object only when `popup`, `target`, `renderer`, or field-specific `type` is required
- when the intent is "click the shown record / relation record to open details", the canonical page-blueprint authoring is a field-level inline `popup`; backend / readback may normalize this to clickable-field / `clickToOpen` semantics. Use an action / recordAction only when the request explicitly asks for a button or action column.

### CLI request-body rule and MCP fallback map

For actual execution in this skill:

- `nocobase-ctl flow-surfaces get` is the common exception: it uses top-level locator flags and no JSON body
- most other body-based `flow-surfaces` commands expect the raw business object through CLI `--body` / `--body-file`
- only in MCP fallback should that same business object be wrapped under `requestBody`
- do **not** stringify the JSON document
- do **not** wrap it again as `{ values: payload }`
- do **not** leak tool-envelope fields such as `requestBody` into the inner page blueprint

Important exception:

- `flow_surfaces_get` uses top-level locator fields directly (`pageSchemaUid` / `routeId` / `tabSchemaUid` / `uid`)
- most other `flow_surfaces_*` fallback tools in this skill path use `requestBody`
- for actual invocation templates, treat [tool-shapes.md](./tool-shapes.md) as the primary cookbook; `page-blueprint.md` focuses on the inner page document, not the CLI body/fallback envelope mapping

Correct CLI body:

```json
{
  "version": "1",
  "mode": "create",
  "navigation": {
    "group": { "routeId": 12 },
    "item": { "title": "Employees" }
  },
  "page": { "title": "Employees" },
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        { "type": "table", "collection": "employees", "fields": ["nickname"] }
      ]
    }
  ]
}
```

Correct MCP fallback envelope:

```json
{
  "requestBody": {
    "version": "1",
    "mode": "create",
    "navigation": {
      "group": { "routeId": 12 },
      "item": { "title": "Employees" }
    },
    "page": { "title": "Employees" },
    "tabs": [
      {
        "title": "Overview",
        "blocks": [
          { "type": "table", "collection": "employees", "fields": ["nickname"] }
        ]
      }
    ]
  }
}
```

Wrong:

```json
{
  "requestBody": "{\"version\":\"1\",\"mode\":\"create\"}"
}
```

Also wrong:

```json
{
  "requestBody": {
    "values": {
      "version": "1",
      "mode": "create"
    }
  }
}
```

For fallback requestBody-based tools such as `describeSurface`, `catalog`, `context`, `applyBlueprint`, `compose`, `configure`, `add*`, `move*`, and `remove*`, do not send the inner business payload directly at the top level.

## 2.1 Error-first recovery rules

If a tool returns one of these patterns, fix the tool call shape first:

- `params/requestBody must be object`
  - usually means `requestBody` was omitted, stringified, or otherwise not sent as an object
- `params/requestBody must match exactly one schema in oneOf`
  - when it appears together with the previous error on `applyBlueprint`, first suspect the outer `requestBody` envelope, not the inner blueprint
- `flowSurfaces uid 'root' not found`
  - usually means the skill invented `"root"` as `target.uid` / `locator.uid`
  - do not use the literal `"root"` as a flow-surfaces uid
  - first read live structure with `get` / `describeSurface` and reuse a real uid, or pick a page-level API that does not require such a uid

Do not start by changing the inner blueprint shape until the CLI request body, or the fallback envelope / targeting shape, is confirmed correct.

Canonical resource rule:

- block-level shorthand uses `collection`, `binding`, and `associationPathName`
- nested `block.resource` uses `collectionName`, `binding`, and `associationPathName`
- block-level shorthand and nested `resource` are mutually exclusive on the same block
- for popup relation tables that show records from the current record's relation, prefer the canonical semantic shape `resource.binding = "associatedRecords"` + `resource.associationField = "<relationField>"` (for example `roles`)
- `applyBlueprint` may normalize `currentRecord | associatedRecords + associationPathName` into that canonical associated-records shape for convenience, but only when `associationPathName` is a single relation field name; the skill should author the canonical shape directly
- on record-capable blocks (`table`, `details`, `list`, `gridCard`), author `view` / `edit` / `updateRecord` / `delete` under `recordActions`; `applyBlueprint` may auto-promote common record actions written under `actions`, but the skill should still use `recordActions` canonically

It is **not** a plan API and must not expose:

- `kind`, `target.mode`, or patch-style change lists
- plan preview / compiled steps / execution internals
- workflow-ish control fields
- `ref` / `$ref`
- object-style `field.target` selectors
- layout-cell `uid`
- deprecated applyBlueprint aliases such as block `collectionName` / `association` / `resourceBinding` and field `fieldPath` / `openView` / `targetBlock`
- deprecated nested-resource aliases such as `resource.collection` / `resource.association` / `resource.resourceBinding`

For `replace` runs:

- `target.pageSchemaUid` is required
- omitted page-level fields are left unchanged
- blueprint tabs map to existing route-backed tab slots by index; each slot is rewritten in order, trailing old tabs are removed, and extra new tabs are appended
- before the first `applyBlueprint`, the skill-side authoring gate is: tabs count matches the request, every `tab.blocks` is non-empty, there is no empty / placeholder tab, there is no placeholder `markdown` / note / banner block, no block object contains `layout`, every `tab.layout` / `popup.layout` is an object when present, block `key` values are unique, every chosen field in blueprint `fields[]` has a non-empty live `interface`, every field entry stays a simple string unless `popup` / `target` / `renderer` / field-specific `type` is actually required, and every custom `edit` popup contains exactly one `editForm`
- if the current page has `enableTabs = false` and the new blueprint contains multiple tabs, `page.enableTabs: true` must be set explicitly
- tab / block keys are optional in normal authoring; only add them when custom layout or in-document cross references need a stable local identifier
- layout cells are only block key strings or `{ key, span }`
- `layout` is only allowed on `tabs[]` and inline `popup` documents, never on individual blocks
- if layout is omitted, the server auto-generates a simple top-to-bottom layout
- in `create`, if an existing menu group is already known, prefer `navigation.group.routeId`; when only `navigation.group.title` is given, applyBlueprint reuses one unique same-title group, creates a new group if none exists, and rejects ambiguous multi-match titles
- at the skill-authoring layer, if one or more visible same-title menu groups already exist, do **not** create another same-title group for disambiguation; prefer the exact known `routeId`, otherwise reuse one existing group deterministically from the live menu tree and disclose that chosen routeId in the prewrite preview
- `navigation.group.routeId` is exact targeting only and must not be mixed with `icon`, `tooltip`, or `hideInMenu`
- same-title reuse is title-only; if an existing group's metadata must change, use low-level `updateMenu` instead of applyBlueprint create

The public response returns only the resolved page `target` and final `surface` readback.

### Scope boundary

Use `applyBlueprint` only when the user is really describing one page as a whole. Do not use it for:

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
- `flow_surfaces_get_reaction_meta` when field values, linkage, computed state, or reaction capabilities are the question
- `flow_surfaces_context` when popup/context variables or lower-level raw variable paths are the question
- `collections:list` to narrow candidate collections
- `collections:get(appends=["fields"])` as the default field truth
- `collections.fields:get` only for known single-field follow-up when extra detail is still needed

### Field/schema fact priority

When field truth matters:

1. `collections:list` narrows candidates only
2. `collections:get(appends=["fields"])` is the default truth for scalar fields, relation fields, interface, and association metadata; it is the only default field truth for UI authoring
3. Do **not** use `collections.fields:list` for page authoring; treat it as a compact browse view, not as authoring truth
4. `collections.fields:get` is optional follow-up only when the field name is already known and one field still needs confirmation
5. `catalog({ target, sections: ["fields"] })` answers whether the current target can add/use that field now

Field addability rule:

- A field is authorable into page-blueprint `fields[]` only if `collections:get(appends=["fields"])` shows a non-empty `interface` for that field.
- If a field exists but `interface` is empty / null there, do **not** author it into any `details` / `table` / `editForm` / `createForm` / nested-popup block `fields[]`.
- If a field only needs normal display/edit behavior, keep it as a simple string entry in blueprint `fields[]`; only upgrade it to an object when a documented public field behavior is needed.
- Schema existence alone is not enough for UI authoring. Example: a field like `roles.description` may exist in collection metadata, but if its `interface` is `null`, the skill must omit it instead of attempting `addField` / `applyBlueprint` authoring.
- Only override this rule when another live read proves a supported UI path for that exact field and target.

Do not use UI-builder skill docs to invent missing schema. If the requested fields/relations do not exist, hand off to `nocobase-data-modeling`.

## 4. Prewrite Preview + Confirmation Threshold

For any whole-page `applyBlueprint` authoring run, show one ASCII-first preview from the same blueprint before the first write. This preview is mandatory even when execution continues immediately afterward.

Stop after that preview for confirmation when any of the following is true:

- the request is ambiguous
- the request is destructive or high-impact
- `replace` would rebuild a page whose blast radius needs review
- data source / popup / tab structure still depends on assumptions
- the user explicitly asks to review the structure first

Direct execution after the preview is allowed only when all are true:

- the target is unique
- the structure is clear enough to serialize into one page blueprint or one localized low-level write plan
- required collections/fields/bindings are backed by live facts
- the write will not guess hidden semantics

## 5. Low-level Fallback Contract

Low-level APIs are **not** a fallback from `applyBlueprint` because of complexity. They are the **default** for localized edits.

Use low-level APIs when:

- the user asks for a localized edit on an existing page/tab/popup/node
- the write is lifecycle-specific (`createMenu`, `updateMenu`, `moveTab`, `removeTab`, etc.)
- the public page blueprint cannot express the task because the task is not a whole-page create/replace request

Do **not** emulate a plan-style patch workflow in user-facing authoring.

## 6. Popup / Catalog / JS Global Rules

- Nested popups are allowed in page blueprint, but only as inline popup content beneath actions or fields.
- When popup resource bindings, target-specific field addability, or JS/chart capability matters, read `catalog` before writing.
- Any JS write must pass the local validator gate first.

## 7. Recovery / Stop Conditions

Stop instead of guessing when:

- the chosen transport is unreachable or unauthenticated
- the live schema/tool surface is missing a required action
- the target is not unique
- schema facts are missing for required fields/relations/bindings
- the requested change crosses out of Modern page (v2) scope

## 8. Safety Rule for Testing / Multi-agent Runs

- Never delete or clean unrelated pages, menus, routes, or records as part of a UI-building task unless the user explicitly asked for destructive cleanup.
- In multi-agent or repeated test runs, prefer isolated target groups / pages instead of "clean slate" deletion.
