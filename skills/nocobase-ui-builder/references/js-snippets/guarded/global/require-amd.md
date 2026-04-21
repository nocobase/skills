# global/require-amd

## Use when
Action-style RunJS needs a UMD or AMD package.

## Do not use when
The package has a clean ESM entry; prefer `global/import-esm`.

## Surfaces
- `event-flow.execute-javascript`
- `js-model.action`

## Required ctx roots
- `ctx.requireAsync`
- `ctx.message`
- `ctx.t`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
const lodash = await ctx.requireAsync('lodash@4/lodash.min.js');
const compact = lodash?.compact || ((items) => items.filter(Boolean));
ctx.message.info(String(compact(['a', '', 'b']).join(', ')));
```

## Editable slots
- Replace the package specifier and the loaded API call.

## Skill-mode notes
This is guarded tier only. Use it only for libraries that expose UMD/AMD-compatible globals or returns.
