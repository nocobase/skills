# global/import-esm

## Use when
Action-style RunJS needs an ESM package or CSS module.

## Do not use when
The dependency is UMD/AMD only; use `global/require-amd`.

## Surfaces
- `event-flow.execute-javascript`
- `js-model.action`

## Required ctx roots
- `ctx.importAsync`
- `ctx.message`
- `ctx.t`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
const module = await ctx.importAsync('dayjs@1.11.10/+esm');
const dayjs = module?.default || module;
ctx.message.info(dayjs ? dayjs(new Date()).format('YYYY-MM-DD') : ctx.t('Module loaded'));
```

## Editable slots
- Replace the package specifier and the fallback behavior.

## Skill-mode notes
This is guarded tier only. Keep imported modules local to the snippet, and do not treat CDN/module loading as a first-hop default.
