# AI Prerequisite Command Map

## Environment and Runtime

```bash
nb env list
nb env info <env>
nb env update <env> --verbose
nb api ai --help --env <env> --yes
nb api ai llm-providers --help --env <env> --yes
nb api ai llm-services --help --env <env> --yes
```

If runtime refresh or help fails, stop. Plugin state changes belong to `nocobase-plugin-manage`.

## LLM Provider Discovery and Testing

```bash
nb api ai llm-providers list-llm-providers
nb api ai llm-providers list-provider-models
nb api ai llm-providers test-flight
nb api ai llm-providers list-models
nb api ai llm-providers list-llm-services
```

Responsibilities:

- `list-llm-providers`: discover provider keys and supported model types.
- `list-provider-models`: discover models from unsaved provider settings; use a protected `--body-file` when options contain secrets.
- `test-flight`: test unsaved provider/model connectivity before saving.
- `list-models`: list models exposed by a saved service; use `--llm-service <name>`. `--model LLM` finds chat models eligible for `enabledModels`; `--model EMBEDDING` discovers embedding models only for separate knowledge base `embeddingModel` configuration.
- `list-llm-services`: obtain the enabled, safer service projection for dependency discovery and verification.

## Saved LLM Service CRUD

```bash
nb api ai llm-services list
nb api ai llm-services get
nb api ai llm-services create
nb api ai llm-services update
nb api ai llm-services destroy
```

Use `--filter-by-tk <service-name>` for get, update, and destroy when help confirms the flag. Prefer field-limited reads or `list-llm-services` so `options` is not printed. Every `destroy` requires a fresh explicit secondary confirmation for that exact service immediately before execution, including rollback and cleanup deletes.

## Dependency Reads

```bash
nb api kb list
nb api ai employees list
```

Before disabling, replacing, or deleting an LLM service, inspect:

- knowledge bases whose `llmService` equals the service name;
- employees whose `modelSettings.models[].llmService` equals the service name.

## Excluded Surface

Do not invent or call these commands in this skill:

```text
ai tools ...
ai skills ...
ai settings ...
ai llm-services move
ai employees move
ai employees get-templates
```

The writable LLM service schema does not include `modelOptions`, and `enabledModels.mode` supports only `provider` and `custom`.

Critical restriction:

- `nb api ai llm-services create --enabled-models ...` accepts only large-language/chat models.
- `nb api ai llm-services update --enabled-models ...` accepts only large-language/chat models.
- Never include embedding models in `enabledModels.models`. Discover them separately and use them only in knowledge base `--embedding-model` configuration.
