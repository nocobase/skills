# Client Router

> Read when registering page routes or plugin settings pages.

## Template: Page Route

```ts
// In plugin.tsx load()
this.router.add('my-page', {
  path: '/my-page',
  componentLoader: () => import('./pages/MyPage'),
});
// Accessible at /v2/my-page
```

Page component (must use `export default`):

```tsx
// pages/MyPage.tsx
import React from 'react';

export default function MyPage() {
  return <h1>My Page</h1>;
}
```

## Template: Plugin Settings Page (Single Page)

```ts
// In plugin.tsx load()
// Step 1: Register menu entry
this.pluginSettingsManager.addMenuItem({
  key: 'my-feature',
  title: this.t('My Feature Settings'),
  icon: 'SettingOutlined',  // Ant Design v5 icon name from https://5x.ant.design/components/icon
});
// Step 2: Register the actual page (key='index' maps to menu root path)
this.pluginSettingsManager.addPageTabItem({
  menuKey: 'my-feature',
  key: 'index',
  title: this.t('My Feature Settings'),
  componentLoader: () => import('./pages/MySettingsPage'),
});
// Accessible at /admin/settings/my-feature
```

## Template: Nested Routes

```tsx
import { Outlet } from 'react-router-dom';

// Parent route with layout
this.router.add('root', {
  element: (
    <div>
      <nav>Navigation</nav>
      <Outlet />
    </div>
  ),
});

// Child routes (dot notation = nesting)
this.router.add('root.home', {
  path: '/',
  componentLoader: () => import('./pages/HomePage'),
});

this.router.add('root.about', {
  path: '/about',
  componentLoader: () => import('./pages/AboutPage'),
});
```

## Template: Multi-Tab Settings Page

```ts
// Register menu entry
this.pluginSettingsManager.addMenuItem({
  key: 'my-feature',
  title: this.t('My Feature'),
  icon: 'SettingOutlined',
});

// Tab 1: General (key='index' -> /admin/settings/my-feature)
this.pluginSettingsManager.addPageTabItem({
  menuKey: 'my-feature',
  key: 'index',
  title: this.t('General'),
  componentLoader: () => import('./pages/GeneralPage'),
});

// Tab 2: Advanced (-> /admin/settings/my-feature/advanced)
this.pluginSettingsManager.addPageTabItem({
  menuKey: 'my-feature',
  key: 'advanced',
  title: this.t('Advanced'),
  componentLoader: () => import('./pages/AdvancedPage'),
});
// When only 1 visible page, tabs are auto-hidden.
// When 2+ visible pages, tabs appear at the top.
```

## Template: Dynamic Route Params

```ts
this.router.add('user-detail', {
  path: '/user/:id',
  componentLoader: () => import('./pages/UserPage'),
});
```

```tsx
// pages/UserPage.tsx
import { useFlowContext } from '@nocobase/flow-engine';

export default function UserPage() {
  const ctx = useFlowContext();
  const { id } = ctx.route.params;
  return <h1>User ID: {id}</h1>;
}
```

## Navigation in Components

```tsx
const ctx = useFlowContext();
ctx.router.navigate('/my-page');  // navigates to /v2/my-page
```

## Key Points

- `this.router.add()` first arg is route name; dot notation means nesting (`root.home` is child of `root`).
- Always use `componentLoader` (lazy) not `Component` (eager).
- Page files must use `export default`.
- `this.router` (Plugin) = RouterManager for registration. `ctx.router` (component) = React Router for navigation. They are different objects.
- Settings pages: use `this.pluginSettingsManager.addMenuItem()` + `addPageTabItem()`. Must register menu first, then page. Plugin class must use `Plugin<any, Application>` for correct types.
- Settings page `key: 'index'` maps to menu root path (no `/index` suffix).
- Icon names: use string names like `'SettingOutlined'`, `'ApiOutlined'`, `'DatabaseOutlined'` from Ant Design v5 icon set.

## Common Ant Design v5 Icon Names

`SettingOutlined`, `ApiOutlined`, `DatabaseOutlined`, `AppstoreOutlined`, `ToolOutlined`, `CloudOutlined`, `FileOutlined`, `UserOutlined`, `BellOutlined`, `DashboardOutlined`, `TableOutlined`, `FormOutlined`, `EditOutlined`, `PlusOutlined`, `SearchOutlined`, `FilterOutlined`, `SyncOutlined`

Full list: https://5x.ant.design/components/icon

## Deep Reference

- https://docs.nocobase.com/cn/plugin-development/client/router.md

## Related

- [./plugin.md](./plugin.md) -- plugin load() where routes are registered
- [./component.md](./component.md) -- writing page components
- [./ctx.md](./ctx.md) -- ctx.router.navigate() for page navigation
- [./i18n.md](./i18n.md) -- translating route titles
