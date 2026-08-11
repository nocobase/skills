# Knowledge Bases and Documents

## Contents

- [Choose the Type](#choose-the-type)
- [Field and Immutability Contract](#field-and-immutability-contract)
- [Local Defaults](#local-defaults)
- [Create](#create)
- [Update](#update)
- [Document Upload](#document-upload)
- [Re-vectorization and Hit Tests](#re-vectorization-and-hit-tests)
- [Delete and Cleanup](#delete-and-cleanup)

## Choose the Type

| Type | Use When | Required configuration |
|---|---|---|
| `LOCAL` | NocoBase manages documents, segments, vectors, upload, and workflow document operations. Recommended for normal use. | `storageId`, `vectorDatabaseKey`, `llmService`, `embeddingModel`; optional `segmentOptions`. |
| `READONLY` | An external system maintains documents and PGVector data; NocoBase only retrieves. | `vectorDatabaseKey`, `llmService`, `embeddingModel`; no local upload workflow. |
| `EXTERNAL` | Another plugin/provider owns documents, vectors, and retrieval logic. | `vectorStoreProvider` plus provider-required `vectorStoreProps`. |

If the user is unsure, recommend `LOCAL` but do not create until the user approves exact inputs.

The product UI calls the combination of vector database, LLM service, and embedding model a "vector store". The CLI KB payload represents that combination with the three fields directly.

## Field and Immutability Contract

Common create fields:

```text
knowledgeBaseType
key
name
description
enabled
```

Rules:

- `key` is the stable unique identifier and cannot be changed after creation.
- For `LOCAL`, `storageId` cannot be changed after creation.
- Reject direct key/storage patch attempts and propose a new KB plus explicit migration instead.
- `storageId` is the storage name returned by file-manager storage discovery.
- `EXTERNAL` provider values can contain secrets; protect and suppress `vectorStoreProps[].value`.
- Validate exact enabled vector database, saved service, and embedding model before Local/Readonly create or vector change.

## Local Defaults

Recommended product defaults when the user accepts them:

```json
{
  "knowledgeBaseType": "LOCAL",
  "segmentOptions": {
    "enabled": true,
    "chunkSize": 6000,
    "chunkOverlap": 1200
  },
  "enabled": true
}
```

Validation:

```text
chunkSize >= 1
chunkOverlap >= 0
chunkOverlap < chunkSize
```

Changing KB-level defaults affects future uploads or later explicit resegmentation/re-vectorization; it does not prove existing segments were rebuilt.

## Create

1. Require current capability preflight with `runtimeCapability=available`.
2. Prove exact KB key absence.
3. Confirm type and conditional fields.
4. For Local/Readonly, consume AI-manager service and separate embedding readiness.
5. For Local, resolve file storage and enabled PGVector configuration.
6. For External, list actual providers and validate provider-specific props.
7. Use a protected body file when structured values contain secrets.
8. Create once.
9. Read back by key/id and compare safe fields.
10. Do not upload, hit-test, or bind automatically unless requested.

## Update

1. Read current safe fields.
2. Reject attempts to change `key` or Local `storageId`.
3. Compare the intended safe diff.
4. If vector database, service, embedding model, or external provider changes, explain that existing documents require re-vectorization for retrieval against the new configuration.
5. Obtain impact confirmation.
6. Update once and read back.
7. Do not invoke hidden vector-store confirmation actions.
8. Run re-vectorization only as a separately approved action; do not claim retrieval readiness from the configuration write alone.

## Document Upload

Upload is valid only for `LOCAL` KBs.

Supported ordinary document extensions from the current product documentation:

```text
txt md json csv xls xlsx pdf doc docx ppt pptx
```

Preflight:

- file exists and is readable;
- KB exists, is enabled, and is Local;
- file extension is supported, or the file is ZIP for batch import;
- scanned/image-only PDFs require OCR before upload;
- ZIP and ordinary uploads are subject to file-storage upload limits.

Command pattern:

```bash
nb api kb documents upload \
  --knowledge-base-key <key> \
  --file <path> \
  --env <env> --yes
```

Completion semantics:

- ordinary file HTTP success: `upload accepted`; automatic segmentation/vectorization started or was queued;
- ZIP response with task identifier: `import task submitted`; imported documents are processed automatically;
- do not poll automatically;
- do not claim segmentation, vectorization, indexing, import, or retrieval completion;
- never ask whether to vectorize after successful upload.

If the user later requests status, perform a separate bounded list/get inspection. Do not convert that into indefinite polling.

## Re-vectorization and Hit Tests

Document re-vectorization:

```bash
nb api kb documents vectorization \
  --knowledge-base-key <key> \
  --id <document-id>
```

Use only when independently requested for retry, vector rebuild, or a repaired configuration. Report server acceptance/rejection, not completion.

Hit test:

```bash
nb api kb run-hit-test \
  --knowledge-base-key <key> \
  --query <text> \
  --top-k <n> \
  --score <number>
```

Validate `topK >= 1` and score from 0 through 1. An empty result means no current hit; it does not prove upload failure.

## Delete and Cleanup

Recommended reverse dependency order:

```text
unbind employee
remove documents
delete knowledge base
delete unused vector database
delete unused LLM service
```

Each destructive step is independent:

1. Resolve exact target and dependencies.
2. Show target-specific impact and rollback limits.
3. Obtain fresh confirmation immediately before that one `destroy`.
4. Execute once.
5. Verify absence or report dependency protection.

Never reuse one cleanup confirmation across multiple documents or resource types. Accepted background work may continue after related configuration changes and cannot be claimed as rolled back.