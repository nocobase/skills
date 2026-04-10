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

## Template: Plugin Settings Page

```ts
// In plugin.tsx load()
this.pluginSettingsRouter.add('my-feature', {
  title: this.t('My Feature Settings'),
  icon: 'SettingOutlined',  // Ant Design v5 icon name from https://5x.ant.design/components/icon
  componentLoader: () => import('./pages/MySettingsPage'),
});
// Accessible at /v2/admin/settings/my-feature
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

## Template: Multi-Level Settings Page

```tsx
import { Outlet } from 'react-router-dom';

const pluginName = 'my-feature';

// Parent with Outlet
this.pluginSettingsRouter.add(pluginName, {
  title: this.t('My Feature'),
  icon: 'SettingOutlined',
  element: <Outlet />,
});

// Sub-pages
this.pluginSettingsRouter.add(`${pluginName}.general`, {
  title: this.t('General'),
  componentLoader: () => import('./pages/GeneralPage'),
});

this.pluginSettingsRouter.add(`${pluginName}.advanced`, {
  title: this.t('Advanced'),
  componentLoader: () => import('./pages/AdvancedPage'),
});
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

- All v2 routes get `/v2` prefix automatically.
- First arg to `.add()` is route name; dot notation means nesting (`root.home` is child of `root`).
- Always use `componentLoader` (lazy) not `Component` (eager).
- Page files must use `export default`.
- `this.router` (Plugin) = RouterManager for registration. `ctx.router` (component) = React Router for navigation. They are different objects.
- Icon names: use string names like `'SettingOutlined'`, `'ApiOutlined'`, `'DatabaseOutlined'` from Ant Design v5 icon set.

## Common Ant Design v5 Icon Names

`SettingOutlined`, `ApiOutlined`, `DatabaseOutlined`, `AppstoreOutlined`, `ToolOutlined`, `CloudOutlined`, `FileOutlined`, `UserOutlined`, `BellOutlined`, `DashboardOutlined`, `TableOutlined`, `FormOutlined`, `EditOutlined`, `PlusOutlined`, `SearchOutlined`, `FilterOutlined`, `SyncOutlined`

Full list: https://5x.ant.design/components/icon

## Deep Reference

- https://pr-8998.v2.docs.nocobase.com/cn/plugin-development/client/router.md

## Related

- [./plugin.md](./plugin.md) -- plugin load() where routes are registered
- [./component.md](./component.md) -- writing page components
- [./ctx.md](./ctx.md) -- ctx.router.navigate() for page navigation
- [./i18n.md](./i18n.md) -- translating route titles
