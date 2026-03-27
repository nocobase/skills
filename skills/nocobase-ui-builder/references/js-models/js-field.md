# JSFieldModel

## Use it for

- custom read-only fields inside details blocks
- read-only custom items placed in form field positions

## Common context

- `ctx.value`
- `ctx.record`
- `ctx.collection`
- `ctx.render()`

## Default read-only pattern

- derive display text from `ctx.value` or `ctx.record`
- render through `ctx.render(...)`
- keep the component read-only

## Do not default to

- direct DOM writes
- editable control patterns
- `return value` as the render result
