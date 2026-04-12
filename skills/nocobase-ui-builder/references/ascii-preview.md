# ASCII Preview for Whole-page Prewrite Authoring

Use this file for **whole-page `applyBlueprint` authoring before the first write**.

This is a **prewrite review surface**, not the write payload. The write truth is still the inner page blueprint from [page-blueprint.md](./page-blueprint.md).

## 1. Scope

- default scope: whole-page `create` / `replace` runs before the first write
- do **not** use this file as the default answer shape for localized low-level edits
- do **not** treat the ASCII preview as readback or persistence proof

## 2. Default prewrite output

Before the first whole-page `applyBlueprint`, default to:

1. one short summary of the page intent
2. one ASCII wireframe rendered from the same blueprint
3. assumptions / open questions outside the payload only when they matter
4. if duplicate menu-group titles are in play, name the chosen destination routeId outside the wireframe
5. if review is required, one confirmation question; otherwise one short execution notice and continue

Default to **ASCII-first** prewrite output. Do **not** dump the full JSON blueprint unless:

- the user explicitly asks to see the blueprint, or
- you are about to write and a technical blueprint review is still needed

## 3. Rendering rules

- render from the same inner page blueprint that would be written later
- page header should show page title plus `mode`
- show `MENU` for create runs when it is known
- when duplicate same-title menu groups exist, show the chosen routeId next to `MENU`
- show `TARGET` for replace runs when `target.pageSchemaUid` is known
- every tab should render as its own ASCII box
- every block should render as its own ASCII box with `type`, optional title, collection, key, and optional `span`
- summarize fields / actions / recordActions instead of dumping every property
- default field/action summary should show a few items and collapse the rest as `+N more`
- if `tab.layout.rows` / `popup.layout.rows` exists, show **row grouping** only; do not attempt pixel-accurate column drawing
- if no layout is present, render blocks in vertical order

## 4. Popup depth

- default popup expansion depth is exactly **1**
- first-level popup content may be expanded
- deeper nested popup entries should stay visible only as an entry label such as `nested popup omitted`
- if deeper popup content is omitted, mention that omission in warnings or surrounding explanation

## 5. Runtime helper

Use the zero-dependency preview helper for deterministic output:

- module: `renderPageBlueprintAsciiPreview(blueprint)`
- CLI: `node ./runtime/bin/nb-page-preview.mjs --stdin-json`
- prepare-write helper: `prepareApplyBlueprintRequest(blueprint)`
- prepare-write CLI: `node ./runtime/bin/nb-page-preview.mjs --stdin-json --prepare-write`

The CLI/helper should prefer the inner page blueprint object. If it receives an outer `{ requestBody: ... }` wrapper, it may unwrap it with a warning rather than failing silently.

For the **first real write**, prefer the prepare-write helper/CLI rather than preview-only mode. It should use the same inner blueprint, render the mandatory ASCII wireframe, validate the high-risk write-shape mistakes locally, and return the normalized `{ requestBody: <blueprint> }` tool-call envelope only when the gate passes.

The local prepare-write gate should reject at least:

- stringified outer `requestBody`
- extra outer tabs for a normal single-page request
- illegal tab keys such as `pageSchemaUid` / `requestBody` / `target`
- block-level `layout`
- non-object `tab.layout` / `popup.layout`
- custom `edit` popups that do not contain exactly one `editForm`

If the helper is unavailable in the current execution environment, hand-write a small ASCII wireframe from the same blueprint rather than skipping the preview.

Do **not** skip the preview just because execution is going to continue immediately afterward.

## 6. See also

- [page-intent.md](./page-intent.md)
- [page-blueprint.md](./page-blueprint.md)
- [execution-checklist.md](./execution-checklist.md)
- [verification.md](./verification.md)
