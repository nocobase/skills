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
node ./scripts/run-ctl.mjs --base-dir <acl_base_dir> -- env -s project
node ./scripts/run-ctl.mjs --base-dir <acl_base_dir> -- acl --help
node ./scripts/run-ctl.mjs --base-dir <acl_base_dir> -- acl roles --help
```

Pass criteria:

- `env -s project` returns an active project env.
- `acl --help` resolves successfully.
- `acl roles --help` resolves successfully and lists role lifecycle commands (`create/get/list/update/destroy`).

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
node ./scripts/run-ctl.mjs --base-dir <acl_base_dir> -- acl roles create --body '{"name":"<role_name>","title":"<role_title>","description":"Blank role baseline","hidden":false,"allowConfigure":false,"allowNewMenu":false,"snippets":["!ui.*","!pm","!pm.*","!app"],"strategy":{"actions":[]}}'
```

Readback:

```bash
node ./scripts/run-ctl.mjs --base-dir <acl_base_dir> -- acl roles get --filter-by-tk <role_name> -j
```

## Evidence Block Template

```text
execution_guard:
- base_dir: <acl_base_dir>
- env_project_scope: <summary of env -s project>
- acl_help: pass|fail
- acl_roles_help: pass|fail
runtime_write:
- command: <actual write command>
- readback: <actual readback command + key result>
```
