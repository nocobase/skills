# Migration (Upgrade Scripts)

Read this when you need to handle schema changes, data migrations, or configuration updates between plugin versions.

## Code Templates

### Create a Migration File

```bash
yarn nocobase create-migration <name> --pkg=<plugin-package-name> [--on=afterLoad]
```

Options for `--on`:
- `beforeLoad` — Before plugin configs load. Use for DDL changes via QueryInterface.
- `afterSync` — After DB schema sync. Use for DDL that depends on synced tables.
- `afterLoad` — After all plugins load. Use for data operations via Repository API.

Example:

```bash
yarn nocobase create-migration add-nickname-field --pkg=@my-project/plugin-users --on=afterSync
```

Generates: `src/server/migrations/20240107173313-add-nickname-field.ts`

### Migration Class Structure

```ts
import { Migration } from '@nocobase/server';

export default class extends Migration {
  on = 'afterLoad';              // 'beforeLoad' | 'afterSync' | 'afterLoad'
  appVersion = '<1.5.0';         // Run only when upgrading from versions below this

  async up() {
    // Upgrade logic here
  }
}
```

### Available Properties in Migration

| Property | Type | Description |
|----------|------|-------------|
| `this.db` | `Database` | Database instance for Repository API |
| `this.sequelize` | `Sequelize` | Sequelize instance for raw SQL |
| `this.queryInterface` | `QueryInterface` | Sequelize QueryInterface for DDL operations |
| `this.app` | `Application` | NocoBase app instance |
| `this.plugin` | `Plugin` | Current plugin instance |

### Pattern 1: Data Update via Repository API (afterLoad)

Use when you need to read/write records using the NocoBase Repository API.

```ts
import { Migration } from '@nocobase/server';

export default class extends Migration {
  on = 'afterLoad';
  appVersion = '<1.3.0';

  async up() {
    const repo = this.db.getRepository('users');
    const users = await repo.find({ filter: { nickname: null } });

    for (const user of users) {
      await repo.update({
        filterByTk: user.get('id'),
        values: { nickname: user.get('username') },
      });
    }
  }
}
```

### Pattern 2: DDL via QueryInterface (beforeLoad or afterSync)

Use when you need to add/remove columns or modify table structure directly.

```ts
import { Migration } from '@nocobase/server';

export default class extends Migration {
  on = 'afterSync';
  appVersion = '<1.3.0';

  async up() {
    // Add a column
    await this.queryInterface.addColumn('users', 'nickname', {
      type: this.sequelize.Sequelize.STRING,
      allowNull: true,
    });

    // Backfill data
    await this.sequelize.query(
      `UPDATE users SET nickname = username WHERE nickname IS NULL`
    );
  }
}
```

### Pattern 3: Raw SQL in Transaction

```ts
import { Migration } from '@nocobase/server';

export default class extends Migration {
  on = 'afterSync';
  appVersion = '<1.4.0';

  async up() {
    await this.sequelize.transaction(async (transaction) => {
      await this.sequelize.query(
        'ALTER TABLE posts ADD COLUMN slug VARCHAR(255)',
        { transaction }
      );
      await this.sequelize.query(
        `UPDATE posts SET slug = LOWER(REPLACE(title, ' ', '-'))`,
        { transaction }
      );
    });
  }
}
```

### Trigger Migrations

```bash
yarn nocobase upgrade
```

Migrations run based on `on` timing and `appVersion` comparison.

## Key Rules

- `appVersion` determines which environments run the migration. Set it to the version BEFORE the breaking change (e.g., `<1.3.0` means "run when upgrading from any version below 1.3.0").
- Keep each migration atomic — one file per change.
- Choose `on` timing based on what you need:
  - `beforeLoad` — schema changes that must exist before any plugin config loads
  - `afterSync` — DDL changes that depend on the synced schema
  - `afterLoad` — data operations that need full Repository API access
- Test migrations with MockServer before running on production.

## Deep Reference

- https://pr-8998.v2.docs.nocobase.com/cn/plugin-development/server/migration.md

## Related

- [./collection.md](./collection.md) — Table definitions that migrations may modify
- [./database.md](./database.md) — Repository API for data operations in migrations
- [./plugin.md](./plugin.md) — install() vs Migration: install() is first-time only, Migration is for upgrades
- [./test.md](./test.md) — Testing migrations with MockServer
