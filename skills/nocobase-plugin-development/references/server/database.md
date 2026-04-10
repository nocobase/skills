# Database & Repository API

Read this when you need to perform CRUD operations, query data with filters, or work with the database layer.

## Code Templates

### Getting a Repository

```ts
// In plugin methods (load, install, etc.)
const repo = this.db.getRepository('collectionName');

// In request handlers / middleware
const repo = ctx.db.getRepository('collectionName');
```

### find() — Query Multiple Records

```ts
const results = await repo.find({
  filter: { status: 'active' },        // Filter conditions
  fields: ['id', 'name', 'email'],     // Select specific fields
  except: ['password'],                 // Exclude fields
  appends: ['posts', 'profile'],       // Include relations
  sort: ['-createdAt', 'name'],        // Sort (prefix '-' for DESC)
  limit: 20,                           // Limit results
  offset: 0,                           // Offset for pagination
});
```

### findOne() — Query Single Record

```ts
const record = await repo.findOne({
  filter: { email: 'user@example.com' },
});

// Or by primary key
const record = await repo.findOne({
  filterByTk: 1,
  appends: ['profile'],
});
```

### count() — Count Records

```ts
const total = await repo.count({
  filter: { status: 'active' },
});
```

### findAndCount() — Query with Total Count

```ts
const [results, total] = await repo.findAndCount({
  filter: { status: 'active' },
  limit: 20,
  offset: 0,
});
```

### create() — Insert Record

```ts
const record = await repo.create({
  values: {
    title: 'New Post',
    content: 'Hello world',
    tags: [
      { id: 1 },           // Link existing tag
      { name: 'new-tag' }, // Create and link new tag
    ],
  },
});
```

### createMany() — Insert Multiple Records

```ts
const records = await repo.createMany({
  records: [
    { title: 'Post 1', status: 'draft' },
    { title: 'Post 2', status: 'published' },
  ],
});
```

### update() — Update Records

```ts
// Update by primary key
await repo.update({
  filterByTk: 1,
  values: { title: 'Updated Title' },
});

// Update by filter
await repo.update({
  filter: { status: 'draft' },
  values: { status: 'archived' },
  whitelist: ['status'],  // Only allow updating 'status'
});
```

### destroy() — Delete Records

```ts
// Delete by primary key
await repo.destroy({ filterByTk: 1 });

// Delete by filter
await repo.destroy({
  filter: { status: 'archived' },
});

// Delete multiple by IDs
await repo.destroy({ filterByTk: [1, 2, 3] });
```

## Filter Operators

```ts
// Comparison
{ age: { $eq: 18 } }       // Equal (same as { age: 18 })
{ age: { $ne: 18 } }       // Not equal
{ age: { $gt: 18 } }       // Greater than
{ age: { $gte: 18 } }      // Greater than or equal
{ age: { $lt: 60 } }       // Less than
{ age: { $lte: 60 } }      // Less than or equal

// String
{ name: { $like: '%john%' } }       // LIKE
{ name: { $notLike: '%test%' } }    // NOT LIKE
{ name: { $includes: 'john' } }     // Contains (shorthand for %val%)

// Null check
{ deletedAt: { $null: true } }      // IS NULL
{ deletedAt: { $notNull: true } }   // IS NOT NULL

// Array / IN
{ status: { $in: ['active', 'pending'] } }      // IN
{ status: { $notIn: ['deleted', 'banned'] } }    // NOT IN

// Boolean
{ isActive: { $isTruly: true } }     // Truthy check
{ isActive: { $isFalsy: true } }     // Falsy check

// Logical
{
  $and: [
    { status: 'active' },
    { age: { $gte: 18 } },
  ],
}
{
  $or: [
    { role: 'admin' },
    { role: 'editor' },
  ],
}

// Relation field filtering
{ 'posts.title': 'My Post' }                    // Filter by relation field
{ 'posts.comments.content': { $like: '%bug%' } }  // Nested relation filter
```

## When Can You Do DB Operations?

| Phase | DB Operations Allowed |
|-------|----------------------|
| `beforeLoad()` | No |
| `load()` | No |
| `install()` | Yes |
| `afterEnable()` | Yes |
| Request handlers | Yes |
| `afterSync` event | Yes |

### db.on() — Database Event Listeners

Register in `beforeLoad()`:

```ts
async beforeLoad() {
  this.db.on('users.afterCreate', async (model, options) => {
    // Runs after a user record is created
    console.log('New user:', model.get('name'));
  });
}
```

Common events: `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeSave`, `afterSave`, `beforeDestroy`, `afterDestroy`, `afterCreateWithAssociations`, `afterUpdateWithAssociations`.

### Getting the Model Directly

```ts
const UserModel = this.db.getModel('users');
const user = await UserModel.findByPk(1); // Sequelize Model API
```

## Deep Reference

- https://pr-8998.v2.docs.nocobase.com/cn/plugin-development/server/database.md
- https://pr-8998.v2.docs.nocobase.com/cn/api/database/repository.md

## Related

- [./collection.md](./collection.md) — Define tables and fields
- [./context.md](./context.md) — Access db via ctx.db in request handlers
- [./plugin.md](./plugin.md) — Lifecycle phases and when DB ops are allowed
- [./migration.md](./migration.md) — DB operations in upgrade scripts
