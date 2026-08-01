# Vector Database Workflow

This direct write workflow applies only after the user explicitly selects `direct-cli`. For `ui`, hand off to `nocobase-ai-manager`, stop for user completion, and consume independent safe-field readback before continuing.
## Supported PGVector Contract

Current built-in support:

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

Rules:

- discover the provider/spec pair from the target environment;
- `port` is 1 through 65535;
- `tableName` is `table` or `schema.table` with valid PostgreSQL identifier segments;
- password is write-only and sensitive;
- protect the entire connection body and omit `connectProps` from normal summaries.

## Discover and Test

1. Require available KB capability preflight.
2. Run provider discovery and select a real provider/spec pair.
3. Resolve exact vector database key absence/current state.
4. Put provider and connection props in a protected mode-600 body file.
5. Run `test-connection`.
6. Continue only when the server reports `success=true`.
7. Do not expose password, connection strings, or full provider errors containing secrets.

## Create

1. Create only after connection success.
2. Suppress secret-bearing output where supported.
3. If the server returns `TABLE_ALREADY_EXISTS`, stop without retrying.
4. Explain that table reuse can mix, expose, or overwrite assumptions about existing vector data.
5. Require explicit confirmation for this exact database/table reuse.
6. Only then retry with `skipTableExistedCheck=true`.
7. Read back safe fields:

```text
id,key,name,databaseSpec,provider,enabled,createdAt,updatedAt
```

Do not print `connectProps.password`; normally omit all `connectProps`.

## Update

1. Read a safe snapshot.
2. Test proposed connection settings before update.
3. Identify knowledge bases using the vector key.
4. Explain host/database/table/provider and retrieval impact.
5. Obtain impact confirmation.
6. Update once and read back safe fields.
7. Tell the user that dependent documents may require a separately approved re-vectorization and hit test.
8. Never auto-chain re-vectorization from the vector database update.

## Delete

1. Resolve the exact key/id.
2. Identify readable KB dependencies.
3. Show table/data/retrieval impact and rollback limits.
4. Obtain fresh exact-target confirmation immediately before `destroy`.
5. Execute once and rely on backend dependency protection.
6. If in use, stop and preserve it; never delete dependent data directly.
7. After success, verify absence.

## Rollback and Errors

- Create mismatch: deleting the new config requires separate fresh confirmation; external table/data may remain.
- Update mismatch: restore safe fields; credentials must be re-supplied.
- `TABLE_ALREADY_EXISTS`: never auto-retry with skip enabled.
- 401/403: treat as auth/ACL, not edition evidence.
- Timeout/5xx: perform one safe read before deciding whether mutation happened.
- Capability changed during work: stop subsequent mutations and re-run preflight.