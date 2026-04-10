# ACL (Access Control)

Read this when you need to configure permissions for resources and actions, register permission snippets, or implement custom permission logic.

## Code Templates

### Quick Permission Setup (Most Common)

```ts
// In plugin load()
async load() {
  // Allow all actions for logged-in users (default for most plugins)
  this.app.acl.allow('*', '*', 'loggedIn');

  // Public access (no auth required)
  this.app.acl.allow('myResource', 'check', 'public');

  // Logged-in users only
  this.app.acl.allow('myResource', ['list', 'get'], 'loggedIn');

  // Multiple actions
  this.app.acl.allow('myResource', ['create', 'update', 'destroy'], 'loggedIn');

  // Custom condition function
  this.app.acl.allow('orders', 'delete', (ctx) => {
    return ctx.auth.user?.role === 'admin';
  });
}
```

### Condition Parameter Values

| Value | Meaning |
|-------|---------|
| `'public'` | Anyone, including unauthenticated users |
| `'loggedIn'` | Any authenticated user |
| `(ctx) => boolean` | Custom function for dynamic permission check |

### Register Permission Snippet (Reusable Permission Group)

```ts
// In plugin load()
this.app.acl.registerSnippet({
  name: 'ui.myFeature',           // ui.* prefix = configurable in UI
  actions: ['myResource:*'],      // Wildcard for all actions
});
```

### Register Available Action (UI-Configurable)

```ts
// Make a custom action appear in the role permission configuration UI
this.app.acl.setAvailableAction('export', {
  displayName: '{{t("Export")}}',  // Supports i18n
  type: 'existing-data',          // 'new-data' | 'existing-data'
  onNewRecord: false,
});
```

### ACL Middleware (Custom Permission Logic)

```ts
// In plugin load()
this.app.acl.use(async (ctx, next) => {
  const { resourceName, actionName } = ctx.action;

  if (resourceName === 'publicForms' && actionName === 'submit') {
    const password = ctx.request.body?.password;
    if (password === ctx.state.formPassword) {
      ctx.permission = { skip: true };  // Bypass ACL check
    } else {
      ctx.throw(403, 'Invalid password');
    }
  }

  await next();
});
```

### Fixed Data Constraints (Protect System Data)

```ts
// Prevent deletion of built-in roles, regardless of permissions
this.app.acl.addFixedParams('roles', 'destroy', () => ({
  filter: {
    $and: [
      { 'name.$ne': 'root' },
      { 'name.$ne': 'admin' },
      { 'name.$ne': 'member' },
    ],
  },
}));
```

### Check Permissions Programmatically

```ts
const result = this.app.acl.can({
  roles: ['admin', 'editor'],
  resource: 'posts',
  action: 'delete',
});
// Returns { role, resource, action, params } or null
```

### ACL for Other Data Sources

```ts
// Main data source
this.app.acl.allow('myResource', '*', 'loggedIn');

// Other data source
const ds = this.app.dataSourceManager.get('external');
ds.acl.allow('myResource', '*', 'loggedIn');

// All data sources
this.app.dataSourceManager.afterAddDataSource((ds) => {
  ds.acl.allow('*', 'myAction', 'loggedIn');
});
```

## Deep Reference

- https://pr-8998.v2.docs.nocobase.com/cn/plugin-development/server/acl.md

## Related

- [./resource-manager.md](./resource-manager.md) — Register the actions that ACL controls
- [./context.md](./context.md) — ctx.auth.user and ctx.permission in handlers
- [./middleware.md](./middleware.md) — ACL middleware execution order
- [./plugin.md](./plugin.md) — Register ACL rules in load()
- [./data-source-manager.md](./data-source-manager.md) — Each data source has its own ACL
