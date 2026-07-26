# Vector Database Workflow

## Supported PGVector Shape

```json
{
  "key": "pgvector-main",
  "name": "PGVector Main",
  "databaseSpec": "PGVector",
  "provider": "NocobaseDefaultPGVectorProvider",
  "connectProps": {
    "host": "${PGVECTOR_HOST}",
    "port": 5432,
    "user": "${PGVECTOR_USER}",
    "password": "${PGVECTOR_PASSWORD}",
    "database": "${PGVECTOR_DATABASE}",
    "tableName": "nocobase_vectors"
  },
  "enabled": true
}
```

`tableName` must be `table` or `schema.table`, with valid PostgreSQL identifier segments. Password is sensitive.

## Discover and Test

1. Run `list-providers` and select a real provider/spec pair.
2. Check exact vector database `key` absence or current state.
3. Put provider and `connectProps` in a protected JSON body file.
4. Run `test-connection`; continue only when `success=true`.
5. Do not put the password in query parameters or final output.

## Create

1. Create only after connection success.
2. Suppress secret-bearing response output when possible.
3. If the server returns `TABLE_ALREADY_EXISTS`, stop.
4. Explain that reuse may mix or expose existing vector data.
5. Verify table ownership and obtain explicit confirmation.
6. Only then retry with `skipTableExistedCheck=true`.
7. Read back safe fields only:

```text
id,key,name,databaseSpec,provider,enabled,createdAt,updatedAt
```

Do not print `connectProps.password`; normally omit all `connectProps` from summaries.

## Update

1. Read a safe snapshot.
2. Test new connection settings before update.
3. Identify knowledge bases that use the vector key.
4. Confirm the impact of host/database/table/provider changes.
5. Update once and read back safe fields.
6. Explain that dependent documents may require explicit vectorization and a separate hit test.

## Delete

1. Resolve exact key/id.
2. Obtain a fresh explicit secondary confirmation immediately before this specific vector database `destroy`; an earlier request, plan approval, or batch cleanup confirmation is not sufficient.
3. Call destroy and rely on server dependency protection.
4. If the server says the vector database is in use, stop and preserve it.
5. Never bypass the dependency error or delete dependent data directly.
6. After success, verify the record is absent.

## Rollback and Errors

- Create mismatch: request a separate secondary confirmation immediately before deleting the new vector database config; external table/data may remain.
- Update mismatch: restore safe fields; credentials must be re-supplied.
- `TABLE_ALREADY_EXISTS`: never auto-retry with skip enabled.
- 401/403: fix env/auth/ACL.
- Timeout/5xx: perform a safe read before determining whether a write occurred.
