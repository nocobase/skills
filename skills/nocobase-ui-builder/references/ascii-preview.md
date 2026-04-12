# ASCII Preview for Whole-page Draft Confirmation

Use this file only for **whole-page `executeDsl` drafts** that need user confirmation before writing.

This is a **confirmation view**, not the write payload. The write truth is still the inner page DSL from [ui-dsl.md](./ui-dsl.md).

## 1. Scope

- default scope: whole-page `create` / `replace` drafts only
- do **not** use this file as the default answer shape for localized low-level edits
- do **not** treat the ASCII preview as readback or persistence proof

## 2. Default confirmation output

When the user wants to review a whole page before writing, default to:

1. one short summary of the page intent
2. one ASCII wireframe rendered from the same DSL
3. assumptions / open questions outside the payload
4. one confirmation question

Default to **ASCII-first** confirmation. Do **not** dump the full JSON DSL unless:

- the user explicitly asks to see the DSL, or
- you are about to write and a technical DSL review is still needed

## 3. Rendering rules

- render from the same inner page DSL that would be written later
- page header should show page title plus `mode`
- show `MENU` for create drafts when it is known
- show `TARGET` for replace drafts when `target.pageSchemaUid` is known
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

- module: `renderPageDslAsciiPreview(dsl)`
- CLI: `node ./runtime/bin/nb-page-preview.mjs --stdin-json`

The CLI/helper should prefer the inner page DSL object. If it receives an outer `{ requestBody: ... }` wrapper, it may unwrap it with a warning rather than failing silently.

## 6. See also

- [page-intent.md](./page-intent.md)
- [ui-dsl.md](./ui-dsl.md)
- [execution-checklist.md](./execution-checklist.md)
- [verification.md](./verification.md)
