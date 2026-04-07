---
name: nocobase-ui-builder
description: >-
  Use when the user wants to inspect, create, modify, reorder, or delete
  NocoBase Modern page (v2) menus, pages, tabs, popups, layouts, and block /
  field / action configuration; does not handle ACL, data modeling, workflow
  orchestration, browser reproduction, page error postmortems, or
  non-Modern-page navigation.
---

# Start Here

- Cross-topic source of truth: read [normative-contract.md](./references/normative-contract.md) first.
- Default execution entry: read [execution-checklist.md](./references/execution-checklist.md) first.
- This file only keeps trigger boundaries, cross-topic hard rules, terminology, and the reference map.
- The live MCP schema, plus live `get` / `catalog` / `context` / `readback`, always take precedence over local documents.

## Operating Model

- `agents/openai.yaml` only handles skill invocation and minimal guardrails. It does not duplicate detailed rules.
- `SKILL.md` maintains trigger boundaries, scope, cross-topic hard rules, and the reference map.
- [normative-contract.md](./references/normative-contract.md) is the single source of truth for `catalog`, popup shell fallback, and schema drift / recovery.
- [execution-checklist.md](./references/execution-checklist.md) is the default execution entry and owns the fast execution chain. Do not bounce back to this file during normal execution.
- Each `references/*.md` file owns its topic-specific contract. If its granularity differs from the overview here, follow the topic reference and the live MCP schema.

## Scope & Handoff

- Only handle `group / flowPage / page / tab / popup / content` surfaces that are directly related to Modern page (v2), plus block / field / action / layout / configuration inside content areas.
- Do not handle non-Modern-page desktop routes, other workbench navigation structures, browser validation-case reproduction, page error postmortems, or workflow / ACL / data-modeling details.
- Explicit handoff:
  - ACL / route permissions / role permissions -> `nocobase-acl-manage`
  - collection / association / field schema authoring -> `nocobase-data-modeling`
  - consuming existing schema for UI resource binding -> stays in this skill
  - workflow create / update / revision / execution path -> `nocobase-workflow-manage`

## Key Terms

- `target family`: the surface family that the current target belongs to. Always use `menu-group`, `menu-item`, `page`, `outer-tab`, `route-content`, `popup-page`, `popup-tab`, `popup-content`, or `node`.
- `pre-init ids`: page / tab / route-related ids returned by `createMenu(type="item")` before `createPage(menuRouteId=...)` finishes initialization. They are not write-ready targets for the page/tab lifecycle yet.
- `initialized page`: a page that has already gone through `createPage(menuRouteId=...)` and can continue using page/tab lifecycle APIs.
- `readback`: the minimum necessary read after a write, used to confirm that structure, route state, popup subtree, or configuration was actually persisted.

## Cross-cutting Guardrails

1. `inspect` is read-only by default. Only enter a write flow when the user explicitly asks to create, modify, reorder, delete, or fix something.
2. UI structure mutation must go through `flow_surfaces_*` only. The only allowed discovery / read entries are `flow_surfaces_get`, `flow_surfaces_catalog`, `flow_surfaces_context`, and `desktop_routes_list_accessible(tree=true)`. Do not substitute UI mutation with `resource_*`, `collections_*`, `workflows_*`, `flow_nodes_*`, `roles_*`, or low-level route-record writes.
3. Before any write, MCP must be reachable and authenticated. If MCP is unavailable, unauthenticated, the schema is stale, or the live environment lacks a required tool / capability / guard, stop guessing writes. For recovery, follow the `Schema Drift / Recovery Contract` in [normative-contract.md](./references/normative-contract.md).
4. `desktop_routes_list_accessible(tree=true)` only represents the menu tree visible to the current role. It is not the full system menu truth. Do not infer "does not exist in the system" from "not visible here".
5. Do not guess when the target is not unique. A menu title only accepts a uniquely matched `group`. If the target can only be inferred from sibling-relative position, narrow it to a unique target first. After `createMenu(type="item")`, you must run `createPage(menuRouteId=...)` before anything else. Its `pre-init ids` are not write-ready targets for the page/tab lifecycle.
6. The default write path for an existing target is `get -> [decide whether to append catalog by normative contract] -> write -> readback`. The only time you may skip one leading `get` is when the next target uid was just returned directly by the previous write API.
7. If any child item in a batch write fails, stop immediately and report successes and failures separately. Do not auto-rollback, and do not continue with downstream writes that depend on "all succeeded". If a server contract / validation error points to drift or a capability gap, close the loop through [normative-contract.md](./references/normative-contract.md). Do not define an abstract refresh-retry loop.
8. Any JS write must pass the local validator gate first. If the validator cannot run, the Node version is unsupported, or the result is not decidable, stop. Do not bypass the validator and call MCP directly.

## Reference Map

- [normative-contract.md](./references/normative-contract.md): the single source of truth for `catalog`, popup shell fallback, and schema drift / recovery.
- [execution-checklist.md](./references/execution-checklist.md): the default execution entry; covers preflight, intent, read/write path, risk gate, topic gate, and stop/handoff.
- [verification.md](./references/verification.md): acceptance rules for `inspect`, post-write `readback`, and batch / high-impact / destructive paths.
- [runtime-playbook.md](./references/runtime-playbook.md): the mental model for `target family`, locators, `pre-init ids`, write targets, and lifecycle flow.
- [capabilities.md](./references/capabilities.md): how to choose blocks / forms / actions / fields, plus the default design for display vs association fields.
- [settings.md](./references/settings.md): the sole decision rules for `add* + settings`, `configure`, and `updateSettings`.
- [tool-shapes.md](./references/tool-shapes.md): flow-surfaces request envelopes, canonical payloads, and request shapes for high-risk APIs.
- [popup.md](./references/popup.md): rules for `currentRecord`, association popups, `associatedRecords`, `openView`, and popup openers.
- [chart.md](./references/chart.md): the chart topic entry point and routing guidance.
- [chart-core.md](./references/chart-core.md): the main chart runtime path for setup, reconfiguration, context narrowing, and readback.
- [chart-validation.md](./references/chart-validation.md): chart contract cases, negative cases, and regression matrices.
- [js.md](./references/js.md): the RunJS validator gate, model mapping, context semantics, and code style.
- [runjs-runtime.md](./references/runjs-runtime.md): the RunJS CLI entry, cwd assumptions, runtime-local dev commands, and `--skill-mode` constraints.
- [aliases.md](./references/aliases.md): how to narrow high-ambiguity natural-language expressions to object semantics or capabilities first.
