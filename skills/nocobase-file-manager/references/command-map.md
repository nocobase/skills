# Command Map

## Contents

- [Capability and environment](#capability-and-environment)
- [Storage CRUD](#storage-crud)
- [File collection and relation modeling](#file-collection-and-relation-modeling)
- [File record CRUD](#file-record-crud)
- [Execution rules](#execution-rules)

## Capability and environment

Always start with:

```bash
nb env current
nb env update <env> --verbose
nb api resource --help
nb api data-modeling --help
nb api file-manager --help
```

When the API documentation plugin is enabled, inspect the live contract:

```bash
nb api swagger get --namespace plugins/file-manager -e <env> -j
```

If the namespace differs, run `nb api swagger list -e <env> -j` and resolve the real file-manager namespace. Do not guess optional actions.

## Storage CRUD

Safe discovery excludes credential-bearing options:

```bash
nb api resource list --resource storages --except options --except settings -e <env> -j
nb api resource get --resource storages --filter-by-tk <id-or-name> --except options --except settings -e <env> -j
```

Create with non-secret values and environment placeholders only:

```bash
nb api resource create --resource storages --values '<storage-json>' -e <env> -j
```

Update one exact record:

```bash
nb api resource update --resource storages --filter-by-tk <id-or-name> --values '<patch-json>' -e <env> -j
```

Delete only after the high-risk gate:

```bash
nb api resource destroy --resource storages --filter-by-tk <id-or-name> -e <env> -j
```

Rules:

- Put `{{env.FILE_STORAGE_ACCESS_KEY_ID}}`-style placeholders in credential fields. Never put the real secret in `--values`.
- Do not read `options` merely to display configuration. Existing plaintext secrets could be returned.
- When changing nested `options`, `rules`, or `settings`, supply the intended complete object. Do not assume a partial JSON object will preserve omitted keys.
- Read back safe fields after every create/update.

## File collection and relation modeling

This skill supports inspecting, creating, and verifying file collections and their relations. It does not delete collections or fields; route that request to the data-modeling workflow after dependencies and migration impact are explicitly scoped.

Inspect current metadata:

```bash
nb api data-modeling collections list --filter '{"template":"file"}' -e <env> -j
nb api data-modeling collections get --filter-by-tk <collection> --appends fields -e <env> -j
nb api data-modeling collections fields list --collection-name <collection> -e <env> -j
```

Create a file collection with one storage system name:

```bash
nb api data-modeling collections apply --name <file_collection> --title <title> --template file --settings '{"storage":"<storage_name>"}' --verify -e <env> -j
```

Create a relation through the high-level field API:

```bash
nb api data-modeling fields apply --body '<relation-json>' -e <env> -j
```

Read both collections back after relation creation. Do not use generic `fields:create` with an incomplete low-level shape.

## File record CRUD

Use the real file collection name as the resource:

```bash
nb api resource list --resource <file_collection> --fields id --fields title --fields filename --fields path --fields storageId -e <env> -j
nb api resource get --resource <file_collection> --filter-by-tk <record-id> -e <env> -j
nb api resource update --resource <file_collection> --filter-by-tk <record-id> --values '<safe-metadata-patch>' -e <env> -j
nb api resource destroy --resource <file_collection> --filter-by-tk <record-id> -e <env> -j
```

`resource create` accepts JSON only. Use it to finalize an already-uploaded external object, never to upload local bytes:

```bash
nb api resource create --resource <file_collection> --values '<verified-file-metadata>' -e <env> -j
```

Do not update immutable or derived fields such as `id`, `extname`, stable `url`, `preview`, or `storageId` unless the current server contract explicitly supports the intended workflow.

## Execution rules

- Prefer `nb api resource` for storage and file-record CRUD.
- Prefer `nb api data-modeling` for collection and relation mutations because it fills and verifies template/interface defaults.
- Reject file-collection or relation deletion in this skill; do not infer a destroy command from the generic action name.
- Use `nb api file-manager` only for an operation exposed by live `--help`; the installed CLI may expose fewer actions than live Swagger.
- Never use direct SQL to update storages, collection options, fields, or file records; it bypasses cache reload and hooks.
- Never claim a binary upload succeeded from a JSON record creation response.
