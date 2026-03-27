---
name: nocobase-ui-builder
description: Create, read, update, move, and delete NocoBase Modern page (v2) pages and blocks through MCP; only enter validation, review, or smoke flows when the user explicitly asks for them.
allowed-tools: All MCP tools provided by NocoBase server, plus local Node for scripts/*.mjs under this skill
---

# Goal

Use the `desktopRoutes` and `flowModels` MCP tools to build and maintain NocoBase Modern page (v2) pages and blocks.

This skill covers:

- create, read, update, move, and delete for pages, tabs, blocks, actions, and JS models
- structured delivery driven by route-ready, readback, and payload guard evidence
- validation, review, improve, and smoke only when the user explicitly requests them

The top-level `SKILL.md` stays small on purpose. It only defines trigger boundaries, the canonical entrypoint, a few hard gates, and the final reporting axes. Task routing, recipes, block contracts, pattern contracts, and JS contracts live in:

- [references/index.md](references/index.md)

## When To Trigger

- The user wants to create, read, update, move, or delete a Modern page (v2) page or block
- The user wants to modify an existing Modern page through `desktopRoutes v2` or `flowModels`
- The user asks for route-ready, readback, guard, or structured validation conclusions
- The user explicitly asks for validation, review, improve, smoke, or browser verification

## When Not To Trigger

- Collections, fields, or relations only: use `nocobase-data-modeling`
- Workflows only: use `nocobase-workflow-manage`
- MCP installation or connectivity only: use `nocobase-mcp-setup`

## Canonical Entry

1. Open [references/index.md](references/index.md) first.
2. Follow the task route and then read the matching canonical docs, recipes, block docs, pattern docs, and JS docs.
3. The default execution path is: the agent calls NocoBase MCP directly, collects write/readback/route/anchor artifacts, and then runs `node scripts/ui_write_wrapper.mjs run --action <create-v2|save|mutate|ensure> ...` for local guard, summarization, and evidence persistence.
4. The wrapper now only owns `start-run -> guard -> consume write artifact -> consume readback artifact -> finish-run`. Do not let the script call NocoBase directly, and do not manually split the flow outside it.
5. Only enter validation, review, or improve when the user explicitly asks for them. If browser validation is not requested, record `browser_attach` and `smoke` as `skipped`.

## Default Hard Gates

1. Do not guess `use`, slot membership, or `requestBody` structure when you can discover them.
2. Run `start-run` before any discovery or write action. Never discover first and backfill the log later.
3. Raw `PostDesktoproutes_createv2`, `PostFlowmodels_save`, `PostFlowmodels_mutate`, and `PostFlowmodels_ensure` are disabled as direct agent entrypoints. Use MCP first, then feed the evidence into `ui_write_wrapper.mjs`.
4. `preflight_write_gate.mjs`, `flow_write_wrapper.mjs`, `rest_validation_builder.mjs`, and `rest_template_clone_runner.mjs` are now helper or compatibility components. They are not the default write path.
5. `createV2` success only means `page shell created`. Do not claim the page is ready until route-ready and anchor readback evidence exist.
6. `save`, `mutate`, and `ensure` returning `ok` only means the request was accepted. Final truth comes from follow-up readback.
7. Patch existing pages locally by default. Do not rebuild the entire page tree for a local change.
8. `flowPage v2` is always anchor-first. `RootPageModel` must be written as the anchor child at `parentId=<pageSchemaUid>, subKey=page`. Do not persist the page route `schemaUid` directly as `RootPageModel.uid`.
9. Visible `RootPageModel` tabs are route-driven. Do not persist them in `subModels.tabs`. Create child desktop routes first, then write each tab's content to `parentId=<tabSchemaUid>, subKey=grid`.
10. Do not write internal, unresolved, or high-risk model/use values unless schema and graph evidence explicitly allow them.
11. Do not attach or launch a browser unless the user explicitly asks to open the page or run runtime or smoke verification.
12. Validation conclusions must separate `page shell`, `route-ready`, `readback`, `data`, and `runtime`. Do not collapse them into a single "success".
13. Live tree patching must not reparent nodes by reusing an old uid with a new `parentId/subKey/subType`. If you need to move or remount a subtree, remap fresh descendants instead of reusing block uids.
14. If `gridSettings.rows` and `subModels.items` disagree, treat the tree as high-risk and broken. If readback does not show stable `items` or slot membership, do not claim success.

## Validation / Review Branch

Only enter this branch when the user explicitly asks for validation, review, improve, or smoke:

- Structured validation rules: [references/validation.md](references/validation.md)
- Run log, phase/gate, report, and improve rules: [references/ops-and-review.md](references/ops-and-review.md)

If browser validation was not explicitly requested:

- stop at route-ready, readback, and data-ready
- record `browser_attach` and `smoke` as `skipped (not requested)`
- report `runtimeUsable` as `not-run`

## Final Reporting Axes

The final explanation and review report must report these axes separately by default:

- `pageShellCreated`
- `routeReady`
- `readbackMatched`
- `dataReady`
- `runtimeUsable`
- `browserValidation`
- `dataPreparation`
- `pageUrl`

Allowed conservative statuses include:

- `not-recorded`
- `evidence-insufficient`
- `skipped (not requested)`
- `not-run`

Without route-ready or readback evidence, do not say "the page is openable" or "the data is fully persisted".

If the current run actually created or updated a page and you can infer `adminBase`, a candidate page URL, or any equivalent address, the final result must include the real page URL so the user can open it directly. Only omit it when there is a concrete blocker.
