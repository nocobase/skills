---
name: nocobase-ui-builder
description: >-
  Use when the user wants to inspect, draft, create, modify, reorder, or
  delete NocoBase Modern page (v2) menus, pages, tabs, popups, layouts, and
  block / field / action configuration. Also covers reaction-based interaction
  authoring such as default values, computed linkage, block visibility, and
  action enable/disable. Canonical transport is `nocobase-ctl flow-surfaces`
  whenever available. Whole-page creation or replacement still uses the
  simplified page-structure JSON blueprint through applyBlueprint; localized
  edits still map to low-level flow-surfaces APIs and retained API/MCP docs.
  Does not handle ACL, data modeling, workflow orchestration, browser
  reproduction, page error postmortems, or non-Modern-page navigation.
---

# Goal

- Use `nocobase-ctl flow-surfaces` as the canonical front door for Modern page (v2) authoring.
- Keep the current page blueprint, reaction, verification, and API payload docs as the authoring contract and fallback reference set.
- Fall back to direct MCP/API invocation only when the CLI itself is unavailable in the current environment.
- When one user request spans several pages, decompose it into ordered single-page runs; each page still follows the same template-probing, preview, write, and readback loop.
- Users may describe blocks, relations, and operations in business language only. Infer the minimal reasonable structure from that request; do not inflate it into a pseudo-spec.

# Transport Selection

- Prefer the `nocobase-ctl` CLI whenever it is available.
- Canonical topic: `nocobase-ctl flow-surfaces`.
- If `nocobase-ctl` is available but its env/runtime/auth is not ready, stop and guide the user to repair the CLI path (`env add/use/update`, token, or runtime refresh) instead of silently switching to MCP.
- Only fall back to MCP when the CLI itself is unavailable or when the current environment cannot expose the runtime command surface through the CLI.
- Before using a `flow-surfaces` subcommand you have not used yet in the current task, run `nocobase-ctl flow-surfaces --help` or `nocobase-ctl flow-surfaces <subcommand> --help` once and follow the generated help text for flags and examples.
- `nb-page-preview` and `nb-runjs` are local helper CLIs only. They validate drafts and snippets; they are not the primary remote mutation transport.

# Start Here

- Hard rules before you write:
  1. For real CLI writes, pass the page blueprint itself as the raw JSON body through `nocobase-ctl flow-surfaces apply-blueprint --body` / `--body-file`; only in MCP fallback should that same object be wrapped under `requestBody`, and it must remain an object.
  2. For a normal single-page request, default to exactly **one tab**; any second tab is wrong unless the user explicitly asked for multiple route-backed tabs.
  3. Do not add placeholder content such as `Summary` / `Later` / `Spare` tabs or explanatory `markdown` / note / banner blocks unless the user explicitly asked for them.
  4. Field entries default to simple strings. Upgrade to a field object only when `popup`, `target`, `renderer`, or field-specific `type` is required.
  5. For page authoring, field truth comes from `collections:get(appends=["fields"])`, not `collections.fields:list`.
  6. A field is authorable into any block/form blueprint `fields[]` only when `collections:get(appends=["fields"])` shows a **non-empty `interface`** for that field. If `interface` is `null` / empty, the field exists in schema but is **not addable** in UI Builder authoring; omit it instead of guessing. This rule also applies to relation popups and nested popup blocks.
  7. `layout` belongs only on `tabs[]` or inline `popup`, never on a block object; if you keep `layout`, it must stay an object, and when unsure you should omit it.
  8. If the user says clicking a shown record / relation record should open details, prefer a field popup / clickable field; only switch to a button or action column when the requirement explicitly asks for one.
  9. If a destination menu group title already exists, never create another same-title group just to avoid ambiguity. Prefer an explicit `navigation.group.routeId`; otherwise reuse one existing visible same-title group deterministically from the live menu tree and disclose the chosen routeId in the prewrite preview.
  10. Before the first `applyBlueprint`, run the local prepare-write gate on that same blueprint (`node ./runtime/bin/nb-page-preview.mjs --stdin-json --prepare-write` or helper `prepareApplyBlueprintRequest(...)`) and finish **and pass** the authoring self-check: tabs count matches the request, every `tab.blocks` is non-empty, no empty tab exists, no placeholder `markdown` / note / banner block exists, no block object contains `layout`, block `key` values are unique, every chosen field in blueprint `fields[]` has a non-empty live `interface`, every field entry is either a simple string or a field object that is actually needed for `popup` / `target` / `renderer` / field-specific `type`, and every custom `edit` popup contains exactly one `editForm`. If the gate reports extra outer tabs, accidental outer `requestBody` wrappers, stringified fallback envelopes, illegal tab keys, block-level `layout`, or bad custom `edit` popups, rewrite locally before writing.
  11. For any whole-page `applyBlueprint` task, before the first `applyBlueprint`, output one concise **ASCII-first** prewrite preview rendered from the same blueprint. Prefer the local prepare-write gate because it renders that preview and returns the normalized CLI body together: short intent summary + one ASCII wireframe, popup depth exactly one level deep, and full JSON hidden unless the user asks for it. This preview is mandatory even when you will execute immediately afterward. Only stop for confirmation when the request is ambiguous, high-impact, destructive, or the user explicitly asked to review first; otherwise show the preview and continue in the same run.
  12. If the user asks for default values, linkage, computed values, show/hide, required/disabled, or action visibility/state, treat it as a reaction task first. Whole-page authoring goes through top-level `reaction.items[]`; localized edits go through `getReactionMeta` -> `set*Rules`. Do not start by guessing raw configure keys.
  13. Task understanding stays intent-first: first identify whether the request is whole-page authoring, localized editing, reaction work, or another UI-builder path. After the current page/edit path and reusable scene are understood, template selection becomes structure-repeat-first and reuse-first, and whole-page `create` / `replace` is not exempt. For repeat-eligible popup / block / fields scenes, and also for single standard reusable scenes such as relation-details popups, standard CRUD popups, reusable tables, or reusable form-fields layouts with strong context, contextual `list-templates` is a hard gate before binding a template or finalizing the inline fallback; keyword-only search is discovery-only, not binding proof. When the same task contains two or more obviously repeated popup / block / fields scenes, proactively probe templates before locking in inline content even if the user did not explicitly ask for reuse. Treat same-page repeated relation/detail popup scenes as high-confidence repeats too, for example the same relation-details popup shape appearing under a table field, record action, and details field in one page. Natural-language sameness cues such as "same as before", "same", "roughly the same", "follow the earlier pattern", "keep it consistent", or "do not rebuild it from scratch every time" still count as extra evidence, but they are not required once repeated structure is already clear. Repeated-scene detection should compare scene type, collection/resource/association context, field order, and actions/recordActions while ignoring page-local title/key/uid noise. Use a real `target.uid` when available; otherwise build the strongest planning context from the intended opener/resource/association scene, and prefer the local `nb-template-decision plan-query` / `select` helper when it is available. `select` should consume the `plan-query` probe rather than raw candidates alone. Do not guess compatibility locally. Multiple usable templates are not a blocker: auto-pick one stable best available candidate/highest-probability winner when ranking is clear, preferring an exact relation/association-field match first and current scene/description fit next; if semantic ranking still ties, preserve the backend returned order and keep the first compatible row. Ask only when explicit template identity itself is ambiguous, such as one non-unique template name. If contextual probing still finds no usable template, bootstrap the earliest concrete repeated scene, or the first single standard reusable scene with strong context, finish the write/readback, and save that source as a template immediately. When the source kind supports conversion, prefer `save-template(saveMode="convert")` so the first reusable instance also becomes a template reference. Explicit template `uid` / `name` only resolves identity first; availability still comes from the contextual backend result. Default selected templates to `reference`, and switch to `copy` only for explicit local-customization intent.
  14. Treat `list-templates` as the planning truth source, and treat `popup.tryTemplate` as a write-time fallback only. When no explicit `popup.template` is present, default to `popup.tryTemplate=true` for popup-capable `add-field` / `add-fields`, `add-action` / `add-actions`, `add-record-action` / `add-record-actions`, `compose` action/field popup specs, and whole-page `applyBlueprint` inline popup specs; local popup blocks/layout may still remain as the miss fallback. Relation scenes should prefer same-relation popup templates first and then non-relation popup templates; non-relation scenes should match non-relation popup templates only; when multiple candidates still remain, let the backend choose the first result and do not re-rank locally. Existing opener retargeting may also use `flow-surfaces apply` popup specs or low-level `openView.tryTemplate`. When the user explicitly wants the newly created local popup to become a reusable template seed immediately, use `popup.saveAsTemplate={ name, description }` on those same create-time popup paths instead of a separate follow-up save step. Use that same create-time path proactively for the first repeated popup seed too when the current write already carries explicit local `popup.blocks` and contextual probing found no usable popup template. `popup.saveAsTemplate` requires explicit local `popup.blocks` and cannot be combined with `popup.template` or `popup.tryTemplate`. Do not assume later sibling popups in the same write can already bind that freshly saved template; keep them on `popup.tryTemplate=true`, inline fallback, or a planned post-write localized rebind when one shared reference matters.
  15. If one task asks for several pages, split it into an ordered page plan first and execute one page per run; never author or imply a multi-page `applyBlueprint` payload.
  16. After one page writes successfully and readback confirms a reusable popup / block / fields scene, save that scene as a persistent template seed whenever it is the earliest repeated scene and no usable template existed yet; otherwise you may still save it for later pages in the same task. When possible, convert that earliest repeated source to a template reference immediately so all repeated instances in the task end up under the same template. Later pages must still rerun contextual `list-templates` before binding, and the page itself is never a template type.
  17. When the user's request is moderately ambiguous, infer only the minimal reasonable structure needed for the current page. Do not silently invent extra tabs, exact field sets, or rigid layouts unless the request or live facts require them.
- Minimum read set:
  1. Read [cli-transport.md](./references/cli-transport.md) first.
  2. Read [cli-command-surface.md](./references/cli-command-surface.md) second.
  3. Read [transport-crosswalk.md](./references/transport-crosswalk.md) third when you may need CLI <-> MCP fallback name translation.
  4. Read [normative-contract.md](./references/normative-contract.md) fourth.
  5. Read [execution-checklist.md](./references/execution-checklist.md) fifth.
  5.5. If the request suggests reuse, or if the same task contains repeated popup / block / fields scenes, read [templates.md](./references/templates.md) before deciding inline vs template. This also applies to whole-page `create` / `replace`. For repeat-eligible scenes, treat contextual `list-templates` probing as mandatory and treat keyword-only search as discovery-only. If no explicit `popup.template` is present, be ready to write `popup.tryTemplate=true` as the default popup-template fallback on the supported popup-capable write paths, while keeping any local popup content as miss fallback when needed. If the user explicitly wants the new local popup saved as a reusable template immediately, prefer `popup.saveAsTemplate={ name, description }` on the same create-time write instead of planning a second save call.
  5.6. If the task involves JS `code`, `renderer: "js"`, `jsBlock`, `jsColumn`, `jsItem`, a `js` action, or chart `visual.raw / events.raw`, read [js.md](./references/js.md) before choosing the write path. If you need copied upstream `ctx.*` API docs or scenario examples, then read [js-reference-index.md](./references/js-reference-index.md). For existing-surface event-flow JavaScript, also read [settings.md](./references/settings.md) and treat `set-event-flows` as the low-level write path. For linkage / field-value / action-state JavaScript, return to [reaction.md](./references/reaction.md).
  6. Then choose **one** path:
     - whole-page `applyBlueprint` authoring -> [page-blueprint.md](./references/page-blueprint.md) + [tool-shapes.md](./references/tool-shapes.md) + [ascii-preview.md](./references/ascii-preview.md); if you are starting from business intent, also read [page-intent.md](./references/page-intent.md)
     - whole-page `applyBlueprint` + interaction/reaction -> also read [reaction.md](./references/reaction.md)
     - localized existing-surface edit -> [runtime-playbook.md](./references/runtime-playbook.md) + [tool-shapes.md](./references/tool-shapes.md), then read only the specific lower-level topic docs you need
     - localized interaction/reaction edit -> also read [reaction.md](./references/reaction.md), and start with `getReactionMeta`

## Routing

- Task-level multi-page request -> decompose into ordered single-page whole-page or localized runs; each page remains one `applyBlueprint` write or one localized edit sequence.
- Whole-page create or replace -> canonical front door is `nocobase-ctl flow-surfaces apply-blueprint`; whole-page public write contract remains `applyBlueprint`, and the default prewrite surface is one ASCII wireframe rendered from that same blueprint.
- Localized edit on an existing page/tab/popup/node -> canonical front door is the matching `nocobase-ctl flow-surfaces ...` command family (`compose`, `configure`, `add*`, `move*`, `remove*`, `create-page`, `update-menu`, and related operations).
- Whole-page interaction / reaction authoring -> `nocobase-ctl flow-surfaces apply-blueprint` with top-level `reaction.items[]`.
- Localized interaction / reaction edit -> `nocobase-ctl flow-surfaces get-reaction-meta` first, then the matching `set-field-value-rules` / `set-field-linkage-rules` / `set-block-linkage-rules` / `set-action-linkage-rules`.
- `flow_surfaces_context` is only the lower-level supplement for reaction authoring. Do not use it as the first discovery step when `getReactionMeta` already covers the target.
- For actual CLI invocation, prefer discovering the live command surface via `nocobase-ctl flow-surfaces --help` or `nocobase-ctl flow-surfaces <subcommand> --help`. Use [cli-command-surface.md](./references/cli-command-surface.md) as the stable family map and [tool-shapes.md](./references/tool-shapes.md) as the backend payload map.
- Before every write or body-based read, verify two things first: the chosen CLI subcommand matches the live runtime command/help surface, and every `target.uid` / `locator.uid` comes from live readback rather than the invented literal `"root"`.
- If the CLI path is unavailable, fall back to the exact MCP/tool-call envelope from `tool-shapes.md`.
- `inspect` and page-blueprint drafting stay read-only until the user explicitly asks to write.
- For page authoring / field selection, **never use `collections.fields:list`** as the field discovery tool. Use `collections:get(appends=["fields"])` as the only default field truth, and only use `collections.fields:get` for single-field follow-up when the field name is already known.
- For page authoring / field selection, treat `collections:get(appends=["fields"])` as both the schema truth and the **UI addability gate**: if a field's `interface` is empty / null there, do not place it into any blueprint `fields[]`, even if the field is semantically important.
- For `applyBlueprint(create)`, prefer `navigation.group.routeId` when an existing target group is already known; use `navigation.group.title` only for new-group creation or title-only unique same-title reuse. `routeId` is exact targeting only: do not mix it with group metadata, and use low-level `updateMenu` if an existing group's metadata must change.
- If one or more visible same-title menu groups already exist, do **not** create a new same-title group for disambiguation. Reuse an existing group: prefer the exact known `routeId`, otherwise choose one deterministically from the live menu tree and state that chosen routeId in the prewrite preview.
- For a normal single-page request, default to `tabs.length = 1`; side-by-side blocks and deep popup chains stay inside that tab unless the user explicitly asked for multiple route-backed tabs. Do not carry empty / placeholder tabs in that draft.
- Do not add placeholder `Summary` / `Later` / `Spare` tabs or explanatory `markdown` / note / banner blocks just to explain future work or organize your thinking.
- Default blueprint `fields[]` entries to simple strings. Only upgrade a field to an object when `popup`, `target`, `renderer`, or field-specific `type` is required.
- Before the first `applyBlueprint`, run the local prepare-write gate (`node ./runtime/bin/nb-page-preview.mjs --stdin-json --prepare-write` or helper `prepareApplyBlueprintRequest(...)`) and complete the authoring self-check: tabs count matches the request, each `tab.blocks` is non-empty, there is no empty tab, no placeholder `markdown` / note / banner block exists, no block object contains `layout`, block `key` values are unique, every chosen field in blueprint `fields[]` has a non-empty live `interface`, every field entry is either a simple string or a required field object, and every custom `edit` popup has exactly one `editForm`. If the gate fails on extra outer tabs, accidental outer `requestBody` wrappers, stringified fallback envelopes, illegal tab keys, block-level `layout`, or bad custom `edit` popups, rewrite the blueprint before the first write instead of trial-and-error against the backend.
- For any whole-page `applyBlueprint` authoring run, show one ASCII wireframe rendered from that same blueprint before the first write. Prefer the local prepare-write gate because it renders that preview and returns the normalized CLI body in one step. This preview is mandatory even when execution continues immediately. Keep popup expansion at one level, keep JSON hidden unless asked, stop only when confirmation is actually needed, and otherwise continue immediately after the preview.
- In the public page blueprint, `layout` belongs only on `tabs[]` or inline `popup`; never put `layout` on a block object. If you are not sure the layout is correct, omit it.
- If the user says clicking a shown record / relation record should open details, prefer a field popup / clickable field path; use a button or action column only when the user explicitly asks for one.
- Public applyBlueprint blocks do **not** support generic `form`; use `editForm` or `createForm`.
- For `edit` actions:
  - standard single-form edit popup -> prefer backend default popup completion
  - custom popup with sibling blocks / custom layout / deep nesting -> author explicit `popup.blocks` / `popup.layout`, and that custom popup must contain exactly one `editForm`
- In testing / multi-agent runs, never do destructive cleanup (`destroyPage`, `remove*`, `resource_destroy`, etc.) unless the user explicitly asked for deletion.

## Scope & Handoff

- Only handle `menu-group / menu-item / page / tab / popup / content` surfaces that belong to Modern page (v2), plus block / field / action / layout / configuration inside those surfaces.
- Do not handle non-Modern-page desktop routes, browser reproduction, ACL, workflow authoring, or collection schema mutation.
- Explicit handoff:
  - ACL / route permissions / role permissions -> `nocobase-acl-manage`
  - collection / field / relation authoring -> `nocobase-data-modeling`
  - workflow create / update / revision / execution -> `nocobase-workflow-manage`

## Reference Map

### Always

- [cli-transport.md](./references/cli-transport.md): canonical transport selection and fallback rules.
- [cli-command-surface.md](./references/cli-command-surface.md): CLI family map for `flow-surfaces`.
- [transport-crosswalk.md](./references/transport-crosswalk.md): CLI command family <-> MCP fallback tool family naming map.
- [normative-contract.md](./references/normative-contract.md): global contract and precedence.
- [execution-checklist.md](./references/execution-checklist.md): default runbook.
- [verification.md](./references/verification.md): readback rules.
- [template-decision-summary.md](./references/template-decision-summary.md): final user-visible template path summary contract.

### Whole-page `applyBlueprint` path

- [page-blueprint.md](./references/page-blueprint.md): public page blueprint contract.
- [page-intent.md](./references/page-intent.md): high-level page intent -> page blueprint authoring heuristics.
- [page-archetypes.md](./references/page-archetypes.md): first-pass page patterns.
- [ascii-preview.md](./references/ascii-preview.md): ASCII-first prewrite preview rules.
- [reaction.md](./references/reaction.md): whole-page reaction/items authoring, recipes, and guardrails.
- [tool-shapes.md](./references/tool-shapes.md): backend payload envelopes, `--body`/`--body-file` mapping, and MCP fallback shapes.

### Localized low-level path

- [runtime-playbook.md](./references/runtime-playbook.md): family/locator/write-target mental model.
- [reaction.md](./references/reaction.md): localized reaction discovery/write route and common recipes.
- [capabilities.md](./references/capabilities.md): block / field / action capability selection.
- [settings.md](./references/settings.md): `configure` / `updateSettings` semantics.
- [templates.md](./references/templates.md): template search / apply / save / detach rules.
- [popup.md](./references/popup.md): popup semantics and guardrails.
- [aliases.md](./references/aliases.md): narrowing ambiguous user wording.

### Topic-specific

- [chart.md](./references/chart.md): chart topic routing.
- [js.md](./references/js.md): skill-side RunJS validator, runtime-model, and strict-render contract.
- [js-reference-index.md](./references/js-reference-index.md): upstream JS capability snapshot map for JS Block / JS Action / JS Item / JS Field / JS Column / Event Flow / Linkage / `ctx.*` APIs.
