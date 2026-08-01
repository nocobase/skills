# AI Prerequisite Command Map

## Contents

- [Environment and Runtime](#environment-and-runtime)
- [Provider Discovery and Testing](#provider-discovery-and-testing)
- [Saved LLM Service CRUD](#saved-llm-service-crud)
- [Dependency Reads](#dependency-reads)
- [Capability Boundary](#capability-boundary)
- [Excluded Surface](#excluded-surface)

## Environment and Runtime

```bash
nb env list
nb env info <env>
nb env update <env> --verbose
nb api ai --help --env <env> --yes
nb api ai llm-providers --help --env <env> --yes
nb api ai llm-services --help --env <env> --yes
```

`nb env info` confirms environment, application, database, API, and authentication context. It does not establish the NocoBase commercial edition.

If runtime refresh or help fails, stop. Plugin installation and enablement belong to the plugin-management workflow.

## Provider Discovery and Testing

```bash
nb api ai llm-providers list-llm-providers
nb api ai llm-providers list-provider-models
nb api ai llm-providers test-flight
nb api ai llm-providers list-models
nb api ai llm-providers list-llm-services
```

Responsibilities:

- `list-llm-providers`: discover provider keys and supported model categories.
- `list-provider-models`: discover models from unsaved provider settings; use a protected body file when options contain secrets.
- `test-flight`: verify unsaved provider/model connectivity before saving.
- `list-models --llm-service <name> --model LLM`: discover chat models eligible for `enabledModels`.
- `list-models --llm-service <name> --model EMBEDDING`: discover embedding identifiers for separate KB configuration only.
- `list-llm-services`: obtain the enabled, safer service projection for readiness and dependency checks.

Read actual help before relying on a flag; generated commands can vary by server/plugin version.

## Saved LLM Service CRUD

```bash
nb api ai llm-services list
nb api ai llm-services get
nb api ai llm-services create
nb api ai llm-services update
nb api ai llm-services destroy
```

Use `--filter-by-tk <service-name>` for get, update, and destroy only when help confirms it. Prefer field-limited reads or `list-llm-services` so provider `options` are not printed.

Every `destroy` requires a fresh exact-target secondary confirmation immediately before execution, including rollback and cleanup deletes.

## Dependency Reads

Employee dependencies:

```bash
nb api ai employees list
```

Knowledge-base dependencies, only after `nocobase-ai-knowledge-base-manager` confirms KB runtime capability:

```bash
nb api kb list
```

Before disabling, replacing, or deleting a service, inspect:

- employees whose `modelSettings.models[].llmService` equals the service name;
- knowledge bases whose `llmService` equals the service name.

If KB capability is unavailable or unknown, the KB dependency set is unknown. Block disruptive service changes instead of treating it as empty.

## Capability Boundary

This skill does not use these commands to decide the knowledge-base edition:

```text
nb env info
nb license status
```

`nb env info` has no edition contract, and current CLI implementations may report `nb license status` as not implemented. Knowledge-base entitlement and plugin capability belong to `nocobase-ai-knowledge-base-manager`.

## Excluded Surface

Do not invent or call:

```text
ai tools ...
ai skills ...
ai settings ...
ai llm-services move
ai employees move
ai employees get-templates
```

The writable LLM service schema excludes `modelOptions`; `enabledModels.mode` supports only `provider` and `custom`.

Critical restriction:

- create/update `enabledModels` accepts only large-language/chat models;
- embedding models are discovered separately and used only in KB `embeddingModel` configuration.