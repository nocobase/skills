# Server Plugin Class

Read this when you need to create or modify a server-side plugin class, understand lifecycle methods, or access app-level services.

## Code Templates

### Basic Plugin Class

```ts
import { Plugin } from '@nocobase/server';

export class PluginMyFeatureServer extends Plugin {
  async afterAdd() {
    // Runs after plugin is added to PluginManager.
    // Not all plugins are initialized yet. Use for basic setup only.
  }

  async beforeLoad() {
    // Runs before all plugins' load(). All enabled plugin instances are available.
    // Use for: registering field types, models, repositories, operators, db event listeners.
    // NO database operations allowed.
  }

  async load() {
    // Runs after all beforeLoad() complete.
    // Use for: registering resources, actions, ACL, middleware, routes.
    // NO database operations allowed — DB is not synced yet.
  }

  async install() {
    // Runs ONLY on first activation. Use for: seed data, initial DB writes.
    // For upgrades, use Migration instead.
    const repo = this.db.getRepository('myCollection');
    await repo.create({ values: { name: 'default' } });
  }

  async afterEnable() {
    // Runs every time the plugin is enabled. Start timers, open connections.
  }

  async afterDisable() {
    // Runs when plugin is disabled. Clean up resources, stop timers.
  }

  async remove() {
    // Runs when plugin is deleted. Drop tables, delete files.
  }
}

export default PluginMyFeatureServer;
```

### App Members Available via `this.app`

| Member | Type | Purpose |
|--------|------|---------|
| `this.app.db` | `Database` | ORM, model registration, events, transactions |
| `this.app.resourceManager` | `ResourceManager` | Register REST API resources and action handlers |
| `this.app.acl` | `ACL` | Define permissions and access control |
| `this.app.i18n` | `I18n` | Global i18n instance |
| `this.app.cacheManager` | `CacheManager` | System-level caching |
| `this.app.cronJobManager` | `CronJobManager` | Cron job scheduling |
| `this.app.cli` | `CLI` | Register custom CLI commands |
| `this.app.dataSourceManager` | `DataSourceManager` | Manage multiple data sources |
| `this.app.pm` | `PluginManager` | Manage plugin lifecycle |
| `this.app.logger` | `Logger` | Logging (info, warn, error, debug) |

Shorthand: `this.db` is equivalent to `this.app.db`.

### Lifecycle Execution Order

1. **App startup**: `afterAdd()` -> `beforeLoad()` -> `load()`
2. **First enable**: `afterAdd()` -> `beforeLoad()` -> `load()` -> `install()`
3. **Subsequent enable**: `afterAdd()` -> `beforeLoad()` -> `load()` (no `install()`)
4. **Disable**: `afterDisable()`
5. **Delete**: `remove()`

### Critical Rules

- `load()` CANNOT do DB operations — DB is not synced yet. Move DB ops to `install()` or request handlers.
- `install()` runs ONLY on first activation. For upgrades, use Migration.
- `beforeLoad()` is the right place for `db.registerFieldTypes()`, `db.registerModels()`, `db.on()`.
- `load()` is the right place for `resourceManager.registerActionHandlers()`, `acl.allow()`, middleware.

## Deep Reference

- https://docs.nocobase.com/cn/plugin-development/server/plugin.md

## Related

- [./collection.md](./collection.md) — Define data tables
- [./database.md](./database.md) — Repository API for CRUD
- [./resource-manager.md](./resource-manager.md) — Custom REST APIs
- [./acl.md](./acl.md) — Access control
- [./migration.md](./migration.md) — Upgrade scripts
- [./i18n.md](./i18n.md) — Server-side i18n
