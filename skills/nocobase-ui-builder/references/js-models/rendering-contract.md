# JS rendering contract

## Applies to

- `JSBlockModel`
- `JSColumnModel`
- `JSFieldModel`
- `JSEditableFieldModel`
- `JSItemModel`

## Hard rules

- rendering JS models must use `ctx.render()` by default
- `ctx.element.innerHTML = ...` is not the default template path
- `return value` is not the rendering contract

## Why

- `ctx.render()` already renders into the right container
- `ctx.render()` can normalize HTML strings, DOM nodes, and React-root style output
- `ctx.element` still exists, but it is a container concept rather than the default rendering sink

## Default templates

Allowed outputs through `ctx.render()` include:

- HTML strings
- JSX or React-style trees
- DOM nodes

## `ctx.element` usage

It may still be used for:

1. explaining what the default render container is
2. obtaining a native DOM anchor for overlays or low-level interop

## Wrong examples

- treating a returned value as if it were the render result
- writing DOM directly as the default path

## Correct example

Render the final output through `ctx.render(...)` and keep low-level DOM manipulation as an exception, not the baseline.
