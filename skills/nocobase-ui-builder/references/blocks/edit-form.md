# EditFormModel

## Applies to

- `EditFormModel`
- `FormGridModel`
- `FormItemModel`
- `FormSubmitActionModel`

Typical targets:

- table-row edit actions
- edit forms inside popup, drawer, or dialog
- second-layer edit forms for relation records

## Pre-write checklist

1. Read the `EditFormModel` schema
2. Confirm how record context enters the form
3. If the form opens through an action tree, read [../patterns/popup-openview.md](../patterns/popup-openview.md)
4. If the form edits relation records or through records, read [../patterns/relation-context.md](../patterns/relation-context.md)
5. If the action is a record action, read [../patterns/record-actions.md](../patterns/record-actions.md)

## Minimal success tree

Shell-only minimum:

- `EditFormModel`
- explicit record context
- `subModels.grid`
- `subModels.actions[*] = FormSubmitActionModel`

Fillable minimum:

- the shell above
- at least one `FormItemModel`
- each `FormItemModel` explicitly includes `subModels.field`
- `subModels.field.use` comes from the editable field candidates exposed by the current schema and field binding

Important reminders:

- `FormSubmitActionModel` belongs in `EditFormModel.subModels.actions`, not `FormGridModel.subModels.items`
- `FormItemModel.stepParams.fieldSettings.init.fieldPath` only binds the field path; it does not replace `subModels.field`

## Done criteria

- if the user asks to edit a record, explicit record context is required
- a form shell without field items is only partial completion
- if `filterByTk` or equivalent context is only implicit, call out the risk in the final report

## Common traps

- edit action exists, but no explicit record context exists
- a popup shell is used as a substitute for a real editable form
- a nested edit popup depends on outer implicit context and loses the record
- `fieldPath` is correct, but `FormItemModel.subModels.field` is missing
- `FormSubmitActionModel` is placed inside `grid.items`, so it renders in the field area

## Related patterns

- [../patterns/popup-openview.md](../patterns/popup-openview.md)
- [../patterns/relation-context.md](../patterns/relation-context.md)
- [../patterns/record-actions.md](../patterns/record-actions.md)

## Fallback policy

- if record context is still unstable, do not report the edit form as complete
- if only the shell can be persisted, report "edit entry built, record context or field items incomplete"
