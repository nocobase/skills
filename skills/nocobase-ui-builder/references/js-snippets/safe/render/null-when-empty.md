# render/null-when-empty

## Use when
A render JS model should hide its output when the source value is empty.

## Do not use when
The host is a value-return surface; use `return null` there instead.

## Surfaces
- `js-model.render`

## Required ctx roots
- `ctx.libs`
- `ctx.value`
- `ctx.getVar`
- `ctx.render`

## Contract
- Effect style: `render`
- Top-level `return`: optional
- `ctx.render(...)`: required
- Side-effect surface: no

## Normalized snippet

```js
const { Typography } = ctx.libs.antd;
const currentRecord = await ctx.getVar('ctx.record');
const value = ctx.value ?? currentRecord?.description ?? '';
if (String(value).trim() === '') {
  ctx.render(null);
  return;
}

ctx.render(<Typography.Text>{String(value)}</Typography.Text>);
```

## Editable slots
- Replace `description` with the fallback record field.

## Skill-mode notes
Use `ctx.render(null)` for hidden render output; visible output should use Ant Design JSX.
