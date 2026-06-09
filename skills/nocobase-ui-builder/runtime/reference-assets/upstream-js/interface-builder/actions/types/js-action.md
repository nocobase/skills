# JS Action

## Introduction

JS Action is used to execute JavaScript when a button is clicked, allowing for custom business logic. It can be used in form toolbars, table toolbars (collection-level), table rows (record-level), and other locations to perform operations like validation, showing notifications, making API calls, opening pop-ups/drawers, and refreshing data.

> Local skill note: prepare final code with [js.md](../../../../../../references/js.md). Under this skill, prefer full `http/https` request URLs. For popup/drawer/dialog intent, do not emit bare `ctx.openView(...)` against a transient, ChildPage, page, tab, or popup subtree uid. Resolve a template-first persisted popup-capable FlowModel first, then call `ctx.openView(triggerUid, ...)`.
> Final skill output should prefer `await ctx.getVar('ctx.record...')` for record variable values; direct `ctx.record` below is product runtime context documentation.


![jsaction-add-20251029](https://static-docs.nocobase.com/jsaction-add-20251029.png)


## Runtime Context API (Commonly Used)

- `ctx.request(options)` / `ctx.api.request(options)`: Makes an HTTP request. Under skill-mode, prefer full `http/https` URLs.
- `ctx.openView(viewUid, options)`: Opens a configured view (drawer/dialog/page) in the product runtime. Under this skill, use it only with an existing popup-capable FlowModel trigger uid resolved through the template-first popup/openView path.
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
const record = await ctx.getVar('ctx.record');
if (!record) {
  ctx.message.error(ctx.t('No record'));
} else {
  ctx.message.success(ctx.t('Record ID: {id}', { id: record.id }))
}
```

### 4) Template-first Popup Opening

If the user wants a popup or drawer, first create or resolve a persisted template-first popup-capable FlowModel, preferably one preserving `popupTemplateUid` / `popupTemplateMode` on `popupSettings.openView`. The JS action may then call `ctx.openView(triggerUid, ...)`; never use a transient uid, ChildPage uid, page uid, tab uid, or popup subtree uid as the trigger.

### 5) Refresh Data After Submission

```js
// General refresh: Prioritize table/list resources, then the resource of the block containing the form
if (ctx.resource?.refresh) await ctx.resource.refresh();
else if (ctx.blockModel?.resource?.refresh) await ctx.blockModel.resource.refresh();
```

## Notes

- **Idempotent Actions**: To prevent multiple submissions from repeated clicks, you can add a state flag in your logic or disable the button.
- **Error Handling**: Add try/catch blocks for API calls and provide user-friendly feedback.
- **View Interaction**: When opening a pop-up/drawer with `ctx.openView`, use the resolved popup-capable FlowModel trigger uid, pass parameters explicitly, and refresh the parent resource after a successful submission when needed.

## Related Documents

- [Variables and Context](../../variables.md)
- [Linkage rule](../../linkage-rule.md)
- [ctx.openView() runtime reference](../../../runjs/context/open-view.md)
