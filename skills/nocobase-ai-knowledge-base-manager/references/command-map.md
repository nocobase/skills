# Knowledge Base Command Map

## Contents

- [Capability Preflight](#capability-preflight)
- [Storage](#storage)
- [Vector Databases](#vector-databases)
- [Knowledge Bases](#knowledge-bases)
- [Documents](#documents)
- [LLM and Embedding Handoff](#llm-and-embedding-handoff)
- [AI Employee Binding Handoff](#ai-employee-binding-handoff)
- [Excluded Surface](#excluded-surface)

## Capability Preflight

Entitlement, when supported for the managed environment:

```bash
nb license plugins list --env <env> --yes --json
```

Installed/enabled plugins:

```bash
nb plugin list --env <env> --yes
```

Runtime and generated KB API:

```bash
nb env update <env> --verbose
nb api kb --help --env <env> --yes
nb api kb vector-databases --help --env <env> --yes
nb api kb documents --help --env <env> --yes
```

Do not use `nb license status` as an edition decision. Do not infer edition from `nb env info` or missing KB commands.

When a required plugin is installed but disabled, do not stop with a manual instruction. Show the exact environment and package name, ask whether the user wants it enabled, and after explicit approval use `nocobase-plugin-manage` in safe mode. The direct command executed by that workflow is:

```bash
nb plugin enable --env <env> --yes @nocobase/plugin-ai-knowledge-base
```

If the base AI package is also installed-disabled and the user approves both exact packages:

```bash
nb plugin enable --env <env> --yes @nocobase/plugin-ai @nocobase/plugin-ai-knowledge-base
```

Then verify and resume capability probing:

```bash
nb plugin list --env <env> --yes
nb env update <env> --verbose
nb api kb --help --env <env> --yes
```

If consent is declined, enablement fails, or post-state remains disabled, stop before KB mutation. Installation, synchronization, and disablement remain plugin/environment-management operations.

## Storage

```bash
nb api file-manager storages list --env <env> --yes
```

For Local KBs, use the storage name expected by `storageId`, not an assumed numeric database ID.

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

Before vector database create/update, ask the user to choose `direct-cli` or `ui`. For `ui`, hand off to `nocobase-ai-manager` after KB capability passes; it opens only the documented `--ui` form, pauses for user completion, and independently verifies safe fields. Use the commands above directly only for `direct-cli`.

## Knowledge Bases

Knowledge-base CRUD is directly under `kb`; do not add a `knowledge-bases` segment.

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

Upload uses multipart `--file` plus `--knowledge-base-key`. It does not put the file in a JSON body. Successful upload starts or queues automatic segmentation/vectorization. `documents vectorization` is reserved for an independently requested retry/rebuild.

Every vector, KB, or document `destroy` requires fresh exact-target confirmation immediately before execution.

## LLM and Embedding Handoff

After capability preflight passes, `nocobase-ai-manager` owns saved service readiness and model discovery. Consume:

```text
coreAI.status=ready
serviceName
chatModels
knowledgeBasePrerequisites.status=ready
embeddingModels
```

Never put an embedding identifier into saved-service `enabledModels`.

## AI Employee Binding Handoff

This skill prepares and verifies binding inputs. `nocobase-ai-employee-manager` performs the final write:

```bash
nb api ai employees get --filter-by-tk <username>
nb api ai employees update --filter-by-tk <username>
```

The employee write must cover `enableKnowledgeBase`, `knowledgeBasePrompt`, and `knowledgeBase` together.

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

Use supported list/get results, product defaults, and server dependency errors instead of hidden actions.