# ctx.openView()

Programmatically open a specified view (drawer, dialog, embedded page, etc.). Provided by `FlowModelContext`, it is used to open configured popup-capable FlowModel views in scenarios such as `JSBlock`, table cells, and workflows; the rendered target may contain a `ChildPage`.

> Local skill note: this page documents product/runtime capability only. Do not emit bare `ctx.openView(...)` with a transient uid, `ChildPageModel`, page, tab, or popup subtree uid as the final answer for this skill. Use this page as reference, then return to [js-reference-index.md](../../../../../references/js-reference-index.md) and [js.md](../../../../../references/js.md). Final skill output should first resolve a template-first popup-capable FlowModel, preferably preserving `popupTemplateUid` / `popupTemplateMode`, and should prefer `await ctx.getVar('ctx.record...')` for record variable values.

## Use Cases

| Scenario | Description |
|------|------|
| **JSBlock** | Open a detail/edit dialog after a button click, passing the current row's `filterByTk`. |
| **Table Cell** | Render a button within a cell that opens a row detail dialog when clicked. |
| **Workflow / JSAction** | Open the next view or a dialog after a successful operation. |
| **Association Field** | Open a selection/edit dialog via `ctx.runAction('openView', params)`. |

> Skill-mode note: `ctx.openView` is available in a RunJS environment where a `FlowModel` context exists, but final skill output must treat a missing `uid` as invalid. Resolve the opener with readback first and pass only an existing popup-capable FlowModel `triggerUid`.

## Signature

```ts
openView(uid: string, options?: OpenViewOptions): Promise<void>
```

## Parameters

### uid

The unique identifier of an existing popup-capable FlowModel to open. Under this skill, use a `triggerUid` from readback, usually a persisted popup host/action whose `popupSettings.openView.uid` points at the intended target. Do not construct ad-hoc uids in JS.

### Common options Fields

| Field | Type | Description |
|------|------|------|
| `mode` | `drawer` / `dialog` / `embed` | Opening method: drawer, dialog, or embedded. Defaults to `drawer`. |
| `size` | `small` / `medium` / `large` | Size of the dialog or drawer. Defaults to `medium`. |
| `title` | `string` | View title. |
| `params` | `Record<string, any>` | Arbitrary parameters passed to the view. |
| `filterByTk` | `any` | Primary key value, used for single record detail/edit scenarios. |
| `sourceId` | `string` | Source record ID, used in association scenarios. |
| `dataSourceKey` | `string` | Data source. |
| `collectionName` | `string` | Collection name. |
| `associationName` | `string` | Association field name. |
| `navigation` | `boolean` | Whether to use route navigation. If `defineProperties` or `defineMethods` are provided, this is forced to `false`. |
| `preventClose` | `boolean` | Whether to prevent closing. |
| `defineProperties` | `Record<string, PropertyOptions>` | Dynamically inject properties into the model within the view. |
| `defineMethods` | `Record<string, Function>` | Dynamically inject methods into the model within the view. |

## Examples

### Basic Usage: Open a Drawer

```ts
const triggerUid = 'replace-with-persisted-popup-flowmodel-uid';
await ctx.openView(triggerUid, {
  mode: 'drawer',
  size: 'medium',
  title: ctx.t('Details'),
});
```

### Passing Current Row Context

```ts
const triggerUid = 'replace-with-persisted-popup-flowmodel-uid';
const primaryKey = ctx.collection?.primaryKey || 'id';
const record = (await ctx.getVar('ctx.record')) || {};
await ctx.openView(triggerUid, {
  mode: 'dialog',
  title: ctx.t('Row Details'),
  filterByTk: record?.[primaryKey],
});
```

### Open via runAction

When a model is configured with an `openView` action (such as association fields or clickable fields), you can call:

```ts
await ctx.runAction('openView', {
  navigation: false,
  mode: 'dialog',
  collectionName: 'users',
  filterByTk: await ctx.getVar('ctx.record.id'),
});
```

### Injecting Custom Context

```ts
const triggerUid = 'replace-with-persisted-popup-flowmodel-uid';
await ctx.openView(triggerUid, {
  mode: 'drawer',
  filterByTk: await ctx.getVar('ctx.record.id'),
  defineProperties: {
    drilldownValue: {
      value: 'High',
      meta: {
        title: ctx.t('Drilldown value'),
        type: 'string',
      },
    },
    onSaved: {
      get: () => () => ctx.resource?.refresh?.(),
      cache: false,
    },
  },
});
```

## Relationship with ctx.viewer and ctx.view

| Purpose | Recommended Usage |
|------|----------|
| **Open a configured flow view** | `ctx.openView(uid, options)` |
| **Open custom content (no flow)** | `ctx.viewer.dialog()` / `ctx.viewer.drawer()` |
| **Operate on the currently open view** | `ctx.view.close()`, `ctx.view.inputArgs` |

`ctx.openView` opens the configured flow view for the resolved popup-capable FlowModel; the content behind that opener may render a `ChildPageModel`. In skill-mode final output, `ChildPageModel` is rendered content, not the `triggerUid`. `ctx.viewer` opens arbitrary React content.

## Notes

- Resolve the `uid` from an existing popup-capable FlowModel before writing final skill output; do not invent a uid from `ctx.model.uid`.
- When `defineProperties` or `defineMethods` are passed, `navigation` is forced to `false` to prevent context loss after a refresh.
- Inside the dialog, `ctx.view` refers to the current view instance, and `ctx.view.inputArgs` can be used in JavaScript to read the parameters passed during opening.
- When the opened view's blocks or settings need variables, such as a table data scope inside a chart drill-down dialog, pass them through `defineProperties` with `meta` and reference them as top-level variables like `{{ ctx.drilldownValue }}`.

## Related

- [ctx.view](./view.md): The currently open view instance.
- [ctx.model](./model.md): The current model context; do not use it to invent popup trigger uids in final skill output.
