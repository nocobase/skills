# RunJS overview

## Core facts

1. top-level `await` is supported
2. external modules can be loaded through `ctx.importAsync()` or `ctx.requireAsync()`
3. rendering JS models should output through `ctx.render()`
4. code runs inside a restricted sandbox and reaches platform context through `ctx`
5. do not assume browser globals such as `fetch`, `localStorage`, or arbitrary `window.*`

Upstream code still keeps `ctx.element` and `innerHTML` compatibility paths, but `nocobase-ui-builder` is intentionally stricter and defaults to `ctx.render(...)`.

## Common capabilities

### Current logged-in user

- prefer `ctx.user`
- fallback to `ctx.auth?.user`
- do not request `auth:check` by default

### Structured data

- JS blocks should initialize resources through `ctx.initResource(type)` and then use `ctx.resource`
- when multiple resources are needed, use `ctx.makeResource(type)`
- block payload `dataScope.filter` uses `{ logic, items }`
- RunJS `resource.setFilter()` and `ctx.request({ params: { filter } })` use server query-object filters

### Remote HTTP

- only use `ctx.request()` for custom endpoints or request-only cases that resource APIs cannot express

## Default coding style

### Rendering models

- `JSBlockModel`
- `JSColumnModel`
- `JSFieldModel`
- `JSEditableFieldModel`
- `JSItemModel`

These should:

- fetch data through resource APIs when possible
- read user context from `ctx.user` or `ctx.auth?.user`
- render through `ctx.render(...)`

### Action models

- `JSActionModel`

These should:

- read the relevant record or form context
- call resource APIs or custom endpoints explicitly
- show user feedback through message or notification helpers

## Do not default to

- direct `ctx.element.innerHTML`
- `return value` as the render result
- assuming `fetch` is available by default
