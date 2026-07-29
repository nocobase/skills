# Knowledge Base Command Map

## Runtime and Storage

```bash
nb env update <env> --verbose
nb api kb --help --env <env> --yes
nb api kb vector-databases --help --env <env> --yes
nb api kb documents --help --env <env> --yes
nb api file-manager storages list --env <env> --yes
```

Knowledge base CRUD is directly under `kb`; do not add a `knowledge-bases` segment.

## Vector Databases

```bash
nb api kb vector-databases list-providers
nb api kb vector-databases test-connection
nb api kb vector-databases list
nb api kb vector-databases get
nb api kb vector-databases create
nb api kb vector-databases update
nb api kb vector-databases destroy
```

## Knowledge Bases

```bash
nb api kb list
nb api kb get
nb api kb create
nb api kb update
nb api kb destroy
nb api kb run-hit-test
nb api kb list-external-vector-store-providers
```

## Documents

```bash
nb api kb documents list
nb api kb documents get
nb api kb documents upload
nb api kb documents vectorization
nb api kb documents destroy
```

Upload uses multipart `--file` plus `--knowledge-base-key`. It does not use JSON `--body-file` for the file itself. A successful upload automatically starts or queues vectorization; never ask the user whether to run `documents vectorization` afterward. That command is reserved for an independently requested re-vectorization/retry.

All three `destroy` commands above require a fresh explicit secondary confirmation for the exact target immediately before execution. Do not reuse one confirmation across a document, knowledge base, and vector database cleanup sequence.

## AI Employee Binding

```bash
nb api ai employees get --filter-by-tk <username>
nb api ai employees update --filter-by-tk <username>
```

The narrow binding write updates `enableKnowledgeBase` and `knowledgeBase` only. Broader profile changes belong to `nocobase-ai-employee-manager`.

## Excluded Surface

Do not invent or use:

```text
kb knowledge-bases ...
kb segments ...
kb tasks ...
asyncTasks:* dedicated commands
aiKnowledgeBaseDocSegments:* commands
kb vector-databases list-enabled
aiVectorDatabases:findRelatedKnowledgeBase
aiKnowledgeBase:checkVectorStoreChanged
aiKnowledgeBase:confirmVectorStoreChanged
aiKnowledgeBaseDocs:getUploadStorage
```

Use `vector-databases list --filter '{"enabled":true}'`, `file-manager storages list`, and service dependency errors instead of hidden actions.
