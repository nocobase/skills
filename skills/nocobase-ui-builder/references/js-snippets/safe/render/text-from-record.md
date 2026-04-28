# render/text-from-record

## Use when
A render JS model should display one text value from the current record.

## Do not use when
The surface should compute and return a value without rendering.
The code is a standalone popup block that needs the popup opener record; use `scene/block/popup-record-summary`.

## Surfaces
- `js-model.render`

## Required ctx roots
- `ctx.record`
- `ctx.render`

## Contract
- Effect style: `render`
- Top-level `return`: optional
- `ctx.render(...)`: required
- Side-effect surface: no

## Normalized snippet

```js
const text = String(ctx.record?.title ?? ctx.record?.name ?? '-');
ctx.render(text);
```

## Editable slots
- Replace `title` and `name` with the record fields to display.

## Skill-mode notes
This follows the strict render-model contract: render output must go through `ctx.render(...)`. Use only after `recordSemantic` proves `ctx.record` is the host record.
