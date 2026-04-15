# ResourceManager — Custom REST API

Read this when you need to register custom API actions on existing resources, define custom resources, or add resource-level middleware.

## Code Templates

### URL Format

NocoBase uses `resource:action` pattern instead of HTTP method-based routing:

```
GET    /api/posts:list          → list all posts
GET    /api/posts:get/1         → get post with id=1
POST   /api/posts:create        → create a post
POST   /api/posts:update/1      → update post with id=1
POST   /api/posts:destroy/1     → delete post with id=1
POST   /api/posts:myAction      → custom action on posts

GET    /api/posts/1/tags:list   → list tags of post 1
POST   /api/posts/1/tags:add    → add tags to post 1
```

### Register Custom Action on Existing Resource

```ts
// In plugin load()
async load() {
  // Global action (available on all resources)
  this.app.resourceManager.registerActionHandlers({
    export: async (ctx, next) => {
      const repo = ctx.db.getRepository(ctx.action.resourceName);
      const data = await repo.find({ filter: ctx.action.params.filter });
      ctx.body = data;
      await next();
    },
  });

  // Action on a specific resource: POST /api/posts:publish
  this.app.resourceManager.registerActionHandlers({
    'posts:publish': async (ctx, next) => {
      const { filterByTk } = ctx.action.params;
      const repo = ctx.db.getRepository('posts');
      await repo.update({
        filterByTk,
        values: { status: 'published', publishedAt: new Date() },
      });
      ctx.body = { success: true };
      await next();
    },
  });

  // Action on an association: POST /api/posts/1/comments:pin
  this.app.resourceManager.registerActionHandlers({
    'posts.comments:pin': async (ctx, next) => {
      // handle pinning a comment
      await next();
    },
  });
}
```

### Define a Custom Resource (Non-Collection)

```ts
// In plugin load()
async load() {
  this.app.resourceManager.define({
    name: 'myService',
    actions: {
      check: async (ctx, next) => {
        ctx.body = { status: 'ok', version: '1.0.0' };
        await next();
      },
      run: async (ctx, next) => {
        const { values } = ctx.action.params;
        // process values...
        ctx.body = { result: 'done' };
        await next();
      },
    },
  });

  // Don't forget ACL:
  this.app.acl.allow('myService', 'check', 'public');
  this.app.acl.allow('myService', 'run', 'loggedIn');
}
```

### Resource-Level Middleware

```ts
// In plugin load()
async load() {
  this.app.resourceManager.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    ctx.logger.info(`${ctx.action.resourceName}:${ctx.action.actionName} - ${duration}ms`);
  });
}
```

### Built-in Actions for Collections

| Action | Description | Method |
|--------|-------------|--------|
| `list` | Query all records (paginated) | GET/POST |
| `get` | Query single record | GET/POST |
| `create` | Create record | POST |
| `update` | Update record | POST |
| `destroy` | Delete record | POST |
| `firstOrCreate` | Find or create | POST |
| `updateOrCreate` | Update or create | POST |

### Built-in Association Actions

| Action | Description | Relation Types |
|--------|-------------|----------------|
| `add` | Add association | hasMany, belongsToMany |
| `remove` | Remove association | hasOne, hasMany, belongsTo, belongsToMany |
| `set` | Reset associations | hasOne, hasMany, belongsTo, belongsToMany |
| `toggle` | Toggle association | belongsToMany |

### Action Parameters

Common params available via `ctx.action.params`:

- `filter` — query conditions
- `filterByTk` — filter by target key (primary key)
- `values` — request body data
- `fields` — select fields
- `appends` — include relations
- `except` — exclude fields
- `sort` — sort order
- `page`, `pageSize` — pagination
- `whitelist`, `blacklist` — field write control

### Accessing resourceManager for Other Data Sources

```ts
// Main data source
this.app.resourceManager.registerActionHandlers({ ... });

// Other data source
const ds = this.app.dataSourceManager.get('external');
ds.resourceManager.registerActionHandlers({ ... });

// All data sources
this.app.dataSourceManager.afterAddDataSource((ds) => {
  ds.resourceManager.registerActionHandlers({ ... });
});
```

## Deep Reference

- https://docs.nocobase.com/cn/plugin-development/server/resource-manager.md

## Related

- [./acl.md](./acl.md) — Set permissions for custom actions
- [./context.md](./context.md) — ctx.action params in handlers
- [./middleware.md](./middleware.md) — Middleware layers and execution order
- [./collection.md](./collection.md) — Collections auto-generate resources
- [./data-source-manager.md](./data-source-manager.md) — Per-data-source resource managers
