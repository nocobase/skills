# CreateFormModel

## Applies to

- `CreateFormModel`
- `FormGridModel`
- `FormItemModel`
- `FormSubmitActionModel`

Typical targets:

- table-level create popup or drawer
- create form for related records inside details
- create form inside a popup page

## Pre-write checklist

1. Read schema for `CreateFormModel`, `FormGridModel`, `FormItemModel`, and `FormSubmitActionModel`
2. Decide whether the task needs only a form shell or a truly fillable form
3. If the form opens through popup or openView, read [../patterns/popup-openview.md](../patterns/popup-openview.md)
4. If the form assigns relations or parent-child bindings, read [../patterns/relation-context.md](../patterns/relation-context.md)

## Minimal success tree

Shell-only minimum:

- `CreateFormModel`
- `subModels.grid`
- `subModels.actions[*] = FormSubmitActionModel`

Fillable form minimum:

- the shell above
- at least one `FormItemModel`
- each `FormItemModel` explicitly includes `subModels.field`
- `subModels.field.use` comes from the editable field candidates exposed by the current schema and field binding
- every critical field has a real renderer or field subtree

Important reminders:

- `FormSubmitActionModel` belongs in `CreateFormModel.subModels.actions`, not `FormGridModel.subModels.items`
- `FormItemModel.stepParams.fieldSettings.init.fieldPath` only binds the field path; it does not replace `subModels.field`

## Done criteria

- if the user only asks for a create entrypoint, a shell may count as partial completion, but the lack of field items must be explicit
- if the user asks for a real business form such as create order or create invoice, a shell alone is not complete
- in validation, opening an empty form shell does not count as usable

## Common traps

- only `CreateFormModel + grid + submit`, with no field items
- submit action exists, but there is no explanation of what data it can submit
- parent-child relations depend on runtime assignment with no explicit rule or context
- `fieldPath` is correct, but `FormItemModel.subModels.field` is missing
- `FormSubmitActionModel` is placed into `grid.items`, so the button renders in the wrong area

## Related patterns

- [../patterns/popup-openview.md](../patterns/popup-openview.md)
- [../patterns/relation-context.md](../patterns/relation-context.md)

## Fallback policy

- if field-item schema is still ambiguous, keep a stable shell first
- but report it explicitly as "form shell completed, field items incomplete" instead of success
