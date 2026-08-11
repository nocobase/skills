# UI-mode workflow

## When to use UI mode

Before creating or changing an LLM service or vector database connection configuration, explicitly ask the user to choose one mode:

1. **Direct CLI parameters**: the agent gathers the required fields and performs the supported API command.
2. **UI mode**: the agent opens the relevant NocoBase form with `--ui`; the user enters or changes the configuration in the UI.

Do not choose a mode on the user's behalf. Direct vector database work belongs to `nocobase-ai-knowledge-base-manager` after the user makes this choice.

## Capability check

Refresh the selected environment runtime first, then confirm the exact command exposes `--ui`:

```bash
nb env update <env> --verbose
nb api ai llm-services create --help --env <env> --yes
nb api kb vector-databases create --help --env <env> --yes
```

If `--ui` is absent, stop. The connected application's Swagger metadata does not yet support the UI operation; do not substitute request-body parameters or construct a URL manually.

## LLM services

Create opens the LLM service form. With no provider argument, the form defaults to `openai`:

```bash
nb api ai llm-services create --ui
```

Pass a discovered provider key to preselect a different provider:

```bash
nb api ai llm-services create --ui --provider <provider>
```

For example:

```bash
nb api ai llm-services create --ui --provider deepseek
```

Discover valid LLM provider keys with `nb api ai llm-providers list-llm-providers`. To edit an existing service in the UI, use its exact name:

```bash
nb api ai llm-services update --filter-by-tk <service-name> --ui
```

Do not add `--name`, `--options`, `--enabled-models`, `--enabled`, `--body`, `--body-file`, credentials, or any other request-body flag to a UI command.

## Vector database connections

Create opens the vector database form. With no provider argument, it defaults to **PGVector**:

```bash
nb api kb vector-databases create --ui
```

Use the optional provider argument to preselect a provider. `PGVector` is accepted as the current display spec; a provider key returned by the application is also accepted:

```bash
nb api kb vector-databases create --ui --provider PGVector
```

To edit an existing connection in the UI, use its exact identifier:

```bash
nb api kb vector-databases update --filter-by-tk <vector-database-id> --ui
```

Do not pass connection properties, passwords, `--body`, `--body-file`, or other request-body flags with `--ui`.

## Required pause and verification

A `--ui` command only opens a page; it does not create or update a resource. Immediately after opening the UI:

1. Tell the user which form opened and ask them to finish the configuration in the UI.
2. Stop. Do not begin a dependent task, infer success, or run a follow-up mutation.
3. Resume only after the user explicitly reports that the UI action is complete.
4. Independently read back the result before continuing:
   - For an LLM service, use `nb api ai llm-providers list-llm-services` or a field-limited service read and verify the expected safe fields.
   - For a vector database connection, list or get the target through `nb api kb vector-databases` and verify its safe, non-secret fields.
5. If the user reports cancellation or the result is absent or mismatched, stop and report the actual state.

Never print or request secrets for a UI-mode command. The user enters credentials directly in the form.
