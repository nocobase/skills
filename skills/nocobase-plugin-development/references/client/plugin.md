# Client Plugin Class

> Read when creating or modifying the client-side plugin entry point (plugin.tsx).

## Template: plugin.tsx

```tsx
// src/client-v2/plugin.tsx
import { Plugin } from '@nocobase/client-v2';

export class PluginMyFeatureClient extends Plugin {
  async load() {
    // 1. Register models (lazy loading)
    this.flowEngine.registerModelLoaders({
      MyBlockModel: {
        loader: () => import('./models/MyBlockModel'),
      },
      MyActionModel: {
        loader: () => import('./models/MyActionModel'),
      },
      MyFieldModel: {
        loader: () => import('./models/MyFieldModel'),
      },
    });

    // 2. Register plugin settings page (lazy loading)
    this.pluginSettingsRouter.add('my-feature', {
      title: this.t('My Feature Settings'),
      icon: 'SettingOutlined',
      componentLoader: () => import('./pages/MySettingsPage'),
    });

    // 3. Register custom page route (lazy loading)
    this.router.add('my-page', {
      path: '/my-page',
      componentLoader: () => import('./pages/MyPage'),
    });

    // 4. (Optional) Register collection on client for block picker
    // Only needed when collection must appear in "Add Block" data table list.
    // IMPORTANT: In client-v2, you cannot call addCollection directly in load(),
    // because DataSourceManager calls clearCollections during ensureLoaded(),
    // which wipes out any collection added during the load() phase.
    // Use the eventBus 'dataSource:loaded' event to re-register after reload.
    const myCollection = {
      name: 'myCollection',
      title: 'My Collection',
      filterTargetKey: 'id',
      fields: [
        { type: 'bigInt', name: 'id', primaryKey: true, autoIncrement: true, interface: 'id' },
        { type: 'string', name: 'title', interface: 'input',
          uiSchema: { type: 'string', title: 'Title', 'x-component': 'Input' } },
      ],
    };

    const addMyCollection = () => {
      const mainDS = this.flowEngine.dataSourceManager.getDataSource('main');
      if (mainDS && !mainDS.getCollection('myCollection')) {
        mainDS.addCollection(myCollection);
      }
    };

    this.app.eventBus.addEventListener('dataSource:loaded', (event: Event) => {
      if ((event as CustomEvent).detail?.dataSourceKey === 'main') {
        addMyCollection();
      }
    });
  }
}

export default PluginMyFeatureClient;
```

## Template: index.tsx

```tsx
// src/client-v2/index.tsx
export { default } from './plugin';
```

## IMPORTANT: Do NOT Use `this.app.use()` Providers

`this.app.use()` is an internal API. Plugins must NOT use it to wrap the app with React providers. Don't think in terms of providers — there's always a better alternative.

Providers add unnecessary React rendering layers, hurt performance, and make the plugin harder to maintain and debug. When you find yourself reaching for a Provider, step back and use one of these approaches instead:

- **FlowEngine mechanisms** (recommended) — `registerModelLoaders`, `registerFlow`, `registerModels` cover the vast majority of plugin UI needs. This is the standard extension point.
- **FlowEngine context** — `this.context` (`FlowEngineContext`) holds global data. Note: not all properties are available at every stage. In `load()`, only `this.context.api`, `this.context.dataSourceManager`, `this.context.logger` etc. are ready. Properties like `user`, `viewer`, `message`, `themeToken` are set later after React renders and authentication completes — access them in flow handlers or React components, not in `load()`.
- **API requests** — if the plugin needs data, use `this.app.apiClient.request()` to fetch it directly. Axios interceptors are allowed but should not be the first choice — prefer direct requests or reading from context when possible.
- **Pure DOM manipulation** — for global visual effects (watermarks, overlays, injected elements), operate on the DOM directly in `load()`. No React needed.
- **EventBus** — `this.app.eventBus` for reacting to app lifecycle events like `'dataSource:loaded'`.

## Key Points

- Import `Plugin` from `@nocobase/client-v2` (not `@nocobase/client`).
- Use `registerModelLoaders` (lazy) not `registerModels` (eager).
- Use `componentLoader` (lazy) not `Component` (eager) for routes.
- `this.t()` auto-injects plugin namespace -- use in `load()` for runtime strings.
- `this.router` is RouterManager (for registering routes). `ctx.router` in components is React Router (for navigation).
- **WARNING:** In `load()`, do NOT rely on runtime router state (e.g., `this.app.router.router.state`, `location`, `pathname`). The React RouterProvider may not be mounted yet at load time. Use `this.router.add()` for route registration only; read route state in components or flow handlers, not in `load()`.
- `this.pluginSettingsRouter` registers settings pages under `/v2/admin/settings/`.
- `this.flowEngine` gives access to the FlowEngine instance for model registration.
- `this.context` is the same object as `useFlowContext()` in components.
- `this.app.eventBus` is a standard `EventTarget` for app lifecycle events (e.g., `'dataSource:loaded'`).
- For client-side `addCollection`, always use the `eventBus` pattern shown above — calling `addCollection` directly in `load()` will be wiped by `ensureLoaded()`.

## Plugin Shortcuts

| Property | Type | Purpose |
|---|---|---|
| `this.flowEngine` | FlowEngine | Register models |
| `this.engine` | FlowEngine | Alias for `this.flowEngine` |
| `this.router` | RouterManager | Register page routes |
| `this.pluginSettingsRouter` | PluginSettingsManager | Register settings pages |
| `this.t(key)` | Function | i18n with auto namespace |
| `this.context` | FlowEngineContext | Same as useFlowContext(). See availability note below |
| `this.context.api` | APIClient | HTTP requests. Available in `load()` |
| `this.context.dataSourceManager` | DataSourceManager | Data source access. Available in `load()` |
| `this.context.logger` | Logger | Structured logging. Available in `load()` |
| `this.app.eventBus` | EventTarget | App-level event bus for lifecycle events |
| `this.ai` | AIManager | AI integration manager |

## Deep Reference

- https://pr-8998.v2.docs.nocobase.com/cn/plugin-development/client/plugin.md

## Related

- [./router.md](./router.md) -- route registration details
- [./i18n.md](./i18n.md) -- this.t() and tExpr usage
- [./block.md](./block.md) -- block model registration
- [./action.md](./action.md) -- action model registration
- [./field.md](./field.md) -- field model registration
- [../server/plugin.md](../server/plugin.md) -- server-side plugin class
