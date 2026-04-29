# Test Playbook

## TC01 Inspect

Prompt:

```text
Use $nocobase-plugin-manage inspect.
```

Expected:

- `commands` includes `nb plugin list`.
- `verification=passed`.

## TC02 Enable

Prompt:

```text
Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc.
```

Expected:

- `commands` includes `nb plugin enable @nocobase/plugin-api-doc`.
- readback includes `nb plugin list`.
- when passed, post-state shows `enabled=true`.

## TC03 Disable

Prompt:

```text
Use $nocobase-plugin-manage disable @nocobase/plugin-api-doc.
```

Expected:

- `commands` includes `nb plugin disable @nocobase/plugin-api-doc`.
- readback includes `nb plugin list`.
- when passed, post-state shows `enabled=false`.

## TC04 Missing Plugin Guard

Prompt:

```text
Use $nocobase-plugin-manage enable.
```

Expected:

- mutation is blocked.
- output asks for plugin identity.

## TC05 No Fallback Guarantee

Expected across all cases:

- no `docker compose exec`.
- no API route fallback.
- no legacy ctl or wrapper-script command path.
