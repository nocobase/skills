---
name: nocobase-ui-builder
description: >-
  **DEFAULT entry point for any NocoBase UI authoring or tweak** — new
  pages, new blocks, new menu items, AND localized edits (move / reorder /
  reconfigure a single block, field, action, or reaction rule) on an
  already-running NocoBase app. Goes through `nocobase-ctl flow-surfaces`
  against the live app; no DSL file commit required.

  Only hand off to `nocobase-dsl-reconciler` when the user **explicitly
  asks for** DSL / YAML / committed-to-git / `cli push` workflow (e.g. "use
  the DSL reconciler", "I want YAML files", "commit the spec"). The DSL
  reconciler is in active development and has rough edges; prefer this
  skill unless the user opts in.

  Does not handle ACL, data modeling, workflow orchestration, browser
  reproduction, page error postmortems, or non-Modern-page navigation.
---

# Goal

- Canonical transport is `nocobase-ctl flow-surfaces`.
- Prefer CLI first. Fall back to MCP only when the CLI is unavailable after env/runtime repair.
- Keep routing intent-first: open one matching quick-route doc first, not the whole directory.
- When a quick route already matches, stay on it. Do not enumerate the skill directory just to rediscover docs.
- When the task is a partial-match or handoff-only request, answer from this skill's scope boundary directly. Do not inspect runtime, scripts, or helper docs just to justify the handoff.
- Treat one user request that spans several pages as ordered single-page runs.

# Router

- whole-page authoring goes through `applyBlueprint`, `nocobase-ctl flow-surfaces apply-blueprint`, and [whole-page-quick.md](./references/whole-page-quick.md)
- localized existing-surface edits go through low-level `flow-surfaces` and [local-edit-quick.md](./references/local-edit-quick.md)
- reaction work starts with `get-reaction-meta`, `nocobase-ctl flow-surfaces get-reaction-meta`, writes through `set*Rules`, and [reaction-quick.md](./references/reaction-quick.md)
- partial-match or boundary-only requests go through [boundary-quick.md](./references/boundary-quick.md) first
- After that route is clear, if template / reference / `copy` routing is truly in scope, read [template-quick.md](./references/template-quick.md) first and then [templates.md](./references/templates.md) for the full decision matrix.
- Do not open [tool-shapes.md](./references/tool-shapes.md) or [helper-contracts.md](./references/helper-contracts.md) until you are preparing a real CLI body, running the `prepare-write` gate, or validating a prepared write body.
- If the task involves JS `code`, `renderer: "js"`, `jsBlock`, `jsColumn`, `jsItem`, JS actions, charts, or `ctx.*` API questions, read [js.md](./references/js.md) first, then [js-surfaces/index.md](./references/js-surfaces/index.md), then [js-snippets/index.md](./references/js-snippets/index.md), and only then [js-reference-index.md](./references/js-reference-index.md).
- Before using a `flow-surfaces` subcommand you have not used yet in the current task, run `nocobase-ctl flow-surfaces --help` or `nocobase-ctl flow-surfaces <subcommand> --help`.

# Hard Rules

1. For CLI writes, pass the business object itself as the raw JSON body. After whole-page `prepare-write`, that business object is `result.cliBody`, not the original draft blueprint. Only in MCP fallback should that same object be wrapped under `requestBody`, and it must stay an object.
2. For a normal single-page request, default to exactly one real tab. Do not add empty tabs or placeholder `markdown` / note / banner blocks unless the user asked for them.
3. Default blueprint `fields[]` entries to simple strings. Upgrade a field entry to an object only when `popup`, `target`, `renderer`, or a field-specific `type` is required.
4. For page authoring, field truth comes from live collection metadata. In CLI-first runs, prefer `nocobase-ctl data-modeling collections get --filter-by-tk <collection> --appends fields -j`; if that command family is unavailable, fall back to `nocobase-ctl resource list --resource collections --filter '{"name":"<collection>"}' --appends fields -j`; only in MCP fallback use `collections:get(appends=["fields"])`. Do not use `collections.fields:list` / `nocobase-ctl data-modeling collections fields list` as the authoring truth. Any field used in blueprint `fields[]` must have a non-empty `interface`. For whole-page `applyBlueprint`, recompute the full involved collection set from live metadata on every draft and rebuild `defaults.collections` from scratch instead of reusing stale fragments. For every involved direct collection, always emit `popups.view` / `popups.addNew` / `popups.edit` as `{ name, description }`, and let any `table` block pull that collection into `addNew` threshold evaluation even when the blueprint did not spell out an `addNew` opener. Keep `fieldGroups` collection-only on the target collection, and add `defaults.collections.<collection>.fieldGroups` only when one of those fixed generated popup scenes should still have more than 10 effective fields after scene filtering; otherwise omit `fieldGroups`. For association fields, keep every involved relation scope on the same fixed `view` / `addNew` / `edit` trio under `defaults.collections.<sourceCollection>.popups.associations.<associationField>.<action>` with the same `{ name, description }` contract; do not create per-association or relation-scoped `fieldGroups`. Never generate `defaults.blocks`, and never put `blocks`, `fields`, `fieldGroups`, or layout under `defaults.collections.*.popups`.
5. `layout` belongs only on `tabs[]` or inline `popup`, never on a block object. For `createForm`, `editForm`, `details`, and `filterForm`, use `fieldsLayout` when the blueprint must control the inner field grid directly. Omit page/popup `layout` only when that tab/popup has at most one non-filter block; otherwise explicit layout is required.
6. For `createForm`, `editForm`, and `details`, once the block contains more than 10 real fields, use explicit `fieldGroups` instead of one flat `fields[]` list. Do not treat manual `divider` items as a substitute, and do not combine `fieldGroups` with `fieldsLayout`.
7. If clicking a shown record or relation record should open details, prefer a field popup. Use a button or action column only when the request explicitly asks for one.
8. If visible same-title destination menu groups already exist, never create another same-title group just to avoid ambiguity and never choose one locally. In that multi-match case, require explicit `navigation.group.routeId` before write. Only zero-match create and one-match title-only reuse may proceed without `routeId`.
9. In `applyBlueprint create`, any newly created `navigation.group` and any top-level or second-level `navigation.item` must carry one valid Ant Design icon name. When `navigation.item` is attached under an explicit existing `navigation.group.routeId`, keep an icon by default but do not assume the local preview can prove whether that live target is already third-level or deeper.
10. `navigation.group.routeId` and desktop-route `id` are navigation locators only. After create/init/readback, normalize to `pageSchemaUid` for page-level `flow-surfaces get`, and only use live `uid` values returned by `get` / `describe-surface` / create responses for `catalog`, `context`, `get-reaction-meta`, `compose`, `configure`, `add*`, or `remove*`. Never pass a desktop-route `id` as `target.uid`.
11. Before the first real whole-page `applyBlueprint`, run the local prepare-write gate (`nb-page-preview --stdin-json --prepare-write` or `prepareApplyBlueprintRequest(...)`) and show one ASCII-first prewrite preview from the same draft blueprint. Treat that helper as a local shape/threshold gate only: it does not fetch live collection metadata by itself. `collectionMetadata` stays caller-supplied. When the caller supplies `collectionMetadata`, it can validate fixed defaults completeness for every involved scope: required `defaults.collections` entries, required popup `{ name, description }` entries for the fixed `view` / `addNew` / `edit` trio, and required `fieldGroups` when any fixed generated popup scene still has more than 10 effective fields. When that completeness work is implied but `collectionMetadata` is missing or normalizes to no collections, prepare-write should surface `defaultsRequirements.skipped=true` and skip completeness validation instead of failing. For artifact-only drafts with no real write, draft `prewrite-preview.txt` directly from the same draft blueprint instead of attempting the local helper CLI.
12. Treat the local prepare-write helper as the authority for normalized local write shape. If it auto-adds, rewrites, or normalizes fields in ways that are within the helper's expected contract, keep that result as-is. For the first real whole-page write, `prepare-write` is mandatory and the only CLI write body is `result.cliBody`; do not send the original draft blueprint to `applyBlueprint`.
13. Treat default values, computed values, field/block/action state, and show/hide as reaction work first. Do not guess raw configure keys.
14. If live readback shows an existing template reference and the requested change touches template-owned content, default to the template source. Keep host/openView config edits local. Page-scoped wording is not local-only intent, so do not auto-detach to `copy`; clarify before writing when scope is unresolved.
15. In testing or multi-agent runs, do not perform destructive cleanup unless the user explicitly asked for deletion.
16. When you summarize persisted readback for the user or for local helper artifacts, prefer one stable public summary with normalized type labels such as `table`, `details`, `editForm`, `filterForm`, and `createForm`; do not rely on raw model names alone. For page-level create / replace, keep `page.pageSchemaUid`, `page.pageTitle`, and `page.menuGroupTitle` explicit in that summary. When a scenario spans multiple pages, use the same canonical page identity keys under `pages.*`, and use `type` for concrete summary nodes such as `tables.*`, `lists.*`, and `forms.*`; reserve `blockTypes` for aggregate arrays such as `root.blockTypes` or `popups.*.blockTypes`. Keep root actions under `root.actionTitles` instead of leaving `recordActionTitles` as the only proof.
17. For reaction work, pick the final block/action target only after `get-reaction-meta` proves the required source path is available in that scene. On targets that expose multiple capabilities, select the write slot by matching `kind` first and then reuse that exact capability fingerprint; do not copy a nearby fingerprint from another `kind`. If the current target cannot expose the needed path, move the target or restructure the page/popup first instead of writing a guessed rule to an unsupported host.
18. If a whole-page request explicitly includes filter / search / screening intent, read [references/blocks/filter-form.md](./references/blocks/filter-form.md) before finalizing the blueprint shape. Keep real `filterForm` blocks in the first-pass blueprint: include stable filter items, `submit` / `reset` actions, and same-blueprint string `target` block keys instead of low-level `defaultTargetUid` or raw block settings payloads.
19. If a first-pass whole-page write still leaves `filterForm` as an empty shell or fails with a verified `filterForm`-specific shape/runtime error, treat that as a blueprint-or-contract problem first. Preserve the failing blueprint/readback evidence, then move to low-level `addBlock` / `addAction` / `addField` only when the failure proves the public whole-page contract cannot satisfy the request.
20. If a create/edit form helper or reference depends on `formValues.*`, inspect catalog / `get-reaction-meta` before choosing the host. When that live scene exposes `fields` / `actions` / `node` but not `blocks`, model the helper as a `jsItem` or other field-like helper inside the same form scene, not as a standalone block; for current JSItem targets, implement hide/show by rendering `null` until the form value is present instead of assuming `setFieldState` can target the JSItem. When that render-null pattern is used successfully, treat it as a configured helper toggle in readback/evidence instead of marking the helper outcome false only because `fieldLinkage` cannot target the JSItem itself.
21. Treat pages with multiple work areas, filter/search blocks, nested popups, or multiple reaction families as complex whole-page requests, not as a separate router path. They still stay on [whole-page-quick.md](./references/whole-page-quick.md) and still prefer one `applyBlueprint` request.
22. For those complex whole-page requests, first-pass blueprint generation should include the structural blocks, inline popups, and top-level `reaction.items[]` together. Do not split the page into root-shell / popup / reaction phases just because the page is large.
23. Use low-level `get-reaction-meta` + `set*Rules` or `add*` repair only for localized edits on an existing live page, or after a verified public whole-page contract gap. A first-pass creation miss is not enough by itself to change the default route.
24. Stay env-neutral in the general skill contract. Use the current configured CLI env or explicit runtime flags instead of hard-coding local aliases or fixed URLs.

# Read Paths

- Route unclear: [references/index.md](./references/index.md)
- Whole-page draft/create/replace from business intent: [whole-page-quick.md](./references/whole-page-quick.md)
- Localized existing-surface edit: [local-edit-quick.md](./references/local-edit-quick.md)
- Whole-page or localized reaction change: [reaction-quick.md](./references/reaction-quick.md)
- Partial-match handling and narrow handoff reports: [boundary-quick.md](./references/boundary-quick.md)
- Reuse, template selection, or existing template reference edits: [template-quick.md](./references/template-quick.md)
- Write-time helper CLIs / prewrite gate / helper return shapes for real writes: [helper-contracts.md](./references/helper-contracts.md)
- JS or chart work: [js.md](./references/js.md) or [chart.md](./references/chart.md)

# Scope & Handoff

- Handle only Modern page (v2) menu/page/tab/popup/content surfaces and the block / field / action / layout / reaction work inside them.
- For partial-match or boundary-report tasks, keep the Modern-page slice narrow and write the handoff report directly from this boundary list. Do not inspect runtime or scripts unless the request is explicitly about those mechanics.
- Hand off ACL / route permissions / role permissions to `nocobase-acl-manage`.
- Hand off collection / field / relation authoring to `nocobase-data-modeling`.
- Hand off workflow create / update / revision / execution to `nocobase-workflow-manage`.
