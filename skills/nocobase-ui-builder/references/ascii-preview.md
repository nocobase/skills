# ASCII Preview for Whole-page Prewrite Authoring

Use this file for **whole-page `applyBlueprint` authoring before the first write**.

This is a **prewrite review surface**, not the write payload. The first whole-page write should use `prepare-write` output `result.cliBody`; the ASCII preview is rendered from the same draft blueprint that produced that prepared body.

## 1. Scope

- default scope: whole-page `create` / `replace` runs before the first write
- do **not** use this file as the default answer shape for localized low-level edits
- do **not** treat the ASCII preview as readback or persistence proof

## 2. Default prewrite output

Before the first whole-page `applyBlueprint`, default to:

1. one short summary of the page intent
2. one ASCII wireframe rendered from the same blueprint
3. assumptions / open questions outside the payload only when they matter
4. if duplicate menu-group titles are in play, flag that explicit `navigation.group.routeId` is required outside the wireframe
5. if review is required, one confirmation question; otherwise one short execution notice and continue

Default to **ASCII-first** prewrite output. Do **not** dump the full JSON blueprint unless:

- the user explicitly asks to see the blueprint, or
- you are about to write and a technical blueprint review is still needed

## 3. Rendering rules

- render from the same inner page blueprint that would be written later
- page header should show page title plus `mode`
- show `MENU` for create runs when it is known
- when duplicate same-title menu groups exist, do not pretend one was chosen; show that explicit `routeId` is required next to `MENU`
- show `TARGET` for replace runs when `target.pageSchemaUid` is known
- every tab should render as its own ASCII box
- every block should render as its own ASCII box with `type`, optional title, collection, key, and optional `span`
- summarize fields / actions / recordActions instead of dumping every property
- default field/action summary should show a few items and collapse the rest as `+N more`
- if `tab.layout.rows` / `popup.layout.rows` exists, show **row grouping** only; do not attempt pixel-accurate column drawing
- if no layout is present on a scope that legitimately contains at most one non-filter block, render blocks in vertical order
- if a draft omits layout even though the scope has multiple non-filter blocks, keep the preview readable but treat that as a prepare-write validation failure rather than a valid default layout choice

## 4. Popup depth

- default popup expansion depth is exactly **1**
- first-level popup content may be expanded
- deeper nested popup entries should stay visible only as an entry label such as `nested popup omitted`
- if deeper popup content is omitted, mention that omission in warnings or surrounding explanation

## 5. Runtime helper

Use the zero-dependency preview helper for deterministic output:

- module: `renderPageBlueprintAsciiPreview(blueprint)`
- CLI from repo root: `node skills/nocobase-ui-builder/runtime/bin/nb-page-preview.mjs --stdin-json`
- prepare-write helper: `prepareApplyBlueprintRequest(blueprint)`
- prepare-write CLI from repo root: `node skills/nocobase-ui-builder/runtime/bin/nb-page-preview.mjs --stdin-json --prepare-write`
- If the current directory is not the repo root, use the absolute path to `skills/nocobase-ui-builder/runtime/bin/nb-page-preview.mjs`; do not probe the bare `nb-page-preview` command first.

The helper should prefer a bare inner page blueprint object. `--prepare-write` also accepts the public helper envelope described below.

For local helper usage, `prepare-write` may also receive one outer helper envelope like `{ blueprint, templateDecision?, collectionMetadata? }`. This helper envelope is official and should not emit the legacy outer-wrapper warning. Keep `collectionMetadata` in that envelope or call options, never inside the blueprint root. When `templateDecision` is present and valid, the helper should return the normalized `templateDecision` object only after the blueprint is already recognizable, even if other blueprint gates later fail. If that `templateDecision` contradicts the actual bound template uid/mode in the blueprint, reject it with `inconsistent-template-decision` instead of returning a misleading summary. When the CLI receives data-bound blocks, it fills missing metadata entries by fetching only the missing collections, while caller-supplied metadata wins. `--no-auto-collection-metadata` restores the fail-closed path where missing or empty metadata fails `prepare-write` with `missing-collection-metadata`. With resolved metadata, the helper validates defaults completeness against the blueprint. The ASCII wireframe itself still stays reason-free.

Preview-only `renderPageBlueprintAsciiPreview(...)` / the skill-local preview CLI should render the bare blueprint. Use `--prepare-write` when `templateDecision` or `collectionMetadata` is part of the local helper input.

For the **first real write**, the prepare-write helper/CLI is mandatory rather than preview-only mode. It should use the same draft blueprint, render the mandatory ASCII wireframe, validate the high-risk write-shape mistakes locally, and return a normalized prepare-write result that includes the sendable `result.cliBody` only when the gate passes. That helper stays local/read-only: the later remote write is still a separate `nb api flow-surfaces apply-blueprint` call, and after `prepare-write` the only valid first-write body is `result.cliBody`, not the original draft blueprint. Do not wrap that prepared object again.

The local prepare-write gate should reject at least:

- stringified outer `blueprint`
- extra outer tabs for a normal single-page request
- illegal tab keys such as `pageSchemaUid` / `blueprint` / `target`
- block-level `layout`
- non-object `tab.layout` / `popup.layout`
- requested `table` / `list` / `gridCard` / `calendar` / `kanban` filter/search actions landing on the wrong host
- custom `edit` popups that do not contain exactly one `editForm`

If the helper is unavailable in the current execution environment, hand-write a small ASCII wireframe from the same blueprint rather than skipping the preview.

Do **not** skip the preview just because execution is going to continue immediately afterward.

## 6. See also

- [page-intent.md](./page-intent.md)
- [page-blueprint.md](./page-blueprint.md)
- [execution-checklist.md](./execution-checklist.md)
- [verification.md](./verification.md)
