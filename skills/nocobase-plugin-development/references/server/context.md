# Request Context (ctx)

Read this when you need to access request parameters, current user, database, or other services inside middleware or action handlers.

## Code Templates

### ctx.action — Action Info

```ts
async handler(ctx, next) {
  ctx.action.actionName;     // 'list', 'get', 'create', 'update', 'destroy', or custom
  ctx.action.resourceName;   // 'posts', 'users', etc.
  ctx.action.params;         // All action parameters (see below)

  // Common params:
  ctx.action.params.filter;       // Filter conditions
  ctx.action.params.filterByTk;   // Primary key value (from URL: /api/posts:get/1)
  ctx.action.params.values;       // Request body data
  ctx.action.params.fields;       // Requested fields
  ctx.action.params.appends;      // Requested relation includes
  ctx.action.params.sort;         // Sort order
  ctx.action.params.page;         // Page number
  ctx.action.params.pageSize;     // Page size

  await next();
}
```

### ctx.db — Database Access

```ts
async handler(ctx, next) {
  const repo = ctx.db.getRepository('posts');
  const posts = await repo.find({ filter: { status: 'active' } });
  ctx.body = posts;
  await next();
}
```

### ctx.auth.user — Current User

```ts
async handler(ctx, next) {
  if (!ctx.auth.user) {
    ctx.throw(401, 'Not authenticated');
  }

  const userId = ctx.auth.user.id;
  const username = ctx.auth.user.username;
  const email = ctx.auth.user.email;

  ctx.body = { userId, username };
  await next();
}
```

### ctx.state.currentRoles — User Roles

```ts
async handler(ctx, next) {
  const roles = ctx.state.currentRoles; // string[]
  if (!roles.includes('admin')) {
    ctx.throw(403, 'Forbidden');
  }
  await next();
}
```

### ctx.t() — i18n Translation

```ts
async handler(ctx, next) {
  // Translates based on client's locale (X-Locale header or ?locale= query)
  const message = ctx.t('Hello World');

  // With namespace (plugin-specific translations)
  const pluginMsg = ctx.t('Welcome', { ns: '@my-project/plugin-hello' });

  ctx.body = { message };
  await next();
}
```

### ctx.cache — Cache Operations

```ts
async handler(ctx, next) {
  const cached = await ctx.cache.get('myKey');
  if (cached) {
    ctx.body = cached;
    return await next();
  }

  const data = await expensiveQuery();
  await ctx.cache.set('myKey', data, { ttl: 60 }); // Cache for 60 seconds
  ctx.body = data;
  await next();
}
```

### ctx.logger — Logging

```ts
async handler(ctx, next) {
  ctx.logger.info('Processing request', { path: ctx.path });
  ctx.logger.warn('Slow query detected');
  ctx.logger.error('Something failed', { error: err.message });
  ctx.logger.debug('Debug info', { params: ctx.action.params });
  await next();
}
```

### ctx.app — Application Instance

```ts
async handler(ctx, next) {
  // Access any app-level service
  const pluginInstance = ctx.app.pm.get('my-plugin');
  ctx.body = { appName: ctx.app.name };
  await next();
}
```

### ctx.getCurrentRepository() — Current Resource Repository

```ts
// Inside resourceManager middleware, get the repository for the current resource
async handler(ctx, next) {
  const repo = ctx.getCurrentRepository();
  const data = await repo.find();
  ctx.body = data;
  await next();
}
```

### ctx.dataSource — Current Data Source

```ts
async handler(ctx, next) {
  const dsName = ctx.dataSource.name;
  ctx.body = { dataSource: dsName };
  await next();
}
```

### ctx.permission — Permission Control

```ts
// In ACL middleware, skip permission check
ctx.permission = { skip: true };
```

### Full Context Property Summary

| Property | Type | Description |
|----------|------|-------------|
| `ctx.action` | `Action` | Current action info (actionName, resourceName, params) |
| `ctx.db` | `Database` | Database instance |
| `ctx.auth.user` | `Model` | Current authenticated user |
| `ctx.state.currentRoles` | `string[]` | Current user's roles |
| `ctx.t(key, opts?)` | `Function` | i18n translation |
| `ctx.i18n` | `I18n` | i18n instance (cloned per-request) |
| `ctx.cache` | `Cache` | Cache operations |
| `ctx.logger` | `Logger` | Request-scoped logger |
| `ctx.app` | `Application` | App instance |
| `ctx.dataSource` | `DataSource` | Current data source |
| `ctx.permission` | `object` | Permission flags (`{ skip: true }`) |

## Deep Reference

- https://docs.nocobase.com/cn/plugin-development/server/context.md

## Related

- [./middleware.md](./middleware.md) — Where ctx is used
- [./resource-manager.md](./resource-manager.md) — Action handlers that receive ctx
- [./acl.md](./acl.md) — Permission checking via ctx
- [./database.md](./database.md) — Repository API accessed via ctx.db
- [./i18n.md](./i18n.md) — ctx.t() usage details
