# global/message-success

## Use when
You only need a success toast after an action-style RunJS step.

## Do not use when
The surface must compute and return a value.

## Surfaces
- `event-flow.execute-javascript`
- `linkage.execute-javascript`
- `js-model.action`

## Required ctx roots
- `ctx.message`
- `ctx.t`

## Contract
- Effect style: `action`
- Top-level `return`: optional
- `ctx.render(...)`: do not use
- Side-effect surface: yes

## Normalized snippet

```js
ctx.message.success(ctx.t('Operation succeeded'));
```

## Editable slots
- Replace `Operation succeeded` with the final message key/text.

## Skill-mode notes
Write through `nb api flow-surfaces <action>`. If the response returns `errors[]`, fix the payload and retry.
