# JSActionModel

## Use it for

- API requests
- batch processing
- record-level operations
- opening drawer, dialog, or page views
- refreshing resources after an action

## Key context

- `ctx.resource`
- `ctx.record`
- `ctx.form`
- `ctx.message`
- `ctx.notification`
- `ctx.openView(...)`

## Default patterns

### Collection-level buttons

- call a resource or custom endpoint
- surface success or failure through `ctx.message` or `ctx.notification`
- refresh the affected resource when needed

### Record-level buttons

- read the current record from `ctx.record`
- avoid guessing the record source from unrelated outer state
- pass explicit popup or openView params when the action opens a child view

## When to read other docs

- popup or openView action: [../patterns/popup-openview.md](../patterns/popup-openview.md)
- rendering code inside the action: [rendering-contract.md](rendering-contract.md)
