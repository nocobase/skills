# Server-Side Testing

Read this when you need to write unit tests or integration tests for server-side plugin code.

## Code Templates

### Test Tools

| Tool | Import | Purpose |
|------|--------|---------|
| `createMockDatabase` | `@nocobase/database` | Test database models and CRUD in isolation |
| `createMockServer` | `@nocobase/test` | Test full plugin with HTTP API, middleware, ACL |

### Database-Level Test (createMockDatabase)

```ts
import { createMockDatabase, Database } from '@nocobase/database';

describe('Database test', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createMockDatabase();
    await db.clean({ drop: true });
  });

  afterEach(async () => {
    await db.close();
  });

  it('should create and query records', async () => {
    db.collection({
      name: 'todos',
      fields: [
        { type: 'string', name: 'title' },
        { type: 'boolean', name: 'completed', defaultValue: false },
      ],
    });
    await db.sync();

    await db.getRepository('todos').create({
      values: { title: 'Buy milk' },
    });

    const todo = await db.getRepository('todos').findOne({
      filter: { title: 'Buy milk' },
    });

    expect(todo.get('completed')).toBe(false);
  });
});
```

### API-Level Test (createMockServer)

```ts
import { createMockServer, MockServer } from '@nocobase/test';

describe('Plugin API test', () => {
  let app: MockServer;

  beforeEach(async () => {
    app = await createMockServer({
      plugins: ['my-plugin'],
    });
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('should list records', async () => {
    const res = await app.agent().get('/todos:list');
    expect(res.status).toBe(200);
  });

  it('should create a record', async () => {
    const res = await app
      .agent()
      .post('/todos:create')
      .send({ title: 'Test todo', completed: false });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Test todo');
  });

  it('should update a record', async () => {
    const res = await app
      .agent()
      .post('/todos:update/1')
      .send({ completed: true });

    expect(res.status).toBe(200);
  });

  it('should delete a record', async () => {
    const res = await app.agent().post('/todos:destroy/1');
    expect(res.status).toBe(200);
  });
});
```

### Authenticated Requests

```ts
// Method 1: Login with credentials
const loginRes = await app
  .agent()
  .post('/auth:signIn')
  .send({ username: 'admin', password: 'admin123' });
const token = loginRes.body.data.token;

const res = await app
  .agent()
  .set('Authorization', `Bearer ${token}`)
  .get('/protected:list');

// Method 2: Shorthand login
const agent = await app.agent().login(userOrId);
const res = await agent.get('/protected:list');
```

### Test Migrations

```ts
import { createMockServer, MockServer } from '@nocobase/test';

describe('Migration test', () => {
  let app: MockServer;

  beforeEach(async () => {
    app = await createMockServer({
      plugins: ['my-plugin'],
      version: '1.2.0',  // Simulate upgrading from this version
    });
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('should run upgrade migration', async () => {
    await app.runCommand('upgrade');
    // Verify migration results
    const repo = app.db.getRepository('myCollection');
    const record = await repo.findOne({ filter: { id: 1 } });
    expect(record.get('newField')).toBeDefined();
  });
});
```

### Test File Organization

```
src/server/
  __tests__/
    db.test.ts        # Database model tests (createMockDatabase)
    api.test.ts       # API endpoint tests (createMockServer)
    migration.test.ts # Migration tests
```

### Run Tests

```bash
# Run all tests in a plugin
yarn test packages/plugins/@my-project/plugin-hello/src/server

# Run a specific test file
yarn test packages/plugins/@my-project/plugin-hello/src/server/__tests__/api.test.ts
```

## Deep Reference

- https://docs.nocobase.com/cn/plugin-development/server/test.md

## Related

- [./plugin.md](./plugin.md) — Plugin class being tested
- [./database.md](./database.md) — Repository API used in tests
- [./migration.md](./migration.md) — Testing migrations
- [./resource-manager.md](./resource-manager.md) — Testing custom actions
