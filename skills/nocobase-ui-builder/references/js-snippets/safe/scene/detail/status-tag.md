# scene/detail/status-tag

## Use when
A detail/read-only JS field should display one status label from the bound value.

## Do not use when
The status should update another field or trigger side effects; use an action/linkage snippet instead.

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
const { Tag } = ctx.libs.antd;
const currentRecord = await ctx.getVar('ctx.record');
const status = String(ctx.value ?? currentRecord?.status ?? 'unknown');
const color = status === 'active' ? 'green' : status === 'draft' ? 'blue' : 'default';

ctx.render(<Tag color={color}>{status}</Tag>);
```

## Editable slots
- Replace `status` and the color mapping with the final field values.

## Skill-mode notes
This is for display only. Keep detail-field rendering on Ant Design JSX through `ctx.render(...)` and avoid form/action APIs.
