# JSEditableFieldModel

## Use it for

- editable text inputs
- custom selectors
- composite input controls
- custom inputs that still need two-way form binding

## Common context

- `ctx.getValue()`
- `ctx.setValue(v)`
- `ctx.value`
- `ctx.form`
- `ctx.formValues`
- `ctx.record`
- `ctx.render()`

`ctx.value` is closer to a read-only snapshot. Editable flows should usually use `ctx.getValue()` and `ctx.setValue(v)`.

## Default pattern

- read the current value through `ctx.getValue()`
- update it through `ctx.setValue(v)`
- render the control through `ctx.render(...)`

## Helpful extra context

- `ctx.namePath`
- `ctx.disabled`
- `ctx.readOnly`

## Do not default to

- uncontrolled DOM manipulation
- `ctx.value = ...`
- read-only rendering patterns from `JSFieldModel`

## Minimal decision rule

- read-only display -> `JSFieldModel`
- editable input -> `JSEditableFieldModel`
- helper region not bound to a field slot -> `JSItemModel`
