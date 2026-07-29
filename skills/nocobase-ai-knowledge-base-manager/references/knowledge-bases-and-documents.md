# Knowledge Bases and Documents

## Knowledge Base Types

| Type | Required configuration |
|---|---|
| `LOCAL` | `storageId`, `vectorDatabaseKey`, `llmService`, `embeddingModel`; optional `segmentOptions`. |
| `READONLY` | `vectorDatabaseKey`, `llmService`, `embeddingModel`; no local upload workflow. |
| `EXTERNAL` | `vectorStoreProvider` and provider-required `vectorStoreProps`. |

Common fields: `knowledgeBaseType`, `key`, `name`, optional `description`, and `enabled`.

For `LOCAL`, `storageId` is the storage name discovered from `file-manager storages list`, not necessarily the numeric record ID.

## Local Example

```json
{
  "knowledgeBaseType": "LOCAL",
  "key": "product-docs",
  "name": "Product Docs",
  "description": "Product documentation",
  "storageId": "local",
  "vectorDatabaseKey": "pgvector-main",
  "llmService": "openai-main",
  "embeddingModel": "embedding-model",
  "segmentOptions": {
    "enabled": true,
    "chunkSize": 6000,
    "chunkOverlap": 1200
  },
  "enabled": true
}
```

Validate the LLM service and embedding model through `nocobase-ai-manager` before create/update.

Critical boundary: the LLM service's `enabledModels` contains only large-language/chat models. Discover the embedding model separately and set it only in this knowledge base's `embeddingModel` / `--embedding-model` field.

## Create and Update

1. Check exact KB key.
2. Validate type-specific required fields.
3. For `EXTERNAL`, protect sensitive `vectorStoreProps[].value` and do not print it.
4. Create or update once.
5. Read back by key/id and compare non-secret configuration.
6. If vector database, LLM service, embedding model, or external store changes, explain retrieval impact and require confirmation.
7. Run explicit re-vectorization/retry or hit test only when independently requested. Never ask whether to vectorize after upload; upload already triggers automatic vectorization.

## Document Upload

Ordinary file:

```bash
nb api kb documents upload --knowledge-base-key <key> --file <path> --env <env> --yes
```

Completion semantics:

- ordinary file HTTP success: report `upload succeeded` and that automatic vectorization has started or been queued;
- ZIP HTTP success with `taskId`: report `task submitted`; imported documents will be vectorized automatically by the service;
- never ask the user whether to vectorize after upload and never suggest manual vectorization as the normal next step;
- do not poll `indexStatus`, `segmentStatus`, async tasks, ZIP import, or vectorization status;
- do not claim segmentation, vectorization, indexing, import, or retrieval completion.

ZIP filename encoding options, when required and supported by help, are repeatable multipart fields. Do not serialize an array as one JSON string.

## Explicit Re-vectorization or Retry

```bash
nb api kb documents vectorization --knowledge-base-key <key> --id <document-id>
```

Use this command only when the user independently requests re-vectorization, retry, or rebuilding vectors for an existing document. It is not a post-upload step: upload triggers vectorization automatically, so do not offer or ask to run this command after upload. Report only whether the server accepted or rejected the request; do not claim completion and do not auto-poll.

## Independent Hit Test

```bash
nb api kb run-hit-test --knowledge-base-key <key> --query <text> --top-k <n> --score <number>
```

A valid response should be an array whose items may include document/segment identity, title/file name, content, score, and metadata. An empty array can mean no current retrieval hit; it does not prove upload failure.

## Delete and Cleanup

Recommended reverse dependency order:

```text
unbind AI employee
remove documents
delete knowledge base
delete unused vector database
delete unused LLM service
```

Every destructive step requires its own fresh explicit secondary confirmation immediately before execution: each document `destroy`, each knowledge base `destroy`, each vector database `destroy`, and each LLM service `destroy`. The original request, a cleanup-plan approval, or one blanket confirmation cannot authorize multiple deletes. Verify each deletion independently. Accepted asynchronous work may continue and cannot be claimed as rolled back.
