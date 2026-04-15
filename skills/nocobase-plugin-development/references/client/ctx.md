# FlowContext (ctx)

> Read when accessing any context data — in plugin `load()` (via `this.context`), in registerFlow handlers (via `ctx`), or in React components (via `useFlowContext()`). This includes user info, API client, router, theme tokens, and all other global state.

## Accessing ctx

In **registerFlow handlers**:
```ts
MyModel.registerFlow({
  key: 'myFlow',
  on: 'click',
  steps: {
    step1: {
      async handler(ctx, params) {
        // ctx is FlowRuntimeContext -- includes model, api, viewer, etc.
      },
    },
  },
});
```

In **React components**:
```tsx
import { useFlowContext } from '@nocobase/flow-engine';

export default function MyPage() {
  const ctx = useFlowContext();
  // ctx is FlowEngineContext -- same object as this.context in Plugin
}
```

## ctx Properties Reference

### Data & Model

| Property | Type | Description |
|---|---|---|
| `ctx.model` | FlowModel | Current model instance. Access `ctx.model.props`, `ctx.model.context` |
| `ctx.blockModel` | FlowModel | Parent block model (in action/field handlers) |

### API & Resources

| Property | Type | Description |
|---|---|---|
| `ctx.api` | APIClient | HTTP client (Axios-compatible). `ctx.api.request({ url, method, data })` |
| `ctx.makeResource(ResourceClass)` | Function | Create a resource instance (MultiRecordResource / SingleRecordResource) |
| `ctx.request(config)` | Function | Shortcut for ctx.api.request() |

### UI Feedback

| Property | Type | Description |
|---|---|---|
| `ctx.viewer` | ViewerManager | Open dialogs/drawers: `ctx.viewer.dialog({...})`, `ctx.viewer.drawer({...})` |
| `ctx.message` | AntdMessage | Antd message API: `ctx.message.success('Done')`, `.error()`, `.warning()`, `.info()` |
| `ctx.notification` | AntdNotification | Antd notification API: `ctx.notification.success({ message, description })` |

### i18n

| Property | Type | Description |
|---|---|---|
| `ctx.t(key, options?)` | Function | Translate string. Requires `{ ns: 'package-name' }` unless using this.t() in Plugin |

### Routing

| Property | Type | Description |
|---|---|---|
| `ctx.router` | ReactRouter | Page navigation: `ctx.router.navigate('/path')` |
| `ctx.route` | RouteOptions | Current route info: `ctx.route.params`, `ctx.route.name`, `ctx.route.path` |
| `ctx.location` | Location | Current URL: `ctx.location.pathname`, `.search`, `.hash` |

### Auth & User

| Property | Type | Description |
|---|---|---|
| `ctx.token` | string | Current auth token |
| `ctx.role` | string | Current user role |
| `ctx.auth` | AuthManager | Authentication manager |

### Theme

| Property | Type | Description |
|---|---|---|
| `ctx.themeToken` | AntdThemeToken | Ant Design theme tokens for dynamic styling |

### Flow Control

| Method | Description |
|---|---|
| `ctx.exit()` | Stop executing remaining steps in the current flow |
| `ctx.exitAll()` | Stop executing all remaining flows for this event |
| `ctx.getStepParams(flowKey, stepKey)` | Read persisted params of any step |
| `ctx.setStepParams(flowKey, stepKey, params)` | Write params for any step |

## Usage Examples

### API Request in Flow Handler

```ts
async handler(ctx, params) {
  const response = await ctx.api.request({
    url: 'myResource:list',
    method: 'get',
    params: { filter: { status: 'active' } },
  });
  const items = response.data.data;
}
```

### Open Dialog

```ts
async handler(ctx) {
  ctx.viewer.dialog({
    title: ctx.t('Edit Item'),
    content: (view) => (
      <MyForm
        onSubmit={async (values) => {
          await ctx.api.request({ url: 'items:create', method: 'post', data: values });
          ctx.message.success(ctx.t('Created successfully'));
          view.close();
        }}
        onCancel={() => view.close()}
      />
    ),
  });
}
```

### Open Drawer

```ts
async handler(ctx) {
  ctx.viewer.drawer({
    title: ctx.t('Details'),
    content: (view) => (
      <DetailView onClose={() => view.close()} />
    ),
  });
}
```

### Access Record Data (in record-level action)

```ts
async handler(ctx) {
  const record = ctx.model.context.record;       // current row data
  const index = ctx.model.context.recordIndex;    // current row index
  const resource = ctx.blockModel?.resource;       // parent block's resource
}
```

### Flow Control

```ts
async handler(ctx, params) {
  if (!params.confirmed) {
    ctx.exit();  // stop this flow's remaining steps
    return;
  }
  // or stop all flows for this event:
  // ctx.exitAll();
}
```

### Navigation

```ts
// In component
const ctx = useFlowContext();
ctx.router.navigate('/my-page');

// Read route params
const { id } = ctx.route.params;
```

## Deep Reference

- https://docs.nocobase.com/cn/plugin-development/client/ctx/common-capabilities.md

## Related

- [./component.md](./component.md) -- using ctx in React components
- [./flow.md](./flow.md) -- registerFlow where ctx is used in handlers
- [./resource.md](./resource.md) -- ctx.makeResource() for data operations
- [./plugin.md](./plugin.md) -- this.context is the same ctx object
