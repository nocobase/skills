# Collections (Data Tables)

Read this when you need to define new data tables, extend existing tables, or choose field types.

## Code Templates

### defineCollection — Create a New Table

Place files in `src/server/collections/*.ts`. They are auto-loaded before all plugins' `load()`.

```ts
// src/server/collections/todos.ts
import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'todos',
  title: 'Todo Items',
  fields: [
    { type: 'string', name: 'title' },
    { type: 'boolean', name: 'completed', defaultValue: false },
    { type: 'integer', name: 'priority', defaultValue: 0 },
    { type: 'belongsTo', name: 'assignee', target: 'users', foreignKey: 'assigneeId' },
  ],
});
```

### extendCollection — Add Fields to an Existing Table

```ts
// src/server/collections/extend-users.ts
import { extendCollection } from '@nocobase/database';

export default extendCollection({
  name: 'users',
  fields: [
    { type: 'string', name: 'department' },
    { type: 'boolean', name: 'isVip', defaultValue: false },
  ],
});
```

### Collection Options

```ts
interface CollectionOptions {
  name: string;              // Required. Table name (unique across app)
  title?: string;            // Display title for UI
  fields?: FieldOptions[];   // Field definitions
  autoGenId?: boolean;       // Auto-generate bigInt PK (default: true)
  timestamps?: boolean;      // Auto createdAt/updatedAt (default: true)
  paranoid?: boolean;        // Soft delete with deletedAt (default: false)
  filterTargetKey?: string;  // Key for client-side block binding (set to 'id' for UI visibility)
  inherits?: string[];       // Inherit fields from other collections (PostgreSQL only)
  model?: string;            // Custom Sequelize Model class name
  repository?: string;       // Custom Repository class name
}
```

## Field Type Reference

### Text Fields

| type | DB Type | Key Parameters |
|------|---------|----------------|
| `string` | VARCHAR(255) | `length?: number`, `trim?: boolean` |
| `text` | TEXT | `length?: 'tiny' \| 'medium' \| 'long'` (MySQL only) |

### Number Fields

| type | DB Type | Key Parameters |
|------|---------|----------------|
| `integer` | INTEGER | — |
| `bigInt` | BIGINT | — |
| `float` | FLOAT | `precision?: number`, `scale?: number` |
| `double` | DOUBLE | `precision?: number`, `scale?: number` |
| `real` | REAL | `precision?: number`, `scale?: number` |
| `decimal` | DECIMAL | `precision?: number`, `scale?: number` |

### Boolean Fields

| type | DB Type | Notes |
|------|---------|-------|
| `boolean` | BOOLEAN | — |
| `radio` | BOOLEAN | Single-select boolean (functionally same as boolean) |

### Date/Time Fields

| type | DB Type | Key Parameters |
|------|---------|----------------|
| `date` | DATE(3) | `defaultToCurrentTime?`, `onUpdateToCurrentTime?` |
| `dateOnly` | DATEONLY | — |
| `time` | TIME | `timezone?: boolean` |
| `datetimeTz` | TIMESTAMP WITH TZ | `timezone?: boolean` |
| `datetimeNoTz` | TIMESTAMP | `timezone?: boolean` |
| `unixTimestamp` | BIGINT | `accuracy?: 'second' \| 'millisecond'` |

### Structured Data Fields

| type | DB Type | Key Parameters |
|------|---------|----------------|
| `json` | JSON/JSONB | `jsonb?: boolean` (PostgreSQL) |
| `jsonb` | JSONB/JSON | Prefers JSONB on PostgreSQL |
| `array` | ARRAY/JSON | `dataType?: 'json' \| 'array'`, `elementType?: 'STRING' \| 'INTEGER' \| 'BOOLEAN' \| 'JSON'` |
| `set` | ARRAY/JSON | Same as array but with uniqueness |

### ID Generation Fields

| type | DB Type | Key Parameters |
|------|---------|----------------|
| `uid` | VARCHAR(255) | `prefix?: string` |
| `uuid` | UUID | `autoFill?: boolean` (default true) |
| `nanoid` | VARCHAR(255) | `size?: number` (default 12), `customAlphabet?: string` |
| `snowflakeId` | BIGINT | `autoFill?: boolean` (default true) |

### Special Fields

| type | DB Type | Notes |
|------|---------|-------|
| `password` | VARCHAR(255) | Auto salted-hash storage. `length?`, `randomBytesSize?` |
| `encryption` | VARCHAR(255) | Encrypted sensitive data |
| `virtual` | none | No database column. Computed field only. |
| `context` | varies | Auto-fill from request context. `dataIndex?: string` (e.g. `'user.id'`), `createOnly?: boolean` |

### Relation Fields

| type | Relation | Key Parameters |
|------|----------|----------------|
| `belongsTo` | Many-to-one | `target`, `foreignKey`, `targetKey?`, `onDelete?`, `constraints?` |
| `hasOne` | One-to-one | `target`, `foreignKey`, `sourceKey?`, `onDelete?`, `constraints?` |
| `hasMany` | One-to-many | `target`, `foreignKey`, `sourceKey?`, `sortBy?`, `onDelete?`, `constraints?` |
| `belongsToMany` | Many-to-many | `target`, `through`, `foreignKey?`, `otherKey?`, `sourceKey?`, `targetKey?`, `onDelete?`, `constraints?` |

### Relation Example

```ts
fields: [
  // Many-to-one: article belongs to an author
  { type: 'belongsTo', name: 'author', target: 'users', foreignKey: 'authorId' },
  // One-to-many: article has many comments
  { type: 'hasMany', name: 'comments', target: 'comments', foreignKey: 'articleId' },
  // Many-to-many: article has many tags via junction table
  { type: 'belongsToMany', name: 'tags', target: 'tags', through: 'articlesTags' },
]
```

### Common Field Parameters

All column fields support these parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Field name (required) |
| `defaultValue` | `any` | Default value |
| `allowNull` | `boolean` | Allow NULL (default: true) |
| `unique` | `boolean` | Unique constraint |
| `primaryKey` | `boolean` | Primary key |
| `autoIncrement` | `boolean` | Auto-increment (numeric fields only) |
| `index` | `boolean` | Create index |
| `comment` | `string` | Database column comment |
| `hidden` | `boolean` | Hidden from default list/form views |

## Making a Collection Visible in UI Block Picker

Server-side `defineCollection` creates the physical table. To make it appear in the UI block picker, you must also register it on the client side with `addCollection` (set `filterTargetKey: 'id'`). See [../client/block.md](../client/block.md) for client-side details.

## Auto-Generated REST API

After defining a collection, NocoBase automatically creates REST endpoints: `list`, `get`, `create`, `update`, `destroy`. No extra code needed for basic CRUD.

## Deep Reference

- https://pr-8998.v2.docs.nocobase.com/cn/plugin-development/server/collections.md
- https://pr-8998.v2.docs.nocobase.com/cn/plugin-development/server/collection-options.md

## Related

- [./database.md](./database.md) — Repository API for querying data
- [./resource-manager.md](./resource-manager.md) — Custom actions beyond CRUD
- [./migration.md](./migration.md) — Schema changes after initial release
- [./plugin.md](./plugin.md) — Plugin lifecycle and when collections load
