# global/window-open

## Use when
An action-style script must open an external URL.

## Do not use when
The user wants a NocoBase popup or drawer; configure popup/action/field popup outside JS instead.

## Surfaces
- `event-flow.execute-javascript`
- `js-model.action`

## Required ctx roots
- `ctx.getVar`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: guarded browser navigation

## Normalized snippet

```js
const record = (await ctx.getVar('ctx.record')) || {};
const targetUrl = String(record.url || 'https://example.com');
window.open(targetUrl, '_blank', 'noopener,noreferrer');
```

## Editable slots
- Replace the URL source and fallback.

## Skill-mode notes
This is guarded tier and must not be listed in first-hop surface recommendations.
