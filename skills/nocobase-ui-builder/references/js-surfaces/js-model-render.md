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
const text = String(ctx.record?.title ?? ctx.record?.name ?? '-');
ctx.render(text);
```

## What to open next

- Exact model constraints -> [../js-models/index.md](../js-models/index.md)
- Render contract -> [../js-models/rendering-contract.md](../js-models/rendering-contract.md)
- Snippet metadata -> [../js-snippets/catalog.json](../js-snippets/catalog.json)
- Repair after validator failure -> [../runjs-repair-playbook.md](../runjs-repair-playbook.md)
