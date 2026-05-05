# Execution Checklist

Canonical front door is `node skills/nocobase-ui-builder/runtime/bin/nb-flow-surfaces.mjs`. When runtime/auth is missing, report the blocked wrapper command before writing.

Use this checklist after the matching quick route is already clear. For global rules, see [normative-contract.md](./normative-contract.md). For template planning and existing template reference edits, keep [templates.md](./templates.md) as the only source of truth.

## 1. Preflight

- Confirm the task is really about Modern page (v2) UI.
- Confirm `nb` is available, then run:
  - `nb --help`
- If runtime/auth is missing, report the blocked wrapper command before writing.
- Before first use of a specific subcommand, run `node skills/nocobase-ui-builder/runtime/bin/nb-flow-surfaces.mjs <subcommand> --help`.
- Decide the route early:
  - whole-page create / replace
  - localized existing-surface edit
  - reaction authoring
- If one user request spans several pages, split it into ordered single-page runs first.
- Agent orchestration rule: if multiple ordered page runs share the same menu group title, serialize the page runs yourself. On the first page, use `navigation.group.title` to create or resolve the group and capture the returned `routeId`; for subsequent pages, set `navigation.group` to `{ routeId }` and do not use title-only creation. Never start concurrent title-only group creates for the same shared group. Concurrent title-only shared-group creates are forbidden.
- Page identity for duplicate-page prevention is `(navigation.group.routeId, page.title)` after any unique group-title resolution. Same group + same page title may auto-upgrade `create` to `replace`; different group + same page title must not merge, reuse, or auto-replace another page.
- If real fields or relations matter, gather live schema first with `nb api data-modeling collections get --filter-by-tk <collection> --appends fields -j`. If that command family is unavailable, use `nb api resource list --resource collections --filter '{"name":"<collection>"}' --appends fields -j`. Drop any field whose `interface` is empty / null before authoring.
- If JS is involved, validate it first and route through [js.md](./js.md).
- Before any write or body-based read, confirm the transport shape:
  - `get` uses top-level locator flags and no JSON body
  - body-based wrapper commands take the raw business object through `--body` / `--body-file`
  - never wrap that same object again before passing it to `nb-flow-surfaces.mjs`
- Never invent `"root"` for `target.uid` or `locator.uid`.

## 2. Template Decision Gate

- Enter the template path only after the structural route is clear.
- For repeat-eligible popup / block / fields scenes, and for one standard reusable scene with strong context, contextual `list-templates` is mandatory before binding a template or finalizing a reusable/template-backed fallback.
- Fresh whole-page `create` work with explicit local popup / block content, no existing template reference, and no reuse / save-template ask should stay inline and skip template routing.
- Keyword-only search stays discovery-only; it is not enough to prove a binding choice.
- When no explicit `popup.template` is present, treat `popup.tryTemplate=true` as the write fallback, not as the planning truth source.
- If there is no explicit local popup content, let the backend miss path continue; if there is local popup content, keep that content as the fallback.
- When the user explicitly wants the new local popup itself to become reusable immediately, or the first repeated popup seed already exists as local popup content and contextual probing found no usable template, use `popup.saveAsTemplate={ name, description }`.
- `popup.saveAsTemplate` cannot be combined with `popup.template`; it may coexist with `popup.tryTemplate=true`, where a hit reuses the matched template directly and a miss needs explicit local `popup.blocks` so the fallback popup can be saved.
- If a localized edit already hits an existing template reference, route through [templates.md](./templates.md) before writing.
- Existing template reference edits default to the template-source route for template-owned content. Keep host-local config changes local, and treat page-scoped wording as not local-only intent.
- If existing-reference scope is still unresolved, stop and clarify instead of auto-detaching or using `copy` as a safety fallback.

## 3. Whole-page Create / Replace

Use this path when the user is describing one entire page.

1. Start with [whole-page-quick.md](./whole-page-quick.md). Once whole-page routing is confirmed, read [page-intent.md](./page-intent.md) and [page-blueprint.md](./page-blueprint.md). Open [tool-shapes.md](./tool-shapes.md) only when preparing the real nb body or nb helper envelope.
2. Draft one entire page blueprint only. `applyBlueprint` is for one entire page, not a tiny patch. Whole-page includes whole-page create / replace, one route-backed tab full build, complex multi-block pages, nested-popup pages, and pages with multiple reaction families.
3. Default a normal single-page request to exactly one tab. Do not add placeholder tabs or placeholder `markdown` / note / banner blocks.
4. Keep `fields[]` as simple strings unless `popup`, `target`, `renderer`, or field-specific `type` is actually required.
5. Keep `layout` only on `tabs[]` or inline `popup`. Omit it only when that tab/popup has at most one non-filter block; otherwise explicit layout is required before write.
6. Before the first write, confirm the draft can satisfy the wrapper's internal prepare-write gate:
   - in `create`, every newly created `navigation.group` / `navigation.item` carries a semantic Ant Design icon
   - tabs count matches the request
   - every `tab.blocks` is non-empty
   - no block contains `layout`
   - block `key` values are unique
   - any explicit `layout` references only real keyed blocks, places every keyed block exactly once, and does not duplicate one block across multiple cells
   - if one tab or popup contains multiple non-filter blocks, it has explicit `layout` and each non-template-backed data block has a `title`; template-backed blocks are exempt; a single non-filter block may omit its `title` unless the user explicitly asks for one
   - every chosen field has a non-empty live `interface`
   - any requested `table` / `list` / `gridCard` / `calendar` / `kanban` filtering/search action lands on the intended host instead of silently turning into `filterForm`
   - any `filterForm` with 4 or more fields includes `collapse`
   - every custom `edit` popup contains exactly one `editForm`
      - data-bound blocks have resolved `collectionMetadata`; the wrapper auto-fills missing collection entries by default, while `--no-auto-collection-metadata` keeps the `missing-collection-metadata` fail-closed path
   - with resolved `collectionMetadata`, prepare-write validates the involved `defaults.collections` entries, popup `{ name, description }` values for the fixed `view` / `addNew` / `edit` trio, and large-popup `fieldGroups` when any fixed scene stays above the threshold; `table` blocks always pull their collection into the `addNew` check
7. Pre-write reads, metadata fetch, and `prepare-write` are allowed, but the first mutating write in this route must be `applyBlueprint` through `node skills/nocobase-ui-builder/runtime/bin/nb-flow-surfaces.mjs apply-blueprint`.
8. Before one whole-page `applyBlueprint` succeeds, do not issue `createMenu`, `createPage`, `compose`, `configure`, `update-settings`, `add*`, `move*`, `remove*`, or `set*Rules`.
9. In execution, invoke the wrapper once; it runs internal `prepare-write` first, then sends `result.cliBody` as the backend raw JSON body.
10. If you persist the prepared payload to a file for the final nb write, persist `result.cliBody` itself; do not point `apply-blueprint` back at the original draft blueprint file after `prepare-write` has already run.
11. If a whole-page `applyBlueprint` fails before first success, repair the blueprint from the error, rerun `prepare-write`, and retry blueprint-only up to 5 rounds. Do not continue with low-level writes during those pre-success retries. After 5 failed rounds, report the latest prepared payload / error evidence.
12. Do not wrap that prepared business object again.
13. A successful `apply-blueprint` response is the default stop point. Run follow-up `get` only when follow-up localized work or explicit inspection needs live structure. After a successful `applyBlueprint`, localized low-level repair may address only an explicit local/live gap and should stay narrowly scoped. When follow-up work needs live structure, use the returned `target` / `pageSchemaUid` for wrapper `get` and targeted readback from [verification.md](./verification.md).

## 4. Localized Existing-surface Edit

Use this path when the user wants to change only part of an existing surface.

1. Start with [local-edit-quick.md](./local-edit-quick.md). Once localized-edit routing is confirmed, read [runtime-playbook.md](./runtime-playbook.md). Open [tool-shapes.md](./tool-shapes.md) only when the write shape is actually needed.
2. Use `get` to locate the target. Use `describe-surface` only when the richer tree helps.
3. Use `catalog` only when capability uncertainty is the real blocker.
4. Keep the write as small as possible:
   - `compose` for structured insertion
   - `configure` / `update-settings` for semantic settings changes
   - `add-*`, `move-*`, `remove-*`, `update-*` for node lifecycle
5. If the localized change is really reaction work, do not guess raw configure keys. Start with `get-reaction-meta`.
6. Read back only the affected target or parent after the write.

## 5. Reaction Work

- Start with [reaction-quick.md](./reaction-quick.md) when the task is reaction-first. Use this section only after that route is already confirmed.
- Whole-page reaction work belongs in blueprint `reaction.items[]`.
- Localized reaction work starts with `get-reaction-meta` and then writes through the matching `set-field-value-rules`, `set-field-linkage-rules`, `set-block-linkage-rules`, or `set-action-linkage-rules`.
- Keep form field-value and form field-linkage writes targeted at the outer form block uid/path, not the inner grid.
- Use [reaction.md](./reaction.md) for payload details and [templates.md](./templates.md) if the target already carries a template reference.

## 6. Schema / Capability Reads

- Use `nb api data-modeling collections list -j` only to narrow candidates.
- Use `nb api data-modeling collections get --filter-by-tk <collection> --appends fields -j` as the authoring truth. If that command family is unavailable, use `nb api resource list --resource collections --filter '{"name":"<collection>"}' --appends fields -j`.
- Do not use `nb api data-modeling collections fields list` / `data-modeling fields list` for page authoring / field discovery.
- Use `nb api data-modeling collections fields list --collection-name <collection> --filter '{"name":"<field>"}' -j` only for known single-field follow-up.
- If required schema is missing, stop and hand off to `nocobase-data-modeling`.

## 7. Stop / Handoff

Stop instead of guessing when:

- `nb` is unavailable or cannot expose the required command family
- the target is still ambiguous after readback
- the task is really ACL, workflow, data-modeling, browser validation, or non-Modern-page navigation
- the request is about editing template-owned content under an existing template reference but still does not clearly resolve to edit-template-source, edit-host-local-config, switch-template-reference, or detach-to-copy
