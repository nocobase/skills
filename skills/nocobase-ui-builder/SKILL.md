---
name: nocobase-ui-builder
description: >-
  Use when the user wants to inspect, draft, create, modify, reorder, or
  delete NocoBase Modern page (v2) menus, pages, tabs, popups, layouts, and
  block / field / action configuration. Whole-page creation or replacement uses
  the simplified page-structure JSON DSL through executeDsl; localized edits use
  low-level flow-surfaces APIs. Does not handle ACL, data modeling, workflow
  orchestration, browser reproduction, page error postmortems, or
  non-Modern-page navigation.
---

# Start Here

- Hard rules before you write:
  1. `flow_surfaces_execute_dsl.requestBody` must stay an **object**; never stringify it.
  2. For a normal single-page request, default to exactly **one tab**; any second tab is wrong unless the user explicitly asked for multiple route-backed tabs.
  3. Do not add placeholder content such as `Summary` / `Later` / `备用` tabs or explanatory `markdown` / note / banner blocks unless the user explicitly asked for them.
  4. Field entries default to simple strings. Upgrade to a field object only when `popup`, `target`, `renderer`, or field-specific `type` is required.
  5. For page authoring, field truth comes from `collections:get(appends=["fields"])`, not `collections.fields:list`.
  6. A field is authorable into any block/form DSL `fields[]` only when `collections:get(appends=["fields"])` shows a **non-empty `interface`** for that field. If `interface` is `null` / empty, the field exists in schema but is **not addable** in UI Builder authoring; omit it instead of guessing. This rule also applies to relation popups and nested popup blocks.
  7. `layout` belongs only on `tabs[]` or inline `popup`, never on a block object; if you keep `layout`, it must stay an object, and when unsure you should omit it.
  8. If the user says clicking a shown record / relation record should open details, prefer a field popup / clickable field; only switch to a button or action column when the requirement explicitly asks for one.
  9. If a destination menu group title already exists, never create another same-title group just to avoid ambiguity. Prefer an explicit `navigation.group.routeId`; otherwise reuse one existing visible same-title group deterministically from the live menu tree and disclose the chosen routeId in the prewrite preview.
  10. Before the first `executeDsl`, finish **and pass** the authoring self-check: tabs count matches the request, every `tab.blocks` is non-empty, no empty tab exists, no placeholder `markdown` / note / banner block exists, no block object contains `layout`, block `key` values are unique, every chosen field in DSL `fields[]` has a non-empty live `interface`, every field entry is either a simple string or a field object that is actually needed for `popup` / `target` / `renderer` / field-specific `type`, and every custom `edit` popup contains exactly one `editForm`. If any item fails, rewrite the DSL before writing.
  11. For any whole-page `executeDsl` task, before the first `executeDsl`, output one concise **ASCII-first** prewrite preview rendered from the same DSL: short intent summary + one ASCII wireframe, popup depth exactly one level deep, and full JSON hidden unless the user asks for it. This preview is mandatory even when you will execute immediately afterward. Only stop for confirmation when the request is ambiguous, high-impact, destructive, or the user explicitly asked to review first; otherwise show the preview and continue in the same run.
- Minimum read set:
  1. Read [normative-contract.md](./references/normative-contract.md) first.
  2. Read [execution-checklist.md](./references/execution-checklist.md) second.
  3. Then choose **one** path:
     - whole-page `executeDsl` authoring -> [ui-dsl.md](./references/ui-dsl.md) + [tool-shapes.md](./references/tool-shapes.md) + [ascii-preview.md](./references/ascii-preview.md)；若从业务意图出发，再加读 [page-intent.md](./references/page-intent.md)
     - localized existing-surface edit -> [runtime-playbook.md](./references/runtime-playbook.md) + [tool-shapes.md](./references/tool-shapes.md)，然后只读所需低层主题文档

## Routing

- Whole-page create or replace -> simplified `executeDsl` page DSL; whole-page public write path in this skill is `executeDsl` only, and the default prewrite surface is one ASCII wireframe rendered from that same DSL.
- Localized edit on an existing page/tab/popup/node -> low-level flow-surfaces APIs.
- For requestBody-based `flow_surfaces_*` tools, send the business payload under `requestBody` as an **object**. Do not stringify it or wrap it in `{ values: ... }`. `flow_surfaces_get` is the main exception: it uses top-level locator fields directly (`pageSchemaUid` / `routeId` / `tabSchemaUid` / `uid`).
- Before every write or requestBody-based read, verify two things first: the MCP envelope matches the tool schema, and every `target.uid` / `locator.uid` comes from live readback rather than the invented literal `"root"`.
- If a tool returns `params/requestBody must be object`, `params/requestBody must match exactly one schema in oneOf`, or `flowSurfaces uid 'root' not found`, fix the **tool-call shape first**.
- For actual MCP writes, prefer copying the **tool-call envelope** from `tool-shapes.md`; do not copy raw JSON examples from `ui-dsl.md` directly into a tool call.
- `inspect` and page-DSL drafting stay read-only until the user explicitly asks to write.
- For page authoring / field selection, **never use `collections.fields:list`** as the field discovery tool. Use `collections:get(appends=["fields"])` as the only default field truth, and only use `collections.fields:get` for single-field follow-up when the field name is already known.
- For page authoring / field selection, treat `collections:get(appends=["fields"])` as both the schema truth and the **UI addability gate**: if a field's `interface` is empty / null there, do not place it into any DSL `fields[]`, even if the field is semantically important.
- For `executeDsl(create)`, prefer `navigation.group.routeId` when an existing target group is already known; use `navigation.group.title` only for new-group creation or title-only unique same-title reuse. `routeId` is exact targeting only: do not mix it with group metadata, and use low-level `updateMenu` if an existing group's metadata must change.
- If one or more visible same-title menu groups already exist, do **not** create a new same-title group for disambiguation. Reuse an existing group: prefer the exact known `routeId`, otherwise choose one deterministically from the live menu tree and state that chosen routeId in the prewrite preview.
- For a normal single-page request, default to `tabs.length = 1`; side-by-side blocks and deep popup chains stay inside that tab unless the user explicitly asked for multiple route-backed tabs. Do not carry empty / placeholder tabs in that draft.
- Do not add placeholder `Summary` / `Later` / `备用` tabs or explanatory `markdown` / note / banner blocks just to explain future work or organize your thinking.
- Default DSL `fields[]` entries to simple strings. Only upgrade a field to an object when `popup`, `target`, `renderer`, or field-specific `type` is required.
- Before the first `executeDsl`, complete the authoring self-check: tabs count matches the request, each `tab.blocks` is non-empty, there is no empty tab, no placeholder `markdown` / note / banner block exists, no block object contains `layout`, block `key` values are unique, every chosen field in DSL `fields[]` has a non-empty live `interface`, every field entry is either a simple string or a required field object, and every custom `edit` popup has exactly one `editForm`. If any item fails, rewrite the DSL before the first write instead of trial-and-error against the backend.
- For any whole-page `executeDsl` authoring run, show one ASCII wireframe rendered from that same DSL before the first write. This preview is mandatory even when execution continues immediately. Keep popup expansion at one level, keep JSON hidden unless asked, stop only when confirmation is actually needed, and otherwise continue immediately after the preview.
- In the public page DSL, `layout` belongs only on `tabs[]` or inline `popup`; never put `layout` on a block object. If you are not sure the layout is correct, omit it.
- If the user says clicking a shown record / relation record should open details, prefer a field popup / clickable field path; use a button or action column only when the user explicitly asks for one.
- Public executeDsl blocks do **not** support generic `form`; use `editForm` or `createForm`.
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

- [normative-contract.md](./references/normative-contract.md): global contract and precedence.
- [execution-checklist.md](./references/execution-checklist.md): default runbook.
- [verification.md](./references/verification.md): readback rules.

### Whole-page `executeDsl` path

- [ui-dsl.md](./references/ui-dsl.md): public page DSL contract.
- [page-intent.md](./references/page-intent.md): high-level page intent -> page DSL authoring heuristics.
- [page-archetypes.md](./references/page-archetypes.md): first-pass page patterns.
- [ascii-preview.md](./references/ascii-preview.md): ASCII-first prewrite preview rules.
- [tool-shapes.md](./references/tool-shapes.md): minimal request envelopes and common invalid payloads.

### Localized low-level path

- [runtime-playbook.md](./references/runtime-playbook.md): family/locator/write-target mental model.
- [capabilities.md](./references/capabilities.md): block / field / action capability selection.
- [settings.md](./references/settings.md): `configure` / `updateSettings` semantics.
- [templates.md](./references/templates.md): template search / apply / save / detach rules.
- [popup.md](./references/popup.md): popup semantics and guardrails.
- [aliases.md](./references/aliases.md): narrowing ambiguous user wording.

### Topic-specific

- [chart.md](./references/chart.md): chart topic routing.
- [js.md](./references/js.md): RunJS validator contract.
