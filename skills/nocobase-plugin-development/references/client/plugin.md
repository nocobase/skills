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
    // Only needed when collection must appear in "Add Block" data table list
    const mainDS = this.flowEngine.dataSourceManager.getDataSource('main');
    mainDS?.addCollection({
      name: 'myCollection',
      title: 'My Collection',
      filterTargetKey: 'id',
      fields: [
        { type: 'bigInt', name: 'id', primaryKey: true, autoIncrement: true, interface: 'id' },
        { type: 'string', name: 'title', interface: 'input',
          uiSchema: { type: 'string', title: 'Title', 'x-component': 'Input' } },
      ],
    });
    mainDS?.addReloadCallback(() => {
      mainDS?.addCollection(/* same collection object */);
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

## Key Points

- Import `Plugin` from `@nocobase/client-v2` (not `@nocobase/client`).
- Use `registerModelLoaders` (lazy) not `registerModels` (eager).
- Use `componentLoader` (lazy) not `Component` (eager) for routes.
- `this.t()` auto-injects plugin namespace -- use in `load()` for runtime strings.
- `this.router` is RouterManager (for registering routes). `ctx.router` in components is React Router (for navigation).
- `this.pluginSettingsRouter` registers settings pages under `/v2/admin/settings/`.
- `this.flowEngine` gives access to the FlowEngine instance for model registration.
- `this.context` is the same object as `useFlowContext()` in components.

## Plugin Shortcuts

| Property | Type | Purpose |
|---|---|---|
| `this.flowEngine` | FlowEngine | Register models |
| `this.router` | RouterManager | Register page routes |
| `this.pluginSettingsRouter` | PluginSettingsManager | Register settings pages |
| `this.t(key)` | Function | i18n with auto namespace |
| `this.context` | FlowEngineContext | Same as useFlowContext() |
| `this.context.api` | APIClient | HTTP requests |
| `this.context.viewer` | ViewerManager | Open dialogs/drawers |
| `this.context.logger` | Logger | Structured logging |

## Deep Reference

- https://pr-8998.v2.docs.nocobase.com/cn/plugin-development/client/plugin.md

## Related

- [./router.md](./router.md) -- route registration details
- [./i18n.md](./i18n.md) -- this.t() and tExpr usage
- [./block.md](./block.md) -- block model registration
- [./action.md](./action.md) -- action model registration
- [./field.md](./field.md) -- field model registration
- [../server/plugin.md](../server/plugin.md) -- server-side plugin class
