# JSBlockModel

## Use it for

- banners
- metric panels
- explanatory panels
- third-party visualization containers

## Structural reminders

- code lives at `stepParams.jsSettings.runJs.code`
- `version` defaults to `v2`
- `runJs` uses raw params; do not rewrap `code`
- JSBlock runs inside a restricted RunJS sandbox
- initialize `ctx.resource` manually when structured data is needed
- prefer `ctx.user` or `ctx.auth?.user` for the current user
- use resource APIs for collection `:list` or `:get` reads
- `ctx.element` may still exist upstream, but the skill does not accept direct `innerHTML` as the default path

## Default pattern

- fetch or initialize structured data through resource APIs
- render through `ctx.render(...)`
- keep DOM interop minimal and explicit

## Data-access reminder

- block payload `dataScope.filter` uses `{ logic, items }`
- RunJS `ctx.request({ params: { filter } })` and `resource.setFilter()` use server query-object filters

## Do not default to

- raw `fetch`
- `localStorage`
- arbitrary `window.*`
- direct `ctx.element.innerHTML`
- `return value` as the render result

## Continue reading

- external libraries: [runjs-overview.md](runjs-overview.md)
- stricter rendering rules: [rendering-contract.md](rendering-contract.md)
