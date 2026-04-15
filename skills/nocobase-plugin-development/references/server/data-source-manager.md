# DataSourceManager

Read this when you need to work with multiple data sources, register middleware/actions across all data sources, or access non-main data source instances.

## Code Templates

### Core Concepts

Each `DataSource` has its own independent:
- `dataSource.collectionManager` — manages tables and fields
- `dataSource.resourceManager` — REST API resources and actions
- `dataSource.acl` — access control

Main data source shortcuts:
- `app.db` = `dataSourceManager.get('main').collectionManager.db`
- `app.acl` = `dataSourceManager.get('main').acl`
- `app.resourceManager` = `dataSourceManager.get('main').resourceManager`

### Get a Specific Data Source

```ts
const mainDS = this.app.dataSourceManager.get('main');
const externalDS = this.app.dataSourceManager.get('external');

// Access its components
externalDS.resourceManager.registerActionHandlers({ ... });
externalDS.acl.allow('myResource', '*', 'loggedIn');
```

### Register Middleware for All Data Sources

```ts
// In plugin load()
this.app.dataSourceManager.use(async (ctx, next) => {
  console.log('This runs for all data sources');
  await next();
});
```

### Before Data Source Loads (Static Registration)

Use for registering field types, model classes, etc. before any data source initializes.

```ts
this.app.dataSourceManager.beforeAddDataSource((dataSource) => {
  const cm = dataSource.collectionManager;
  if (cm instanceof SequelizeCollectionManager) {
    cm.registerFieldTypes({
      customField: CustomFieldClass,
    });
  }
});
```

### After Data Source Loads (Runtime Registration)

Use for registering actions, ACL rules, etc. after data sources are ready.

```ts
this.app.dataSourceManager.afterAddDataSource((dataSource) => {
  // Register custom actions on all data sources
  dataSource.resourceManager.registerActionHandlers({
    export: async (ctx, next) => { /* ... */ await next(); },
  });

  // Set ACL for all data sources
  dataSource.acl.allow('*', 'export', 'loggedIn');
});
```

### Typical Plugin Pattern

```ts
async load() {
  // Main data source only
  this.app.resourceManager.registerActionHandlers({
    'myResource:specialAction': handler,
  });
  this.app.acl.allow('myResource', 'specialAction', 'loggedIn');

  // All data sources (including future ones)
  this.app.dataSourceManager.afterAddDataSource((ds) => {
    ds.resourceManager.registerActionHandlers({
      globalAction: globalHandler,
    });
    ds.acl.allow('*', 'globalAction', 'loggedIn');
  });
}
```

## Deep Reference

- https://docs.nocobase.com/cn/plugin-development/server/data-source-manager.md

## Related

- [./resource-manager.md](./resource-manager.md) — Per-data-source resource management
- [./acl.md](./acl.md) — Per-data-source ACL
- [./middleware.md](./middleware.md) — Data source-level middleware
- [./database.md](./database.md) — Database operations (main data source)
- [./plugin.md](./plugin.md) — Access dataSourceManager via this.app
