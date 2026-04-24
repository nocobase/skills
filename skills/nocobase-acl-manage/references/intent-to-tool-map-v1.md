# ACL Intent To Command Map v1

This reference maps canonical tasks to `nb` CLI commands for `nocobase-acl-manage` v2.

All operations should use CLI commands.
Execute ACL commands through direct nb CLI:

- `nb <command> [subcommand ...] [flags ...]`
- command must start with a command token (for example `env` or `api`) before flags.
- do not start passthrough with flags such as `-e/-t/-j`; this is an invalid command assembly.
- wrong: `nb -e local`
- correct: `nb api resource list --resource users -e local -j`
- preflight must validate independent resource policy writes:
  - target commands: `api acl roles data-source-resources create|update` and `api acl roles apply-data-permissions`
  - prefer `--body-file <json_path>` over inline `--body` in PowerShell/Windows
  - require payload JSON with `usingActionsConfig=true` and non-empty `actions[]`
  - require non-empty `fields[]` for `create/view/update/export/importXlsx`
  - require explicit scope binding (`scopeId` or `scopeKey`) for scoped actions (`view/update/destroy/export/importXlsx`)
  - fail fast before CLI execution when payload is malformed

Resolve current env context through direct CLI:

- `nb env list -s project` (resolve current env from row marked with `*`)

## Runtime Command Discovery

Because runtime commands are generated from swagger, command names can vary by build config.

Prerequisite gate before runtime discovery:

0. Lock one `base-dir` for the whole task (do not switch base-dir mid-task).
1. Run `nb env list -s project` to get `current_env_name` from the `*` row.
2. If there is no current env, add/use one first:
   - local URL: `nb env add <env> --scope project --api-base-url <local_url>/api --auth-type oauth`
   - remote URL (token): `nb env add <env> --scope project --api-base-url <remote_url>/api --auth-type token --access-token <token>`
   - switch: `nb env use <env> -s project`
3. Run `nb env update <current_env_name>`.
4. If output shows `swagger:get` 404 or API documentation plugin error, activate dependency bundle and retry:
   - `nb pm enable @nocobase/plugin-api-doc`
   - `nb pm enable @nocobase/plugin-api-keys`
   - restart app before rerun.
5. If output shows `401/403/Auth required`, ensure `@nocobase/plugin-api-keys` is active and refresh token env first.
6. If `nb api acl --help` or `nb api acl roles --help` still fails in this same `base-dir`, fail closed:
   - stop write execution
   - emit recovery guidance
   - do not use temporary script-file execution as a fallback path

Resolution order:

1. Try preferred command patterns in this file.
2. Confirm with `nb --help` and CLI subcommand help.
3. If preferred pattern is absent, match by fallback regex over command tree text.
4. Record the resolved runtime command names in execution evidence.

## Shared CLI Flags

- `-e, --env`: environment name override
- `-t, --token`: token override
- `-j, --json-output`: machine-readable output

Prefer `-j` for all readback and verification steps.

## Common Parameter Patterns

| Command Pattern | Required Parameters | Optional Parameters | Notes |
|---|---|---|---|
| `acl roles list` | none | `--page`, `--page-size`, `--filter` | Returns all roles |
| `acl roles get` | `--filter-by-tk <roleName>` | none | Get single role by name |
| `acl roles create` | `--body <json>` or `--body-file <path>` | none | Prefer `--body-file` in PowerShell/Windows |
| `acl roles update` | `--filter-by-tk <roleName>`, (`--body <json>` or `--body-file <path>`) | none | Prefer `--body-file` in PowerShell/Windows |
| `acl roles destroy` | `--filter-by-tk <roleName>` | none | Deletes role |
| `acl roles check` | none | none | Returns current user's role context + global roleMode |
| `acl roles set-system-role-mode` | `--role-mode <default|allow-use-union|only-use-union>` | none | Global setting, not per-role |
| `acl roles data-sources-collections list` | `--role-name <name>`, `--data-source-key <key>` | `--page`, `--page-size`, `--filter` | Prefer `--data-source-key`; `--filter` is compatibility only |
| `acl roles data-source-resources get` | `--role-name <name>`, (`--filter-by-tk <id>` or `--data-source-key <key> --name <coll>`) | `--filter`, `--appends actions` | Prefer explicit locator (`filterByTk` or `data-source-key + name`); for action-level readback use `--appends actions` |
| `acl roles data-source-resources create` | `--role-name <name>`, (`--body <json>` or `--body-file <path>`) | none | Prefer `--body-file`; payload must include `name`, `dataSourceKey`, `usingActionsConfig`, `actions` |
| `acl roles data-source-resources update` | `--role-name <name>`, (`--body <json>` or `--body-file <path>`), (`--filter-by-tk <id>` or `--data-source-key <key> --name <coll>`) | `--filter` | Prefer `--body-file`; `--filter-by-tk` is resource config id |
| `acl roles apply-data-permissions` | `--filter-by-tk <roleName>`, (`--body <json>` or `--body-file <path>`) | `--data-source-key`, `--resources` | Unified independent-permission write path (single or batch resources) |
| `acl data-sources roles get` | `--data-source-key <key>`, `--filter-by-tk <roleName>` | none | Get global strategy for role in data source |
| `acl data-sources roles update` | `--data-source-key <key>`, `--filter-by-tk <roleName>`, (`--body <json>` or `--body-file <path>`) | none | Prefer `--body-file`; body should include `roleName`, `dataSourceKey`, `strategy` |
| `acl data-sources roles-resources-scopes list` | `--data-source-key <key>` | `--page`, `--filter` | Lists reusable scopes |
| `acl data-sources roles-resources-scopes create` | `--data-source-key <key>`, (`--body <json>` or `--body-file <path>`) | none | Prefer `--body-file` |
| `acl data-sources roles-resources-scopes update` | `--data-source-key <key>`, `--filter-by-tk <scopeId>`, (`--body <json>` or `--body-file <path>`) | none | Prefer `--body-file` |
| `acl data-sources roles-resources-scopes destroy` | `--data-source-key <key>`, `--filter-by-tk <scopeId>` | none | Delete reusable scope |
| `acl available-actions list` | none | `--page`, `--filter` | Lists all available ACL actions |
| `resource list` | `--resource <name>` | `--source-id`, `--filter`, `--page`, `--appends` | For association reads and collection metadata reads (`--resource collections --filter '{}' --appends fields`) |
| `resource get` | `--resource <name>`, `--filter-by-tk <id>` | none | Get single resource |
| `resource update` | `--resource <name>`, `--filter-by-tk <id>`, `--values <json>` | `--update-association-values` | For membership writes |

## Logical Command Mapping

| Logical Capability | Preferred CLI Patterns | Regex Fallback |
|---|---|---|
| `roles_list` | `nb api acl roles list` | `(^|\s)roles\s+list$` |
| `roles_get` | `nb api acl roles get --filter-by-tk <name>` | `(^|\s)roles\s+get$` |
| `roles_create` | `nb api acl roles create --body-file <path>` | `(^|\s)roles\s+create$` |
| `roles_update` | `nb api acl roles update --filter-by-tk <name> --body-file <path>` | `(^|\s)roles\s+update$` |
| `roles_destroy` | `nb api acl roles destroy --filter-by-tk <name>` | `(^|\s)roles\s+destroy$` |
| `roles_set_system_role_mode` | `nb api acl roles set-system-role-mode --role-mode <mode>` | `role.*mode.*(set|update)` |
| `roles_check` | `nb api acl roles check` | `(^|\s)roles\s+check$` |
| `available_actions_list` | `nb api acl available-actions list` | `available.*actions.*list` |
| `data_sources_roles_get` | `nb api acl data-sources roles get --data-source-key <key> --filter-by-tk <name>` | `data.*sources.*roles.*get$` |
| `data_sources_roles_update` | `nb api acl data-sources roles update --data-source-key <key> --filter-by-tk <name> --body-file <path>` | `data.*sources.*roles.*update$` |
| `roles_data_sources_collections_list` | `nb api acl roles data-sources-collections list --role-name <name> --data-source-key <key>` | `roles.*data.*sources.*collections.*list` |
| `collections_list_with_fields` | `nb api resource list --resource collections --filter '{}' --appends fields` | `resource\s+list.*--resource\s+collections` |
| `roles_data_source_resources_get` | `nb api acl roles data-source-resources get --role-name <name> --data-source-key <key> --name <coll>` | `roles.*data.*source.*resources.*get` |
| `roles_data_source_resources_create` | `nb api acl roles data-source-resources create --role-name <name> --body-file <path>` | `roles.*data.*source.*resources.*create$` |
| `roles_data_source_resources_update` | `nb api acl roles data-source-resources update --role-name <name> --filter-by-tk <id> --body-file <path>` | `roles.*data.*source.*resources.*update$` |
| `roles_apply_data_permissions` | `nb api acl roles apply-data-permissions --filter-by-tk <name> --body-file <path>` | `roles.*apply.*data.*permissions$` |
| `roles_desktop_routes_list` | `nb api acl roles desktop-routes list --role-name <name>` | `roles.*desktop.*routes.*list` |
| `roles_desktop_routes_set` | `nb api acl roles desktop-routes set --role-name <name> --body-file <path>` | `roles.*desktop.*routes.*set` |
| `roles_desktop_routes_add` | `nb api acl roles desktop-routes add --role-name <name> --body-file <path>` | `roles.*desktop.*routes.*add` |
| `roles_desktop_routes_remove` | `nb api acl roles desktop-routes remove --role-name <name> --body-file <path>` | `roles.*desktop.*routes.*remove` |
| `roles_resources_scopes_list` | `nb api acl roles resources-scopes list --role-name <name> --data-source-key <key>` | `roles.*resources.*scopes.*list` |
| `roles_resources_scopes_get` | `nb api acl roles resources-scopes get --role-name <name> --data-source-key <key> --filter-by-tk <id>` | `roles.*resources.*scopes.*get` |
| `data_sources_roles_resources_scopes_list` | `nb api acl data-sources roles-resources-scopes list --data-source-key <key>` | `data.*sources.*roles.*resources.*scopes.*list` |
| `data_sources_roles_resources_scopes_create` | `nb api acl data-sources roles-resources-scopes create --data-source-key <key> --body-file <path>` | `data.*sources.*roles.*resources.*scopes.*create$` |
| `data_sources_roles_resources_scopes_update` | `nb api acl data-sources roles-resources-scopes update --data-source-key <key> --filter-by-tk <id> --body-file <path>` | `data.*sources.*roles.*resources.*scopes.*update$` |
| `data_sources_roles_resources_scopes_destroy` | `nb api acl data-sources roles-resources-scopes destroy --data-source-key <key> --filter-by-tk <id>` | `data.*sources.*roles.*resources.*scopes.*destroy$` |
| `resource_list` | `nb api resource list --resource <name>` | `(^|\s)resource\s+list$` |
| `resource_get` | `nb api resource get --resource <name> --filter-by-tk <id>` | `(^|\s)resource\s+get$` |
| `resource_update` | `nb api resource update --resource <name> --filter-by-tk <id> --values '<json>'` | `(^|\s)resource\s+update$` |

## Domain Execution Map

## A) Role Domain

### `role.audit-all`

1. `roles_list`
2. for each role: `roles_get`
3. optional per role: `data_sources_roles_get`
4. optional compare blocks: `roles_data_source_resources_get`

### `role.create-blank`

1. `roles_create` with conservative payload
2. `roles_get` readback

Conservative baseline payload:

```json
{
  "name": "sales_reader",
  "title": "Sales Reader",
  "description": "Blank role baseline",
  "hidden": false,
  "allowConfigure": false,
  "allowNewMenu": false,
  "snippets": ["!ui.*", "!pm", "!pm.*", "!app"],
  "strategy": { "actions": [] }
}
```

### `role.compare`

1. `roles_get` for each target role
2. `data_sources_roles_get` for each role in target data source
3. optional `roles_data_sources_collections_list` and `roles_data_source_resources_get`

## B) Global Role-Mode Domain

Important: this is global configuration, not a per-role field.

### `global.role-mode.get`

1. `roles_check`
2. read `roleMode` from payload

### `global.role-mode.set`

1. `roles_set_system_role_mode` with `roleMode`
2. `roles_check` readback verify mode string

## C) Permission Domain

### `permission.system-snippets.set`

1. `roles_update` (`snippets`)
2. `roles_get` readback

### `permission.route.desktop.set`

1. choose one write command by intent: `set` or `add` or `remove`
2. `roles_desktop_routes_list` readback

### `permission.data-source.global.set`

1. `data_sources_roles_update`
2. `data_sources_roles_get` readback

### `permission.data-source.resource.set`

Required planning inputs before write:

1. data source key (`data_source_key`, default `main`)
2. collection hint(s) from user (`collection_hint` or `collection_hints[]`)
3. action list
4. data scope (`all` default when omitted; or `own` / `custom`)
5. resolved collection names (`resolved_collection_names[]`)
6. resolved scope binding (`resolved_scope_id` / `resolved_scope_key`)
7. resolved full-field list for field-configurable actions (`resolved_field_names_by_action`)

Resolution policy:

- user input may be business-facing names, not exact technical collection names
- do not infer ACL action `create` from generic operation wording
- resolve by listing collection metadata via `resource list --resource collections --filter '{}' --appends fields` and matching hints
- `roles data-sources-collections list` is optional role-facing evidence; do not treat it as the only source of truth
- if user does not specify scope, default to `all`
- confirmation must explicitly show `scope=all (default)` and allow user override before write
- if any hint maps to multiple collections, ask user to choose
- if any hint has no matches, ask user for clearer input
- resolve scope through scope-list command:
  - `all` -> row with `key=all`
  - `own` -> row with `key=own`
  - `custom` -> user-selected scope id/key
- do not write until resolved collections are explicitly confirmed

Execution chain:

1. `collections_list_with_fields` to fetch concrete collection names and field metadata
2. optional `roles_data_sources_collections_list` (include `dataSourceKey`) for role-facing `usingConfig` evidence
3. `data_sources_roles_resources_scopes_list` to resolve built-in/custom scope binding
4. resolve hints into concrete collection names
5. resolve full-field defaults from collection metadata when user did not provide field restrictions
6. show pre-write confirmation summary
7. optional `roles_data_source_resources_get` (for each resolved collection) to check current record existence
8. preferred write: `roles_apply_data_permissions` with one complete `resources[]` payload (single or batch collections), each item including `usingActionsConfig=true` + final `actions[]` with explicit scope binding (`scopeId` or `scopeKey`) and explicit `fields[]` where applicable; compatibility path: `roles_data_source_resources_create` or `roles_data_source_resources_update`
9. `roles_data_source_resources_get` readback with `--appends actions`

## D) User Domain

Default policy: do not use generic commands for ACL writes.

### strict path (`allow_generic_association_write=false`)

- if no dedicated role-user write command is available, return boundary message

### guarded fallback path (`allow_generic_association_write=true`)

Allowed only for `users.roles` membership updates:

- assign role:

```bash
nb api resource update --resource users --filter-by-tk <userId> --values '{"roles":[{"name":"sales_reader"}]}' --update-association-values roles -j
```

- readback:

```bash
nb api resource list --resource users.roles --source-id <userId> -j
```

or

```bash
nb api resource list --resource roles.users --source-id <roleName> -j
```

## E) Risk Domain

Risk tasks are computed by combining read commands:

1. `roles_list` and `roles_get`
2. `roles_check` (global role mode and effective context)
3. `available_actions_list`
4. `data_sources_roles_get`
5. optional `roles_data_source_resources_get` and scope commands
6. membership reads via `resource list users.roles` or `resource list roles.users`

## Validation Rules

- resolve all required logical commands before write operations
- `roles data-source-resources` supports `create|get|update` only; do not attempt a `list` subcommand
- `roles apply-data-permissions` is the preferred unified write path for independent resource permissions (single or batch collections)
- prefer `roles data-source-resources` locator as `--filter-by-tk` or `--data-source-key + --name`; do not rely on `--filter` as the primary path
- for collection metadata resolution, do not rely solely on `roles data-sources-collections list`; use `resource collections` metadata path as the authoritative source
- for scope=`all|own`, require explicit scope binding in write payload (`scopeId` or `scopeKey`)
- when scope input is omitted, apply `all` by default; payload may bind scope by `scopeId` or `scopeKey`, and readback must resolve to non-null `scopeId`
- for field-configurable actions with default-all behavior, require explicit non-empty `fields` arrays in write payload
- for `permission.data-source.resource.set`, require `usingActionsConfig=true` in the same write payload that carries `actions[]`
- do not split resource writes into staged patches (for example, first write `actions`, then patch `usingActionsConfig` or `fields` later)
- preflight must reject malformed independent-resource payloads (missing/invalid `usingActionsConfig`, `actions`, scope binding `scopeId|scopeKey`, or `fields`) before execution
- if user asks for `all permissions`, expanded runtime action set must be shown and confirmed before write
- do not execute `permission.data-source.resource.set` writes until resolved collections are confirmed by user
- never execute guarded fallback path unless explicitly enabled
- every write must have readback evidence
- action-level independent-permission readback should use `roles data-source-resources get ... --appends actions`

## Unsupported / Blocked Rules

If strict policy blocks a request:

- `This operation is blocked by current governance policy in this skill.`
- `If you want, enable guarded fallback for user-role membership updates, or finish in NocoBase admin UI.`
