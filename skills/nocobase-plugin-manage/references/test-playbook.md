# Test Playbook

## TC01 Inspect

Prompt:

```text
Use $nocobase-plugin-manage inspect.
```

Expected:

- `commands` includes `nb pm list`.
- `verification=passed`.

## TC02 Enable

Prompt:

```text
Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc.
```

Expected:

- `commands` includes `nb pm enable @nocobase/plugin-api-doc`.
- readback includes `nb pm list`.
- when passed, post-state shows `enabled=true`.

## TC03 Disable

Prompt:

```text
Use $nocobase-plugin-manage disable @nocobase/plugin-api-doc.
```

Expected:

- `commands` includes `nb pm disable @nocobase/plugin-api-doc`.
- readback includes `nb pm list`.
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
- no `pm:list`/`pm:enable` API route fallback.
- no legacy ctl or wrapper-script command path.
