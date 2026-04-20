# JS Action

## Introduction

JS Action is used to execute JavaScript when a button is clicked, allowing for custom business logic. It can be used in form toolbars, table toolbars (collection-level), table rows (record-level), and other locations to perform operations like validation, showing notifications, making API calls, opening pop-ups/drawers, and refreshing data.

> Local skill note: validate final code with [js.md](../../../../../../references/js.md) and [runjs-runtime.md](../../../../../../references/runjs-runtime.md). Under this skill, prefer full `http/https` request URLs and use popup actions, field popups, or event flows instead of emitting direct `ctx.openView(...)` as the final answer.


![jsaction-add-20251029](https://static-docs.nocobase.com/jsaction-add-20251029.png)


## Runtime Context API (Commonly Used)

- `ctx.request(options)` / `ctx.api.request(options)`: Makes an HTTP request. Under skill-mode, prefer full `http/https` URLs.
- `ctx.openView(viewUid, options)`: Opens a configured view (drawer/dialog/page) in the product runtime, but this skill does not accept direct `ctx.openView(...)` as final output.
- `ctx.message` / `ctx.notification`: Global messages and notifications.
- `ctx.t()` / `ctx.i18n.t()`: Internationalization.
- `ctx.resource`: Data resource for collection-level context (e.g., table toolbar), including methods like `getSelectedRows()` and `refresh()`.
- `ctx.record`: The current row record for record-level context (e.g., table row button).
- `ctx.form`: The AntD Form instance for form-level context (e.g., form toolbar button).
- `ctx.collection`: Metadata of the current collection.
- `ctx.initResource(...)` + `ctx.resource` or `ctx.makeResource(...)`: Preferred way to access NocoBase resources under skill-mode.
- The code editor supports `Snippets` and `Run` for pre-execution (see below).

- `ctx.requireAsync(url)`: Asynchronously loads an AMD/UMD library from a URL.
- `ctx.importAsync(url)`: Dynamically imports an ESM module from a URL.
- `ctx.libs.React` / `ctx.libs.ReactDOM` / `ctx.libs.antd` / `ctx.libs.antdIcons` / `ctx.libs.dayjs` / `ctx.libs.lodash` / `ctx.libs.math` / `ctx.libs.formula`: Built-in React, ReactDOM, Ant Design, Ant Design icons, dayjs, lodash, math.js, and formula.js libraries for JSX rendering, date-time utilities, data manipulation, and mathematical operations.

> The actual available variables may differ depending on the button's location. The list above is an overview of common capabilities.

## Editor and Snippets

- `Snippets`: Opens a list of built-in code snippets that can be searched and inserted at the current cursor position with a single click.
- `Run`: Executes the current code directly and outputs the execution logs to the `Logs` panel at the bottom. It supports `console.log/info/warn/error` and highlights errors for easy location.


![jsaction-toolbars-20251029](https://static-docs.nocobase.com/jsaction-toolbars-20251029.png)


- The product UI can also invoke the built-in AI employee to help draft or revise scripts. That product page is not included in this local snapshot.

## Common Usage (Simplified Examples)

### 1) API Request and Feedback

```js
try {
  const resp = await ctx.request({
    url: 'https://jsonplaceholder.typicode.com/users?_limit=5',
    method: 'get',
  });
  const rows = Array.isArray(resp?.data) ? resp.data : [];
  console.log(ctx.t('Loaded rows:'), rows);
  ctx.message.success(ctx.t('Loaded users'));
} catch (error) {
  ctx.message.error(error?.message || ctx.t('Request failed'));
}
```

### 2) Collection Button: Validate Selection and Process

```js
const rows = ctx.resource?.getSelectedRows?.() || [];
if (!rows.length) {
  ctx.message.warning(ctx.t('Please select records'));
  return;
}
// TODO: Implement business logic...
ctx.message.success(ctx.t('Selected {n} items', { n: rows.length }));
```

### 3) Record Button: Read Current Row Record

```js
if (!ctx.record) {
  ctx.message.error(ctx.t('No record'));
} else {
  ctx.message.success(ctx.t('Record ID: {id}', { id: ctx.record.id }))
}
```

### 4) Popup Guidance Instead of Direct `ctx.openView(...)`

If the user wants a popup or drawer, prefer a configured popup action, a field popup, or an event flow outside the JS snippet. `ctx.openView(...)` still exists in the product runtime, but this skill keeps it as reference-only behavior rather than final output.

### 5) Refresh Data After Submission

```js
// General refresh: Prioritize table/list resources, then the resource of the block containing the form
if (ctx.resource?.refresh) await ctx.resource.refresh();
else if (ctx.blockModel?.resource?.refresh) await ctx.blockModel.resource.refresh();
```

## Notes

- **Idempotent Actions**: To prevent multiple submissions from repeated clicks, you can add a state flag in your logic or disable the button.
- **Error Handling**: Add try/catch blocks for API calls and provide user-friendly feedback.
- **View Interaction**: When opening a pop-up/drawer with `ctx.openView`, it's recommended to pass parameters explicitly and, if necessary, actively refresh the parent resource after a successful submission.

## Related Documents

- [Variables and Context](../../variables.md)
- [Linkage rule](../../linkage-rule.md)
- [ctx.openView() runtime reference](../../../runjs/context/open-view.md)
