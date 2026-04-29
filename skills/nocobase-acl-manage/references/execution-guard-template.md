# ACL Execution Guard Template

Use this template before any ACL write (for example `role.create-blank`, role mode changes, permission writes, membership writes).

## Goal

- Keep one stable execution context (`base-dir`) for the whole task.
- Verify runtime command availability before writes.
- Fail closed when runtime is not ready.
- Prevent ad-hoc script fallbacks.

## Inputs

- `acl_base_dir`: one fixed directory for this task, usually the workspace root.
- `target_env`: expected project-scope env name (optional; used for diagnostics only).

## Guard Sequence (Mandatory)

```bash
nb env list
nb env update <current_env_name>
nb api acl --help
nb api acl roles --help
```

Pass criteria:

- `env list` returns an active env (`*` row).
- `env update <current_env_name>` succeeds or returns actionable recovery guidance.
- `nb api acl --help` resolves successfully.
- `nb api acl roles --help` resolves successfully and lists role lifecycle commands (`create/get/list/update/destroy`).

## Fail-Closed Behavior

If any guard command fails:

- Stop the write path immediately.
- Return capability-boundary message and recovery steps:
  - bootstrap/switch env
  - run env update
  - ensure dependency plugins and token are ready
- Do not create temporary executor files (`*.js`, `*.ps1`, `*.sh`) to bypass missing runtime commands.
- Do not claim "ACL unsupported" before these guard checks pass/fail in the same `base-dir`.

## Role Creation Template (After Guard Passes)

Preferred contract form:

```bash
nb api acl roles create --body-file <role_payload.json> -j
```

`<role_payload.json>` (UTF-8 without BOM):

```json
{
  "name": "<role_name>",
  "title": "<role_title>",
  "description": "Blank role baseline",
  "hidden": false,
  "allowConfigure": false,
  "allowNewMenu": false,
  "snippets": ["!ui.*", "!pm", "!pm.*", "!app"],
  "strategy": { "actions": [] }
}
```

Readback:

```bash
nb api acl roles get --filter-by-tk <role_name> -j
```

## Evidence Block Template

```text
execution_guard:
- base_dir: <acl_base_dir>
- env_current_state: <summary of env list>
- env_update: pass|fail
- acl_help: pass|fail
- acl_roles_help: pass|fail
runtime_write:
- command: <actual write command>
- readback: <actual readback command + key result>
```
