# ACL CLI Command Shapes

This file keeps the historical filename for compatibility, but the active transport is now CLI.

Use this reference when ACL writes fail because command names or argument shapes are uncertain.

## Mandatory Contract

1. Execute ACL operations through skill-local wrapper: `node ./run-ctl.mjs -- <nocobase-ctl-args>`.
2. Prefer ACL-specific runtime commands before generic `resource` commands.
3. Use `-j` for readback and verification output.
4. Resolve actual command names from wrapper-executed help.

## Common ACL Command Shapes

### List roles

```bash
nocobase-ctl acl roles list -j
```

### Create role

```bash
nocobase-ctl acl roles create --name sales_rep --values '{"title":"Sales Rep"}' -j
```

### Update role snippets

```bash
nocobase-ctl acl roles update --filter-by-tk reader --values '{"snippets":["ui.logs","ui.user"]}' -j
```

### List available ACL actions

```bash
nocobase-ctl acl available-actions list -j
```

### Read data-source role strategy

```bash
nocobase-ctl acl data-sources roles get --data-source-key main --filter-by-tk reader -j
```

### Update data-source role strategy

```bash
nocobase-ctl acl data-sources roles update --data-source-key main --filter-by-tk reader --values '{"strategy":{"actions":["view"]}}' -j
```

### List role collections in one data source

```bash
nocobase-ctl acl roles data-sources collections list --role-name reader --data-source-key main -j
```

### Get one role collection resource policy

```bash
nocobase-ctl acl roles data-source-resources get --role-name reader --data-source-key main --name orders -j
```

## Guarded Generic Membership Shape

Only when `allow_generic_association_write=true`.

Assign role:

```bash
nocobase-ctl resource update --resource users --filter-by-tk 1 --values '{"roles":[{"name":"sales_reader"}]}' --update-association-values roles -j
```

Readback:

```bash
nocobase-ctl resource list --resource users.roles --source-id 1 -j
```

## Troubleshooting Hints

1. `command not found`:
- Ensure `node` exists and `./run-ctl.mjs` is present.

2. `unknown command`:
- Run `node ./run-ctl.mjs -- --help`, then resolve actual runtime command name.

3. `Invalid JSON`:
- Validate payload JSON and quote escaping.

4. `401/403/Auth required`:
- Verify selected env/token; run `$nocobase-env-bootstrap task=app-manage app_env_action=current app_scope=project target_dir=<target_dir>` and `node ./run-ctl.mjs -- env update -e <current_env_name>`.
- Ensure `@nocobase/plugin-api-keys` is active, then refresh token env and retry.

5. `swagger:get` or API documentation plugin errors during `env update`:
- Enable dependency bundle and retry:
- `Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc @nocobase/plugin-api-keys`
- Restart app before rerun.

6. Scope or field readback mismatch:
- verify non-null `scopeId` for `all|own`
- verify non-empty explicit field arrays for field-configurable actions
