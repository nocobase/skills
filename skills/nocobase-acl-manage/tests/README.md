# ACL CLI Capability Notes

This folder now tracks CLI-oriented verification for `nocobase-acl-manage` v2.

## Current Status

- Primary transport: `nocobase-ctl` CLI
- Legacy MCP runner files are retained for historical comparison only

Legacy files:

- `run-acl-mcp-capability.js`
- `debug-mcp.js`

These legacy files are not the default validation path for the current skill contract.

## Recommended CLI Verification Flow

1. Verify CLI and env through skill-local wrapper:

```bash
node ./run-ctl.mjs -- --help
node ./run-ctl.mjs -- env update -e local
```

Use `$nocobase-env-bootstrap task=app-manage app_env_action=current app_scope=project target_dir=.` to verify current env context before ACL writes.

If there is no current env, bootstrap first:

```text
Use $nocobase-env-bootstrap task=app-manage:
- app_env_action=add app_env_name=local app_base_url=http://localhost:13000/api app_scope=project target_dir=.
- app_env_action=use app_env_name=local app_scope=project target_dir=.
```

If `env update` fails with `swagger:get`/API documentation plugin errors, activate dependency plugins and retry:

```text
Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc @nocobase/plugin-api-keys
```

Then restart app, refresh token env if needed, and rerun `node ./run-ctl.mjs -- env update -e local`.

2. Verify runtime command availability:

```bash
node ./run-ctl.mjs -- --help
# then inspect resolved acl command group help
```

3. Run task-level checks according to `references/capability-test-plan.md`.

4. For guarded membership fallback checks, explicitly enable policy in task context and use:

```bash
node ./run-ctl.mjs -- resource update --resource users ...
node ./run-ctl.mjs -- resource list --resource users.roles ...
```

## Report Guidance

For each check, report:

- command executed
- status (`pass/warn/fail`)
- concise evidence (key output snippet)
- follow-up mitigation when `warn` or `fail`
