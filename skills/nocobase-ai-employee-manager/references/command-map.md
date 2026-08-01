# AI Employee Command Map

## Runtime Check

```bash
nb env list
nb env info <env>
nb env update <env> --verbose
nb api ai employees --help --env <env> --yes
```

Read-only employee inspection requires the employee command surface, not automatic execution of every downstream prerequisite workflow.

## Supported Employee CRUD

```bash
nb api ai employees list
nb api ai employees get
nb api ai employees create
nb api ai employees update
nb api ai employees destroy
```

Typical exact identifier use:

```bash
nb api ai employees get --filter-by-tk <username>
nb api ai employees update --filter-by-tk <username>
nb api ai employees destroy --filter-by-tk <username>
```

Use flags only after current help confirms them. Before create, prove exact username absence. After create/update, use `get` for independent readback.

Every `destroy` requires fresh exact-target confirmation immediately before execution, including rollback or cleanup deletes.

## Model Prerequisite Handoff

When `modelSettings` is created or changed, use `nocobase-ai-manager` and consume:

```text
coreAI.status
serviceName
enabled
chatModels
```

Useful discovery commands owned by that skill include:

```bash
nb api ai llm-providers list-llm-services
nb api ai llm-providers list-models --llm-service <service-name> --model LLM
```

Do not validate employee models from an embedding-model list.

## Knowledge-Base Handoff

Before any employee KB write, use `nocobase-ai-knowledge-base-manager`. Consume:

```text
requiredEdition=professional+
entitlement
pluginState
runtimeCapability=available
enabledKnowledgeBaseKeys
```

Only after that handoff may this skill read exact enabled keys through the supported KB list command. The employee manager owns the final employee update.

A missing `kb` command is not proof of Community Edition. Do not bypass the KB manager's capability classification.

## Current Exclusions

Do not invent or use:

```text
ai employees move
ai employees get-templates
aiEmployees:listByUser
aiEmployees:updateUserPrompt
ai tools ...
ai skills ...
ai settings ...
role association commands
```

Do not write:

```text
builtIn
category
deprecated
chatSettings
dataSourceSettings
skillSettings
```

Use broader authoring/UI skills when the request requires excluded capabilities. This manager stays within the documented employee record surface.