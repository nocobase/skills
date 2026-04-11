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

- Treat the live MCP schema as the source of truth.
- Minimum read set:
  1. Read [normative-contract.md](./references/normative-contract.md) first.
  2. Read [execution-checklist.md](./references/execution-checklist.md) second.
  3. Then choose **one** path:
     - whole-page `executeDsl` authoring -> [ui-dsl.md](./references/ui-dsl.md) + [tool-shapes.md](./references/tool-shapes.md)；若从业务意图出发，再加读 [page-intent.md](./references/page-intent.md)
     - localized existing-surface edit -> [runtime-playbook.md](./references/runtime-playbook.md) + [tool-shapes.md](./references/tool-shapes.md)，然后只读所需低层主题文档

## Routing

- Whole-page create or replace -> simplified `executeDsl` page DSL.
- Localized edit on an existing page/tab/popup/node -> low-level flow-surfaces APIs.
- For any `flow_surfaces_*` MCP tool whose schema uses `requestBody`, pass the final business payload under `requestBody` as an **object**. Do not stringify it, and do not add an outer `{ values: ... }` wrapper.
- `flow_surfaces_get` is a special case: it uses top-level locator fields directly (`pageSchemaUid` / `routeId` / `tabSchemaUid` / `uid`) rather than `requestBody`.
- Before every write or requestBody-based read, do a self-check:
  1. the MCP envelope shape matches the tool schema (`requestBody` vs top-level locator)
  2. every `target.uid` / `locator.uid` is a real live uid from readback, never the invented literal `"root"`
- If a tool returns `params/requestBody must be object`, `params/requestBody must match exactly one schema in oneOf`, or `flowSurfaces uid 'root' not found`, treat that as a **tool-call-shape error first**, not as evidence that the inner DSL/resource structure is wrong.
- For actual MCP writes, prefer copying the **tool-call envelope** from `tool-shapes.md`; do not copy raw JSON examples from `ui-dsl.md` directly into a tool call.
- `inspect` and page-DSL drafting stay read-only until the user explicitly asks to write.
- For page authoring / field selection, **never use `collections.fields:list`** as the field discovery tool. Use `collections:get(appends=["fields"])` as the only default field truth, and only use `collections.fields:get` for single-field follow-up when the field name is already known.
- For `executeDsl(create)`, prefer `navigation.group.routeId` whenever an existing target group is already known; use `navigation.group.title` only for new-group creation or title-only unique same-title reuse. `routeId` is exact targeting only: do not mix it with group metadata, and use low-level `updateMenu` if an existing group's metadata must change.
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
