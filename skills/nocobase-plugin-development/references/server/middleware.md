# Middleware

Read this when you need to add request interceptors, logging, data transformation, or custom processing at different levels.

## Code Templates

### Four Middleware Levels

Register in plugin `load()`:

```ts
async load() {
  // 1. Application-level — runs on every request
  this.app.use(async (ctx, next) => {
    console.log('App middleware');
    await next();
  });

  // 2. Data source-level — only for data source requests
  this.app.dataSourceManager.use(async (ctx, next) => {
    console.log('DataSource middleware');
    await next();
  });

  // 3. Resource-level — only for defined resource requests
  this.app.resourceManager.use(async (ctx, next) => {
    console.log('Resource middleware');
    await next();
  });

  // 4. ACL-level — runs during permission check phase
  this.app.acl.use(async (ctx, next) => {
    console.log('ACL middleware');
    await next();
  });
}
```

### Execution Order

For resource requests (e.g., `/api/posts:list`):

1. `acl.use()` middlewares
2. `resourceManager.use()` middlewares
3. `dataSourceManager.use()` middlewares
4. `app.use()` middlewares

For non-resource requests (e.g., `/api/hello`): only `app.use()` runs.

### Positioning with before/after/tag

```ts
// Tag a middleware for reference
this.app.use(myMiddleware, { tag: 'myTag' });

// Insert before a tagged middleware
this.app.use(earlyMiddleware, { before: 'myTag' });

// Insert after a tagged middleware
this.app.use(lateMiddleware, { after: 'myTag' });

// Insert between two tagged middlewares
this.app.resourceManager.use(betweenMiddleware, {
  after: 'parseToken',
  before: 'checkRole',
});
```

### Pattern: Request Logging

```ts
this.app.resourceManager.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  ctx.logger.info(
    `${ctx.action.resourceName}:${ctx.action.actionName} - ${duration}ms`
  );
});
```

### Pattern: Auth Check

```ts
this.app.resourceManager.use(async (ctx, next) => {
  if (ctx.action.resourceName === 'admin' && !ctx.auth.user?.isAdmin) {
    ctx.throw(403, 'Admin access required');
  }
  await next();
});
```

### Pattern: Response Data Transform

```ts
this.app.resourceManager.use(async (ctx, next) => {
  await next();
  // Wrap response after action handler completes
  if (ctx.body && ctx.action.actionName === 'list') {
    ctx.body = {
      data: ctx.body,
      timestamp: Date.now(),
    };
  }
});
```

### Onion Model

Middleware follows Koa's onion model — code before `await next()` runs on the way in, code after runs on the way out:

```ts
this.app.use(async (ctx, next) => {
  // Before: runs first
  console.log('entering');
  await next();
  // After: runs last
  console.log('leaving');
});
```

## Deep Reference

- https://pr-8998.v2.docs.nocobase.com/cn/plugin-development/server/middleware.md

## Related

- [./context.md](./context.md) — ctx properties available in middleware
- [./resource-manager.md](./resource-manager.md) — Resource-level middleware registration
- [./acl.md](./acl.md) — ACL-level middleware
- [./plugin.md](./plugin.md) — Register middleware in load()
- [./data-source-manager.md](./data-source-manager.md) — Data source-level middleware
