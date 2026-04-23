# global/message-error

## Use when
You need a simple error toast from action-style RunJS.

## Do not use when
The code should return a computed field value.

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
ctx.message.error(ctx.t('Operation failed'));
```

## Editable slots
- Replace `Operation failed` with the user-facing error text.

## Skill-mode notes
Do not read an undeclared bare `error`; catch blocks must declare their own `error` binding.
