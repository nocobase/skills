# global/clipboard-copy-text

## Use when
Action-style RunJS needs to copy text to the browser clipboard.

## Do not use when
The surface must return a value; use a `value-return/*` snippet instead.

## Surfaces
- `event-flow.execute-javascript`
- `linkage.execute-javascript`
- `js-model.action`

## Required ctx roots
- `ctx.record`
- `ctx.message`
- `ctx.t`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
const text = String(ctx.record?.title ?? ctx.t('Copied text'));
await navigator.clipboard.writeText(text);
ctx.message.success(ctx.t('Copied'));
```

## Editable slots
- Replace the source expression and the success text.

## Skill-mode notes
`navigator.clipboard` is allowed by the local RunJS guard; do not use `document.execCommand`.
