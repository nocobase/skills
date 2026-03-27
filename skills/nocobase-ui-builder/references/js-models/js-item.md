# JSItemModel

## Use it for

- live previews
- helper text
- small interactive helper panels
- summary notes

## Common context

- `ctx.formValues`
- `ctx.record`
- `ctx.resource`
- `ctx.render()`
- `ctx.onRefReady()`

## Default pattern

- derive helper content from form values or record data
- render through `ctx.render(...)`
- treat it as a free-form helper region, not a field binding

## Do not default to

- field-slot rendering that should belong to `JSFieldModel`
- editable field behavior that should belong to `JSEditableFieldModel`
- direct DOM mutation

## Minimal decision rule

- needs synchronized field values but no field slot -> `JSItemModel`
- needs read-only field-position display -> `JSFieldModel`
- needs editable field-position input -> `JSEditableFieldModel`
