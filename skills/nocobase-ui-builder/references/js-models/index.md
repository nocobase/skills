# JS model and RunJS index

## Read this first when the task involves

- `JSBlockModel`
- `JSColumnModel`
- `JSFieldModel`
- `JSEditableFieldModel`
- `JSItemModel`
- `JSActionModel`
- any `stepParams.jsSettings.runJs` or `clickSettings.runJs` code generation

## Hard rules

- rendering JS models should use `ctx.render()` by default
- `ctx.element.innerHTML = ...` is not the default path
- `return value` is not the default rendering protocol for rendering JS models
- `JSActionModel` mainly owns click logic, not rendering
- do not assume browser globals such as `fetch`, `localStorage`, or arbitrary `window.*`
- current user data should come from `ctx.user` or `ctx.auth?.user`
- NocoBase resource reads should use `ctx.initResource()` plus `ctx.resource`, or `ctx.makeResource()`
- `ctx.request()` is only a fallback for custom endpoints or request-only cases
- after generating RunJS, review it for accidental `fetch(` or `ctx.request()` calls that should have been resource APIs
- native relation-title columns should not default to JS models

## Recommended reading order

1. [runjs-overview.md](runjs-overview.md)
2. [rendering-contract.md](rendering-contract.md) for rendering models
3. Then the model-specific doc:
   - [js-block.md](js-block.md)
   - [js-column.md](js-column.md)
   - [js-field.md](js-field.md)
   - [js-editable-field.md](js-editable-field.md)
   - [js-item.md](js-item.md)
   - [js-action.md](js-action.md)

## Quick model guide

- `JSBlockModel`: page or block-level custom surface
- `JSColumnModel`: custom table cell rendering
- `JSFieldModel`: read-only field-position rendering
- `JSEditableFieldModel`: editable field-position rendering
- `JSItemModel`: free-form helper region inside forms or details grids
- `JSActionModel`: custom click behavior

`JSBlockModel` does not prebind `ctx.resource`; initialize it explicitly when needed.
