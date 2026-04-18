---
name: nocobase-ui-builder
description: >-
  Use when the task is NocoBase Modern page (v2) UI work: inspect, draft,
  create, replace, or locally edit menus, pages, tabs, popups, blocks, fields,
  actions, and reactions. Route whole-page work to `applyBlueprint`,
  localized edits to low-level `flow-surfaces`, and reaction changes to
  `get-reaction-meta` + `set*Rules`. Not for ACL, data modeling, workflows,
  browser reproduction, or non-Modern-page navigation.
---

# Goal

- Canonical transport is `nocobase-ctl flow-surfaces`.
- Prefer CLI first. Fall back to MCP only when the CLI itself is unavailable after env/runtime repair.
- Keep the skill prompt small. Use [references/index.md](./references/index.md) as the single decision-table entrypoint for deeper docs.
- Treat one user request that spans several pages as ordered single-page runs. Keep each run to one page.
- Users may describe UI in business language only. Infer the minimum executable structure; do not inflate it into a pseudo-spec.

# Router

- Keep routing intent-first:
  - whole-page authoring goes through `applyBlueprint` and `nocobase-ctl flow-surfaces apply-blueprint`
  - localized existing-surface edits go through low-level `flow-surfaces`
  - reaction work starts with `get-reaction-meta`, `nocobase-ctl flow-surfaces get-reaction-meta`, and writes through `set*Rules`
- After that route is clear, read [templates.md](./references/templates.md) before deciding inline vs template, template-source vs host-local edit, or `copy`.
- If the task involves JS `code`, `renderer: "js"`, `jsBlock`, `jsColumn`, `jsItem`, JS actions, charts, or `ctx.*` API questions, read [js.md](./references/js.md) first and then [js-reference-index.md](./references/js-reference-index.md) for the upstream snapshot bridge.
- Before using a `flow-surfaces` subcommand you have not used yet in the current task, run `nocobase-ctl flow-surfaces --help` or `nocobase-ctl flow-surfaces <subcommand> --help`.

# Hard Rules

1. For CLI writes, pass the business object itself as the raw JSON body. Only in MCP fallback should that same object be wrapped under `requestBody`, and it must stay an object.
2. For a normal single-page request, default to exactly one real tab. Do not add empty or placeholder tabs, and do not add placeholder `markdown` / note / banner blocks unless the user explicitly asked for them.
3. Default blueprint `fields[]` entries to simple strings. Upgrade a field entry to an object only when `popup`, `target`, `renderer`, or field-specific `type` is actually required.
4. For page authoring, field truth comes from `collections:get(appends=["fields"])`, not `collections.fields:list`. Any field used in blueprint `fields[]` must have a non-empty `interface`.
5. `layout` belongs only on `tabs[]` or inline `popup`, never on a block object. If you are unsure, omit it.
6. If the user says clicking a shown record or relation record should open details, prefer a field popup / clickable field. Use a button or action column only when the request explicitly asks for one.
7. If a destination menu group title already exists, never create another same-title group just to avoid ambiguity. Prefer an explicit `navigation.group.routeId`; otherwise reuse one visible same-title group deterministically from the live menu tree and disclose the chosen routeId in the prewrite preview.
8. Before the first `applyBlueprint`, run the local prepare-write gate (`node ./runtime/bin/nb-page-preview.mjs --stdin-json --prepare-write` or helper `prepareApplyBlueprintRequest(...)`) and pass the authoring self-check: tabs count matches the request, every `tab.blocks` is non-empty, no block contains `layout`, block `key` values are unique, all chosen fields have a non-empty live `interface`, and every custom `edit` popup contains exactly one `editForm`.
9. Before the first whole-page `applyBlueprint`, show one ASCII-first prewrite preview rendered from the same blueprint. Prefer the local prepare-write gate because it returns the normalized body and preview together. Stop only when the request is ambiguous, destructive, high-impact, or explicitly asks for review first.
10. If the user asks for default values, linkage, computed values, show/hide, required/disabled, or action visibility/state, treat it as reaction work first. Do not guess raw configure keys.
11. If live readback shows an existing template reference and the requested change touches template-owned popup / block / fields content, default to the template source. Keep host/openView config edits local. Page-scoped wording is not local-only intent, so do not auto-detach to `copy`; clarify before writing when scope is unresolved.
12. In testing or multi-agent runs, do not perform destructive cleanup unless the user explicitly asked for deletion.

# Read Paths

- Start with [references/index.md](./references/index.md).
- Whole-page draft/create/replace from business intent: [page-intent.md](./references/page-intent.md) -> [page-blueprint.md](./references/page-blueprint.md) -> [ascii-preview.md](./references/ascii-preview.md) -> [tool-shapes.md](./references/tool-shapes.md).
- Localized existing-surface edit: [runtime-playbook.md](./references/runtime-playbook.md) -> [tool-shapes.md](./references/tool-shapes.md) -> only the specific topic docs you need.
- Whole-page or localized reaction change: [reaction.md](./references/reaction.md).
- Reuse, template selection, or existing template reference edits: [templates.md](./references/templates.md).
- JS or chart work: [js.md](./references/js.md) or [chart.md](./references/chart.md).

# Scope & Handoff

- Handle only Modern page (v2) menu/page/tab/popup/content surfaces and the block / field / action / layout / reaction work inside them.
- Hand off ACL / route permissions / role permissions to `nocobase-acl-manage`.
- Hand off collection / field / relation authoring to `nocobase-data-modeling`.
- Hand off workflow create / update / revision / execution to `nocobase-workflow-manage`.
