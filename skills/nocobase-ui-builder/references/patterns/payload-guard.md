---
title: Payload guard
description: Use local scripts to block high-risk flowModels payloads before persistence.
---

# Payload guard

## Applies to

- every `PostFlowmodels_save` or `PostFlowmodels_mutate`
- validation cases
- popup/openView trees
- relation tables, relation blocks inside details, and relation-field filters

## Default entrypoint

Do not manually stitch together the whole write flow from this page. For ad-hoc `save`, `mutate`, or `ensure`, use:

```bash
node scripts/ui_write_wrapper.mjs run --action save --write-result-file "<write-result.json>" --readback-file "<readback.json>" ...
```

`preflight_write_gate.mjs` and `flow_write_wrapper.mjs` now exist only for wrapper internals or compatibility.

## Core principles

1. Prompts choose modes. They do not guarantee structural correctness.
2. `dataScope.filter` uses `path`, never `field`.
3. `fieldPath` binds logical fields, not raw foreign keys.
4. Popup trees must be complete. An action shell alone is not enough.
5. `associationName` must not be guessed from a child-side `belongsTo` field name.
6. Child-side `belongsTo` filters must not use a bare association plus a scalar operator.
7. `DetailsBlockModel` must not be only an empty grid shell.
8. Relation display fields should stay on the parent collection and use a full dotted path plus explicit `associationPathName`.
9. Dotted relation-title columns must not be the default vehicle for click-to-open or popup behavior.
10. `JSFieldModel` and `JSColumnModel` are not the default workaround for clickable relation titles.
11. Submit actions for `CreateFormModel` and `EditFormModel` belong in `subModels.actions`.
12. `FormItemModel` needs both `fieldSettings.init.fieldPath` and explicit `subModels.field`.
13. Action slots must obey their `allowedUses` contracts.
14. `openView.pageModelClass` and `subModels.page.use` must match.
15. If popup or openView uses `filterByTk`, the target collection must declare `filterTargetKey`.
16. `ChildPageModel` popup tabs must use `ChildPageTabModel`.
17. Explicit tabs should be expressed through structured `requirements.requiredTabs[*]`.
18. A guard blocker stops the write by default.
19. If a task explicitly requires an action capability, pass that requirement into guard.
20. Template clone flows are not exempt. They must still pass the full guard pipeline.
21. Clone-path structural blockers must be fixed before persistence.
22. `FilterFormBlockModel` needs `filterManager`, not only `defaultTargetUid`.
23. Filter field models must be derived from field metadata.
24. flowPage v2 `RootPageModel` must go through the page anchor.
25. Visible flowPage v2 tabs require child desktop routes and individual tab-grid anchors.

## Standard flow

1. Build draft payload or verify payload locally
2. If relation or data-scope conditions are needed, build them through `flow_payload_guard.mjs`
3. Extract required metadata from the draft payload
4. Fill the metadata through current-session collection or field tools
5. Canonicalize locally
6. Audit before write
7. Perform the real MCP write, then hand payload, metadata, requirements, and artifacts to `ui_write_wrapper.mjs`
8. Use `--mode general` only for draft debugging
9. Clone flows must also record canonicalize and audit evidence

## Default blocker families

Examples:

- missing collection metadata
- invalid filter shape
- unresolved field paths
- foreign keys used as UI field bindings
- popup subtree missing
- unstable association display binding
- invalid form action placement
- empty form or filter-form grid
- missing field submodels
- invalid action-slot use
- flowPage v2 page or tab protocol violations

## Default warnings

Examples:

- hardcoded `filterByTk`
- empty popup grid
- empty details block
- relation block with empty filter
- missing target metadata for an association

In `validation-case` mode, several warnings are intentionally escalated to blockers.

## Filter-form canonicalization

`canonicalize-payload` may normalize `FilterFormItemModel` by:

- fixing `subModels.field.use`
- fixing `filterFormItemSettings.init.filterField`
- emitting transform code `FILTER_FORM_FIELD_MODEL_CANONICALIZED`

The mapping should stay metadata-driven.

## risk-accept

Risk accept is allowed only when the risk is explicit and narrow:

- record the accepted codes with `tool_journal.mjs note`
- rerun `audit-payload`
- pass the same codes back through `--risk-accept`
- do not use one note to waive every blocker

Structural contract violations remain non-waivable even when `risk_accept` is present.
