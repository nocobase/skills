# Normative Contract

This page defines the global contract for `nocobase-ui-builder`. Other reference files may explain a topic, but they must not contradict this page. Template-selection semantics are defined normatively in [templates.md](./templates.md); this file sets the global precedence, transport, and public write contract around them.

## 0. Canonical Transport

- Agent-facing write path: `nb api flow-surfaces <action>` with the raw business payload.
- Backend transport contract: flow-surfaces is the authoring compiler for raw UI Builder payloads.
- Retained `applyBlueprint`, `flowSurfaces:*`, and backend API docs in this skill remain the backend contract and payload reference.
- `nb-template-decision` remains an optional local planning helper. Do not run skill-local helper output or `cliBody` generation as a write prerequisite.
- Flow Surface write APIs accept the UI Builder raw business payload directly. If a write returns `errors[]`, repair the full list and retry once the payload is coherent.

## 1. Precedence

Rule precedence is always:

1. live backend `nb api flow-surfaces` command behavior and generated CLI behavior
2. live backend `applyBlueprint` / `get` / `describeSurface` / `catalog` / `getReactionMeta` / `context` / low-level flow-surfaces write contracts
3. this `Normative Contract` for global transport, request-shape, and authoring rules
4. [templates.md](./templates.md) for template-selection semantics
5. other topic references (`popup`, `verification`, `runtime-playbook`, etc.)
6. examples and heuristics

If a lower-priority local document conflicts with a live contract fact, follow the live contract. If CLI behavior and backend contract appear to diverge, repair the generated command surface first and do not silently author against stale assumptions.

## 2. Public Structural Write Contract

### Default split

- **Whole-page create** -> `nb api flow-surfaces apply-blueprint` -> simplified **page blueprint** -> backend `applyBlueprint(mode="create")` -> successful response; follow-up `get` only when follow-up localized work or explicit inspection needs live structure.
- **Whole-page replace** -> `nb api flow-surfaces apply-blueprint` -> simplified **page blueprint** -> backend `applyBlueprint(mode="replace")` -> successful response; follow-up `get` only when follow-up localized work or explicit inspection needs live structure.
- **Whole-page interaction / reaction authoring** -> the same page blueprint with top-level `reaction.items[]` -> `nb api flow-surfaces apply-blueprint` -> successful response; follow-up `get` only when follow-up localized work or explicit inspection needs live structure.
- **Localized edit on an existing surface** -> matching `nb api flow-surfaces <action>` write (`compose`, `configure`, `add-block`, `add-blocks`, etc.) -> readback.
- **Localized interaction / reaction edit** -> read `getReactionMeta`, plan against live reaction slots, write through the matching backend action -> readback.

Backend action names are the stable payload families exposed through `nb api flow-surfaces`.

### Whole-page first-write rule

- Whole-page includes whole-page create / replace, one route-backed tab full build, complex multi-block pages, nested-popup pages, and pages with multiple reaction families.
- Pre-write reads and metadata fetch are allowed, but the first mutating write in the whole-page route must be `nb api flow-surfaces apply-blueprint` with the raw business blueprint payload.
- Before one whole-page `applyBlueprint` succeeds, do not use low-level mutating commands such as `createMenu`, `createPage`, `compose`, `configure`, `update-settings`, `add*`, `move*`, `remove*`, or `set*Rules`.
- If a whole-page `applyBlueprint` fails before first success, repair the blueprint from the backend aggregate `errors[]` and retry blueprint-only up to 5 rounds. Do not continue with low-level writes during those pre-success retries. After 5 failed rounds, report the latest blueprint / error evidence.
- After a successful whole-page `applyBlueprint`, localized low-level repair is allowed only for an explicit local/live gap and must stay narrowly scoped.

### What the public page blueprint is

The public `applyBlueprint` payload is:

- JSON only
- one page at a time
- structure-first, with optional top-level `reaction.items[]` for whole-page interaction logic
- centered on `navigation`, `page`, ordered `tabs`, `blocks`, `fields`, `actions`, `recordActions`, inline `popup`, and reusable `assets`
- written with canonical public names such as `collection`, `associationPathName`, `binding`, `field`, `target`, and `popup`
- key-oriented only inside the document itself: layout cells use block `key`, and `field.target` is only a string block key in the same tab/popup scope
- may include top-level `defaults.collections` for collection-level generated-popup defaults: fixed `{ name, description }` `popups.view/addNew/edit` for every involved direct collection, fixed `{ name, description }` `popups.associations.<associationField>.view/addNew/edit` for every involved association scope keyed only by the first relation segment, optional `defaults.collections.<collection>.fieldGroups` only when one of those generated popup scenes still has more than 10 effective fields, target-scoped `defaults.collections.<collection>.formBehavior.addNew/edit` for description-derived settings / field linkage rules on backend-generated add/edit forms, and sibling `defaults.collections.<collection>.formBehaviorDescriptionReview.fields.<field> = { decision, reasonCode? }` for each described generated add/edit candidate field. `implemented` must match real structured coverage; `noUiBehavior` / `unsupported` require a valid `reasonCode`; old `fields[]`, `hasTried`, `formBehavior: {}`, and no-op `null` are rejected. `table` blocks always pull their collection into the `addNew` threshold evaluation
- generated defaults fieldGroups require one compact self-review before finalizing the blueprint: return a short structured verdict (`approve` or `regenerate`) for semantic grouping, required-field coverage, group balance, and group title specificity; use the lowest practical reasoning effort / no-think mode, do not request chain-of-thought, and regenerate at most once
- collection-level `fieldGroups` and `formBehavior` stay keyed only by target collection; relation popup names stay under `popups.associations`, and multiple relation paths to the same target collection reuse one defaults collection entry
- must not include `defaults.blocks`, and must not put `blocks`, `fields`, `fieldGroups`, layout, or other content inside `defaults.collections.*.popups`
- if `reaction.items[]` is present, every reaction target must be a same-run local key / bind key, not a live uid
- for form `fieldValue` / form-scene `fieldLinkage`, target the outer form block key/path, not the inner grid uid
- only explicitly listed reaction items are written; if a slot must exist after `replace`, include it explicitly rather than relying on omission
- `rules: []` clears the targeted reaction slot
- `layout` itself is only allowed on `tabs[]` and inline `popup` documents; do not place `layout` on individual blocks
- `fieldsLayout` is allowed only on `createForm`, `editForm`, `details`, and `filterForm`; it references field keys inside that one block and must place every keyed field exactly once. Omit it by default on `createForm`, `editForm`, and `details` so backend authoring can generate the default grid, including full-width live `richText` / `vditor` fields and `divider` items. `filterForm` keeps the compact three-per-row default layout.
- for `createForm`, `editForm`, and `details`, once a block contains more than 10 real fields, `fieldGroups` is mandatory instead of one flat `fields[]`
- `fieldGroups` is supported only on `createForm`, `editForm`, and `details`; it must not be combined with `fields[]` or `fieldsLayout`, and manual `divider` items do not satisfy the grouping requirement
- when the user asks to add filtering/search to a `table`, `list`, `gridCard`, `calendar`, or `kanban` host, use that host's block-level `filter` action by default; reserve `filterForm` for explicit block/form/query-area intent. For public `applyBlueprint`, `compose`, `add-block`, and `add-blocks` authoring, direct non-template `table` / `list` / `gridCard` / `calendar` / `kanban` blocks may omit `defaultFilter`; backend authoring materializes one from live metadata with up to 4 scalar/filterable fields. Explicit `{}`, `null`, `{ logic: "$and", items: [] }`, invalid operators, relation fields used directly, unknown paths, and filters with fewer fields than the smaller of 3 and the collection's eligible direct interface-field count are rejected through aggregate `errors[]`; use scalar fields or relation child paths such as `department.title`. The `filter` action itself is optional, but `settings.defaultFilter` and `settings.filterableFieldNames` are valid only on filter actions. If `filterableFieldNames` is explicit, check coverage against the effective default filter: action-level/defaultActionSettings `defaultFilter` when present, then block-level `defaultFilter`, otherwise the backend-generated default filter. For every direct public data surface, partial `actions` merge with that host's defaults (`filter` / `refresh` / `addNew`, plus table `bulkDelete`). Ordinary table partial `recordActions` merge with `view` / `edit` / `delete`; tree collection tables with `settings.treeTable=true` do not complete `view` / `edit` / `delete`, and backend injects only default `addChild` when supported.
- direct non-template public `applyBlueprint` `kanban` main blocks may use at most 2 explicit `fields[]` entries. If fields are omitted, prepare materializes at most 2 suitable display fields from live metadata; if more than 2 are explicit, the aggregate rule id is `kanban-main-fields-too-many` and the payload must be fixed rather than trimmed. This limit does not apply to `compose`, `add-block`, or `add-blocks`. For the same applyBlueprint path, missing drag settings default to `settings.dragEnabled=true`; compatible existing sort fields may materialize as `settings.dragSortBy`, otherwise the backend creates a hidden sort field on writable main datasource collections. Explicit `dragEnabled=false` opts out, and explicit incompatible `dragSortBy` is rejected.
- when multiple non-filter blocks share one tab or popup, explicit layout is required and each non-template-backed data block needs a `title` there; template-backed blocks are exempt; a scope with only one non-filter block may omit the block `title` unless the user explicitly asks for one
- if `layout` is present, it must be an object
- in `create`, any newly created `navigation.group` and any top-level or second-level `navigation.item` must include one valid semantic Ant Design icon
- when one tab or popup contains multiple non-filter blocks, explicit `layout` is required instead of relying on default top-to-bottom stacking
- explicit `layout` may reference only real block keys, and every keyed block in that tab/popup must be placed by the layout
- if a `filterForm` contains 4 or more fields, its actions must include `collapse`
- generic `form` is not a public applyBlueprint block type; use `editForm` or `createForm`
- custom `edit` popups that provide `popup.blocks` must contain exactly one `editForm` block; that `editForm` may omit `resource` and inherit the opener's current-record context
- for normal single-page requests, default to exactly one real tab; do not carry empty / placeholder tabs in the draft
- do not add placeholder content such as `Summary` / `Later` / `备用` tabs or explanatory `markdown` / note / banner blocks unless the user explicitly asked for them
- field entries default to simple string field names; use a field object only when `popup`, `target`, `renderer`, field-specific `type`, or clear form behavior inferred from live field `description` is required
- when the intent is "click the shown record / relation record to open details", the canonical page-blueprint authoring is a field-level inline `popup`; backend / readback may normalize this to clickable-field / `clickToOpen` semantics. Use an action / recordAction only when the request explicitly asks for a button or action column.

### nb body rule

For actual execution in this skill, `nb api flow-surfaces <action>` is the public write entry and the bullets below describe the raw backend body shape:

- read commands may use top-level locator flags instead of JSON bodies
- most other body-based `flow-surfaces` commands expect the raw business object through CLI `--body` / `--body-file`
- do **not** stringify the JSON document
- do **not** wrap it again as `{ values: payload }`
- do **not** create helper-envelope fields such as `blueprint`, `templateDecision`, `collectionMetadata`, or `cliBody` as write prerequisites

Important exception:

- read helpers use top-level locator flags derived from `pageSchemaUid` / `routeId` / `tabSchemaUid` / `uid`
- for actual invocation templates, treat [tool-shapes.md](./tool-shapes.md) as the primary cookbook; `page-blueprint.md` focuses on the inner page document, not command flags

Correct nb body:

```json
{
  "version": "1",
  "mode": "create",
  "navigation": {
    "group": { "routeId": 12 },
    "item": { "title": "Employees", "icon": "TeamOutlined" }
  },
  "page": { "title": "Employees" },
  "tabs": [
    {
      "title": "Overview",
      "blocks": [
        {
          "type": "table",
          "collection": "employees",
          "fields": ["nickname"],
          "actions": ["filter"]
        }
      ]
    }
  ]
}
```

Wrong nb body:

```json
{
  "blueprint": "{\"version\":\"1\",\"mode\":\"create\"}"
}
```

Also wrong:

```json
{
  "blueprint": {
    "values": {
      "version": "1",
      "mode": "create"
    }
  }
}
```

## 2.1 Error-first recovery rules

If a tool returns one of these patterns, fix the tool call shape first:

- `params/body must be object` or equivalent JSON-body errors
  - usually means the nb body was omitted, stringified, or wrapped incorrectly
- `params/body must match exactly one schema in oneOf`
  - when it appears on `applyBlueprint`, first suspect the nb body shape before changing the inner page design
- `flowSurfaces uid 'root' not found`
  - usually means the skill invented `"root"` as `target.uid` / `locator.uid`
  - do not use the literal `"root"` as a flow-surfaces uid
  - first read live structure with `get` / `describeSurface` and reuse a real uid, or pick a page-level API that does not require such a uid

Do not start by changing the inner blueprint shape until the nb request body or targeting shape is confirmed correct.

Canonical resource rule:

- block-level shorthand uses `collection`, `binding`, and `associationPathName`
- nested `block.resource` uses `collectionName`, `binding`, and `associationPathName`
- block-level shorthand and nested `resource` are mutually exclusive on the same block
- for popup relation tables that show records from the current record's relation, prefer the canonical semantic shape `resource.binding = "associatedRecords"` + `resource.associationField = "<relationField>"` (for example `roles`)
- `applyBlueprint` may normalize `currentRecord | associatedRecords + associationPathName` into that canonical associated-records shape for convenience, but only when `associationPathName` is a single relation field name; the skill should author the canonical shape directly
- on record-capable blocks (`table`, `details`, `list`, `gridCard`), author `view` / `edit` / `updateRecord` / `delete` under `recordActions`; `applyBlueprint` may auto-promote common record actions written under `actions`. Ordinary direct table partial `recordActions` are completed with `view` / `edit` / `delete`; tree table `recordActions` are not completed and should be omitted unless the user explicitly asks for a row action.
- bind workflows to form submit / record `updateRecord` buttons with public `settings.triggerWorkflows` or `configure.changes.triggerWorkflows`; `[]` clears, `null` is invalid, and raw `flowModels` / internal `stepParams` are not authoring surfaces

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
- before the first `applyBlueprint`, the skill-side authoring gate is: tabs count matches the request, every `tab.blocks` is non-empty, there is no empty / placeholder tab, there is no placeholder `markdown` / note / banner block, no block object contains `layout`, every `tab.layout` / `popup.layout` is an object when present, block `key` values are unique, every chosen field in blueprint `fields[]` has a non-empty live `interface`, explicit tree table `fields[]` is self-contained with a direct readable non-association first field or another existing readable field that can be moved first, omitted tree table `fields[]` uses default metadata priority `titleField` / `name` / `code` / `title`, direct non-template kanban main block `fields[]` has no more than 2 entries, every field entry stays a simple string unless `popup` / `target` / `renderer` / field-specific `type` / description-derived form behavior is actually required, and every custom `edit` popup contains exactly one `editForm`
- if the current page has `enableTabs = false` and the new blueprint contains multiple tabs, `page.enableTabs: true` must be set explicitly
- tab / block keys are optional in normal authoring; only add them when custom layout or in-document cross references need a stable local identifier
- layout cells are only block key strings or `{ key, span }`
- `fieldsLayout` cells use the same public shape, but only inside field-grid blocks and only for field keys from that one block
- `layout` is only allowed on `tabs[]` and inline `popup` documents, never on individual blocks
- if layout is omitted, the server auto-generates a simple top-to-bottom layout
- skill-side authoring may omit layout only for scopes with at most one non-filter block; otherwise the draft must decide layout before write
- in `create`, if an existing menu group is already known, prefer `navigation.group.routeId`; when only `navigation.group.title` is given, applyBlueprint reuses one unique same-title group, creates a new group if none exists, and rejects ambiguous multi-match titles
- at the skill-authoring layer, if visible same-title menu groups already exist and title lookup would hit multiple groups, do **not** create another same-title group for disambiguation and do **not** choose one locally; require explicit `routeId` before write
- page identity for duplicate-page prevention is `(navigation.group.routeId, page.title)`, after resolving unique group title to routeId. In `create`, same group + same page title may be prepared as `replace` with `target.pageSchemaUid`; different group + same page title does not merge, reuse, or auto-replace another page.
- `navigation.group.routeId` has highest priority and ignores `title`, `icon`, `tooltip`, and `hideInMenu`; title-based reuse also ignores `icon`, `tooltip`, and `hideInMenu` when an existing group is reused; if an existing group's metadata must change, use low-level `updateMenu` instead of applyBlueprint create

Use the resolved page `target` from the public response as the carry-forward locator. A successful `apply-blueprint` response is the default stop point. Run follow-up `get` only when follow-up localized work or explicit inspection needs live structure.

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

- `nb api resource list --resource 'desktopRoutes:listAccessible' --no-paginate -j` for visible menu discovery; if unavailable, fall back to `nb api resource list --resource desktopRoutes --no-paginate -j --sort sort` and treat it as non-role-filtered
- `flow-surfaces get` for normal structural inspection and post-write readback
- `flow-surfaces describe_surface` when a richer public tree snapshot helps analyze an existing surface
- `flow-surfaces catalog` when current-target capability is the question
- `flow-surfaces get_reaction_meta` when field values, linkage, computed state, or reaction capabilities are the question
- `flow-surfaces context` when popup/context variables or lower-level raw variable paths are the question
- nb-first collection metadata reads:
  - `nb api data-modeling collections list -j` to narrow candidate collections
  - `nb api data-modeling collections get --filter-by-tk <collection> --appends fields -j` as the default field truth
  - `nb api resource list --resource collections --filter '{"name":"<collection>"}' --appends fields -j` when the `data-modeling collections` command family is unavailable
  - `nb api data-modeling collections fields list --collection-name <collection> --filter '{"name":"<field>"}' -j` only for known single-field follow-up when extra detail is still needed

### Field/schema fact priority

When field truth matters:

1. `nb api data-modeling collections list -j` narrows candidates only
2. `nb api data-modeling collections get --filter-by-tk <collection> --appends fields -j` is the default truth for scalar fields, relation fields, interface, and association metadata; if that command family is unavailable, use `nb api resource list --resource collections --filter '{"name":"<collection>"}' --appends fields -j`
3. Do **not** use `nb api data-modeling collections fields list` / `data-modeling fields list` for page authoring; treat them as compact browse views, not as authoring truth
4. Known single-field follow-up may use `nb api data-modeling collections fields list --collection-name <collection> --filter '{"name":"<field>"}' -j`
5. `catalog({ target, sections: ["fields"] })` answers whether the current target can add/use that field now

Field addability rule:

- A field is authorable into page-blueprint `fields[]` only if the live collection metadata truth above shows a non-empty `interface` for that field.
- If a field exists but `interface` is empty / null there, do **not** author it into any `details` / `table` / `editForm` / `createForm` / nested-popup block `fields[]`.
- If a field only needs normal display/edit behavior, keep it as a simple string entry in blueprint `fields[]`; only upgrade it to an object when a documented public field behavior is needed, including clear form settings inferred from live field `description`.
- Description-derived conditional reactions require a condition field present in that same form and a clear state/behavior extracted by the agent/LLM or conservative runtime fallback. For arbitrary-language descriptions, prefer structured metadata `descriptionBehavior.{settings,linkage}` over language-specific keyword rules. Map condition values through live option `value` / localized `label` metadata when available. For explicit local `popup.blocks`, target the stable local form block through top-level `reaction.items[]`; prepare may materialize generated local keys only when a derived reaction needs them. For backend-generated add/edit popups, put the rules in target-scoped `defaults.collections.<collection>.formBehavior.addNew/edit.fieldLinkageRules` so the backend binds them to the generated form; if extraction leaves described generated candidates uncovered, add per-field `formBehaviorDescriptionReview.fields.<field>` objects with `decision: "noUiBehavior"` or `"unsupported"` plus a valid `reasonCode` instead of using old `fields[]`, `hasTried`, `formBehavior: {}`, or no-op `null`. Keep ambiguous descriptions as helper/settings rather than inferring template-only or cross-form behavior, and do not rely on a NocoBase backend raw-description parser.
- Schema existence alone is not enough for UI authoring. Example: a field like `roles.description` may exist in collection metadata, but if its `interface` is `null`, the skill must omit it instead of attempting `addField` / `applyBlueprint` authoring.
- Only override this rule when another live read proves a supported UI path for that exact field and target.

Do not use UI-builder skill docs to invent missing schema. If the requested fields/relations do not exist, hand off to `nocobase-data-modeling`.

## 4. Backend Write + Confirmation Threshold

For any whole-page `applyBlueprint` authoring run, the first mutating write must go through `nb api flow-surfaces apply-blueprint` with the raw business payload. If a write returns `errors[]`, repair the full list and retry once the payload is coherent. Local helpers are optional planning aids.

Stop for confirmation before the write when any of the following is true:

- the request is ambiguous
- the request is destructive or high-impact
- `replace` would rebuild a page whose blast radius needs review
- data source / popup / tab structure still depends on assumptions
- the user explicitly asks to review the structure first

Direct execution is allowed only when all are true:

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
- Any JS write goes through `nb api flow-surfaces <action>` with the raw payload. If the response returns `errors[]`, repair the listed issues and retry.

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
