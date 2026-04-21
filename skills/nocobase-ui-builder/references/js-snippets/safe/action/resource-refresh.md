# action/resource-refresh

## Use when
A collection-level JS action should refresh its bound resource.

## Do not use when
The action is form-only and has no resource context.

## Surfaces
- `js-model.action`

## Required ctx roots
- `ctx.resource`
- `ctx.message`
- `ctx.t`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
if (!ctx.resource?.refresh) {
  ctx.message.warning(ctx.t('No resource to refresh'));
  return;
}

await ctx.resource.refresh();
ctx.message.success(ctx.t('Resource refreshed'));
```

## Editable slots
- Replace the warning and success messages.

## Skill-mode notes
Use a collection/table/list action model when this snippet needs `ctx.resource`.
