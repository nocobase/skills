# JSColumnModel

## Use it for

- status badges
- multi-field display in one cell
- cell-level buttons or links
- derived or remote display logic

## Default context

- `ctx.record`
- `ctx.recordIndex`
- `ctx.collection`
- `ctx.viewer`
- `ctx.render()`

`ctx.element` may still exist upstream, but the skill still prefers `ctx.render(...)`.

## Default pattern

- derive the display value from `ctx.record`
- render it through `ctx.render(...)`
- keep record actions separate from cell rendering unless the user explicitly asks for a JS solution

## Never default to

- direct `innerHTML`
- `return value` as the render action
- `record` instead of `ctx.record`

## Minimal structure

- `use: JSColumnModel`
- `stepParams.jsSettings.runJs.code`
- rendering logic through `ctx.render(...)`

## Relation to table-column-rendering

- [../patterns/table-column-rendering.md](../patterns/table-column-rendering.md) solves normal display-field columns
- this document solves custom RunJS columns
