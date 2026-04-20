# JS Column

## Introduction

JS Column is used for "custom columns" in tables, rendering the content of each row's cell via JavaScript. It is not bound to a specific field and is suitable for scenarios such as derived columns, combined displays across fields, status badges, action buttons, and remote data aggregation.

> Local skill note: validate final code with [js.md](../../../../../../references/js.md) and [runjs-runtime.md](../../../../../../references/runjs-runtime.md). Under this skill, do not emit direct `ctx.openView(...)` as the final answer; prefer clickable-field popups, popup actions, or event flows outside the JS snippet.


![jscolumn-add-20251029](https://static-docs.nocobase.com/jscolumn-add-20251029.png)


## Runtime Context API

When rendering each cell, JS Column provides the following context APIs:

- `ctx.element`: The DOM container of the current cell (ElementProxy), supporting `innerHTML`, `querySelector`, `addEventListener`, etc.
- `ctx.record`: The current row's record object (read-only).
- `ctx.recordIndex`: The row index within the current page (starts from 0, may be affected by pagination).
- `ctx.collection`: The metadata of the collection bound to the table (read-only).
- `ctx.request(options)` / `ctx.api.request(options)`: Send an HTTP request. Under skill-mode, prefer full `http/https` URLs.
- `ctx.requireAsync(url)`: Asynchronously loads an AMD/UMD library by URL.
- `ctx.importAsync(url)`: Dynamically imports an ESM module by URL.
- `ctx.openView(viewUid, options)`: Opens a configured view (modal/drawer/page) in the product runtime, but this skill does not accept direct `ctx.openView(...)` as final output.
- `ctx.i18n.t()` / `ctx.t()`: Internationalization.
- `ctx.onRefReady(ctx.ref, cb)`: Renders after the container is ready.
- `ctx.libs.React` / `ctx.libs.ReactDOM` / `ctx.libs.antd` / `ctx.libs.antdIcons` / `ctx.libs.dayjs` / `ctx.libs.lodash` / `ctx.libs.math` / `ctx.libs.formula`: Built-in React, ReactDOM, Ant Design, Ant Design icons, dayjs, lodash, math.js, and formula.js libraries for JSX rendering, date-time utilities, data manipulation, and mathematical operations. (`ctx.React` / `ctx.ReactDOM` / `ctx.antd` are kept for compatibility.)
- `ctx.render(vnode)`: Renders a React element/HTML/DOM to the default container `ctx.element` (the current cell). Multiple renders will reuse the Root and overwrite the existing content of the container.

## Editor and Snippets

The script editor for JS Column supports syntax highlighting, error hints, and built-in code snippets.

- `Snippets`: Opens the list of built-in code snippets, allowing you to search and insert them at the current cursor position with one click.
- `Run`: Runs the current code directly. The execution log is output to the `Logs` panel at the bottom, supporting `console.log/info/warn/error` and error highlighting.


![jscolumn-toolbars-20251029](https://static-docs.nocobase.com/jscolumn-toolbars-20251029.png)


The product UI can also invoke the built-in AI employee to help draft or revise scripts. That product page is not included in this local snapshot.

## Common Usage

### 1) Basic Rendering (Reading the current row record)

```js
ctx.render(<span className="nb-js-col-name">{ctx.record?.name ?? '-'}</span>);
```

### 2) Using JSX to Render React Components

```js
const { Tag } = ctx.libs.antd;
const status = ctx.record?.status ?? 'unknown';
const color = status === 'active' ? 'green' : status === 'blocked' ? 'red' : 'default';
ctx.render(
  <div style={{ padding: 4 }}>
    <Tag color={color}>{String(status)}</Tag>
  </div>
);
```

### 3) Click Feedback Instead of Direct View Opening

```js
const { Button } = ctx.libs.antd;

ctx.render(
  <Button
    type="link"
    onClick={() => ctx.message.info(ctx.t('Configure a clickable-field popup or popup action outside this JS column.'))}
  >
    {ctx.t('Open configured popup')}
  </Button>
);
```

### 4) Loading Third-Party Libraries (AMD/UMD or ESM)

```js
// AMD/UMD
const _ = await ctx.requireAsync('https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js');
const items = _.take(Object.keys(ctx.record || {}), 3);
ctx.render(<code>{items.join(', ')}</code>);

// ESM
const { default: dayjs } = await ctx.importAsync('https://cdn.jsdelivr.net/npm/dayjs/+esm');
ctx.render(<span>{dayjs().format('YYYY-MM-DD')}</span>);
```

## Notes

- It is recommended to use a trusted CDN for loading external libraries and to have a fallback for failure scenarios (e.g., `if (!lib) return;`).
- It is recommended to use `class` or `[name=...]` selectors instead of fixed `id`s to prevent duplicate `id`s across multiple blocks or modals.
- Event Cleanup: Table rows can change dynamically with pagination or refresh, causing cells to re-render multiple times. You should clean up or deduplicate event listeners before binding them to avoid repeated triggers.
- Performance Tip: Avoid repeatedly loading large libraries in every cell. Instead, cache the library at a higher level (e.g., using a global or table-level variable) and reuse it.
