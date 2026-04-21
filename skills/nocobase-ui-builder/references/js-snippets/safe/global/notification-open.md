# global/notification-open

## Use when
A longer notification is needed after action-style RunJS.

## Do not use when
A short toast is sufficient; prefer `global/message-success` or `global/message-error`.

## Surfaces
- `event-flow.execute-javascript`
- `linkage.execute-javascript`
- `js-model.action`

## Required ctx roots
- `ctx.notification`
- `ctx.t`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
ctx.notification.open({
  type: 'success',
  message: ctx.t('Task finished'),
  description: ctx.t('The operation completed successfully.'),
});
```

## Editable slots
- Replace `type`, `message`, and `description`.

## Skill-mode notes
Keep this as feedback logic. Do not put field-value computation in this snippet.
