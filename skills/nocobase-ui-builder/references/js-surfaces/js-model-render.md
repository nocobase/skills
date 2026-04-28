# JS Model Render

Use this surface for JS models whose main job is to render content in a block, field, item, or column.

## Contract

- Editor scene in the bundled product reference snapshot: `jsModel`
- Writeback path in this skill: `stepParams.jsSettings.runJs`
- Validation style: render
- `ctx.render(...)` is required.
- Do not rely on top-level `return` for rendering.
- Exact modelUse still matters; use `JSBlockModel`, `JSFieldModel`, `JSEditableFieldModel`, `JSItemModel`, `FormJSFieldItemModel`, or `JSColumnModel`.

## Minimal examples

First-hop safe snippets:

- [scene/block/text-summary](../js-snippets/safe/scene/block/text-summary.md)
- [scene/detail/status-tag](../js-snippets/safe/scene/detail/status-tag.md)
- [render/helper-from-form-value](../js-snippets/safe/render/helper-from-form-value.md)

Example:

```js
const record = (await ctx.getVar('ctx.record')) || {};
const text = String(record.title ?? record.name ?? '-');
ctx.render(text);
```

## Record Context

| recordSemantic | Use this ctx path | Notes |
| --- | --- | --- |
| `popup-opener-record` | `await ctx.getVar('ctx.popup.record...')` | Standalone JSBlock in a popup that displays the record used to open the popup. |
| `host-record` | `await ctx.getVar('ctx.record...')` | JS field/column/item is hosted by the data record itself. |
| `inner-row-record` | `await ctx.getVar('ctx.record...')` | JS code belongs to a nested table/list row inside the popup, not the popup opener. |
| `parent-popup-record` | `await ctx.getVar('ctx.popup.parent.record...')` | Nested popup needs the outer popup record. |

For popup-level render blocks, prefer [scene/block/popup-record-summary](../js-snippets/safe/scene/block/popup-record-summary.md) over host-record snippets.

## What to open next

- Exact model constraints -> [../js-models/index.md](../js-models/index.md)
- Render contract -> [../js-models/rendering-contract.md](../js-models/rendering-contract.md)
- Snippet metadata -> [../js-snippets/catalog.json](../js-snippets/catalog.json)
- Repair after validator failure -> [../runjs-repair-playbook.md](../runjs-repair-playbook.md)
