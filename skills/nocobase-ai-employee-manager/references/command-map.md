# AI Employee Command Map

## Runtime Check

```bash
nb env update <env> --verbose
nb api ai employees --help --env <env> --yes
```

## Supported CRUD

```bash
nb api ai employees list
nb api ai employees get
nb api ai employees create
nb api ai employees update
nb api ai employees destroy
```

Typical identifier use:

```bash
nb api ai employees get --filter-by-tk <username>
nb api ai employees update --filter-by-tk <username> ...
nb api ai employees destroy --filter-by-tk <username>
```

Before create, use list with an exact username filter. After create/update, use `get` for independent readback. Before every `employees destroy`, obtain fresh explicit secondary confirmation for that exact custom employee immediately before execution; rollback and cleanup deletes are not exempt.

## Dependency Commands

Use `nocobase-ai-manager` first. Its command surface includes:

```bash
nb api ai llm-providers list-llm-services
nb api ai llm-providers list-models --llm-service <service-name>
```

For knowledge base binding:

```bash
nb api kb list --filter '{"enabled":true}'
```

## Current Exclusions

Do not invent or use these as part of this CLI manager:

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

The current employee write surface also excludes:

```text
builtIn
category
deprecated
chatSettings
dataSourceSettings
skillSettings
```

If the request requires those richer capabilities or UI placement, use the existing `nocobase-ai-employee` and `nocobase-ui-builder` skills instead of bypassing this command boundary.
