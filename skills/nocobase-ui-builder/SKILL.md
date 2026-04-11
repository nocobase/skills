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
     - whole-page `executeDsl` authoring -> [ui-dsl.md](./references/ui-dsl.md), plus [page-intent.md](./references/page-intent.md) when starting from business intent
     - localized existing-surface edit -> [runtime-playbook.md](./references/runtime-playbook.md), then only the specific low-level topic docs you need

## Routing

- Whole-page create or replace -> simplified `executeDsl` page DSL.
- Localized edit on an existing page/tab/popup/node -> low-level flow-surfaces APIs.
- `inspect` and page-DSL drafting stay read-only until the user explicitly asks to write.

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
