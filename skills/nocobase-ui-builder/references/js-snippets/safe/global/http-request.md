# global/http-request

## Use when
Action-style RunJS must call a custom HTTP endpoint.

## Do not use when
The target is a NocoBase `collection:list` or `collection:get` resource; use `global/resource-list` or `global/resource-get`.

## Surfaces
- `event-flow.execute-javascript`
- `js-model.action`

## Required ctx roots
- `ctx.request`
- `ctx.message`
- `ctx.t`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
try {
  const response = await ctx.request({
    url: 'https://example.com/api/status',
    method: 'get',
    skipNotify: true,
  });
  console.log(response?.data ?? response);
  ctx.message.success(ctx.t('Request completed'));
} catch (error) {
  ctx.message.error(error?.message || ctx.t('Request failed'));
}
```

## Editable slots
- Replace the URL and success/error messages.

## Skill-mode notes
Keep NocoBase resource reads off `ctx.request(...)`; the guard will reroute those to resource APIs.
