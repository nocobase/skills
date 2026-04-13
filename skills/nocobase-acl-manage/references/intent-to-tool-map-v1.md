# ACL Intent To Command Map v1

This reference maps canonical tasks to `nocobase-ctl` CLI commands for `nocobase-acl-manage` v2.

All operations should use CLI commands instead of MCP JSON-RPC.
Execute through shared wrapper:

- `node skills/run-ctl.mjs -- <nocobase-ctl-args>`

## Runtime Command Discovery

Because runtime commands are generated from swagger, command names can vary by build config.

Prerequisite gate before runtime discovery:

1. Run `node skills/run-ctl.mjs -- env update -e <env>`.
2. If output shows `swagger:get` 404 or API documentation plugin error, activate dependency bundle and retry:
   - `Use $nocobase-plugin-manage enable @nocobase/plugin-api-doc @nocobase/plugin-api-keys`
   - restart app before rerun.
3. If output shows `401/403/Auth required`, ensure `@nocobase/plugin-api-keys` is active and refresh token env first.

Resolution order:

1. Try preferred command patterns in this file.
2. Confirm with `node skills/run-ctl.mjs -- --help` and wrapper-executed subcommand help.
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
| `acl roles create` | `--body <json>` | none | Body contains full role payload |
| `acl roles update` | `--filter-by-tk <roleName>`, `--body <json>` | none | Updates role fields |
| `acl roles destroy` | `--filter-by-tk <roleName>` | none | Deletes role |
| `acl roles check` | none | none | Returns current user's role context + global roleMode |
| `acl roles set-system-role-mode` | `--role-mode <default|allow-use-union|only-use-union>` | none | Global setting, not per-role |
| `acl roles data-sources-collections list` | `--role-name <name>` | `--filter`, `--page`, `--page-size` | Use `--filter '{"dataSourceKey":"main"}'` to filter by data source |
| `acl roles data-source-resources get` | `--data-source-key <key>`, `--role-name <name>`, `--collection-name <coll>` | none | Get resource permission for one collection |
| `acl roles data-source-resources create` | `--data-source-key <key>`, `--role-name <name>`, `--collection-name <coll>`, `--body <json>` | none | Create collection-level permission |
| `acl roles data-source-resources update` | `--data-source-key <key>`, `--role-name <name>`, `--collection-name <coll>`, `--filter-by-tk <id>`, `--body <json>` | none | Update collection-level permission; `--filter-by-tk` is the resource config id, not collection name |
| `acl data-sources roles get` | `--data-source-key <key>`, `--filter-by-tk <roleName>` | none | Get global strategy for role in data source |
| `acl data-sources roles update` | `--data-source-key <key>`, `--filter-by-tk <roleName>`, `--body <json>` | none | Body should include `roleName`, `dataSourceKey`, `strategy` |
| `acl data-sources roles-resources-scopes list` | `--data-source-key <key>` | `--page`, `--filter` | Lists reusable scopes |
| `acl data-sources roles-resources-scopes create` | `--data-source-key <key>`, `--body <json>` | none | Create reusable scope |
| `acl data-sources roles-resources-scopes update` | `--data-source-key <key>`, `--filter-by-tk <scopeId>`, `--body <json>` | none | Update reusable scope |
| `acl data-sources roles-resources-scopes destroy` | `--data-source-key <key>`, `--filter-by-tk <scopeId>` | none | Delete reusable scope |
| `acl available-actions list` | none | `--page`, `--filter` | Lists all available ACL actions |
| `resource list` | `--resource <name>` | `--source-id`, `--filter`, `--page` | For association reads (e.g., `users.roles`) |
| `resource get` | `--resource <name>`, `--filter-by-tk <id>` | none | Get single resource |
| `resource update` | `--resource <name>`, `--filter-by-tk <id>`, `--values <json>` | `--update-association-values` | For membership writes |

## Logical Command Mapping

| Logical Capability | Preferred CLI Patterns | Regex Fallback |
|---|---|---|
| `roles_list` | `nocobase-ctl acl roles list` | `(^|\s)roles\s+list$` |
| `roles_get` | `nocobase-ctl acl roles get --filter-by-tk <name>` | `(^|\s)roles\s+get$` |
| `roles_create` | `nocobase-ctl acl roles create --body '<json>'` | `(^|\s)roles\s+create$` |
| `roles_update` | `nocobase-ctl acl roles update --filter-by-tk <name> --body '<json>'` | `(^|\s)roles\s+update$` |
| `roles_destroy` | `nocobase-ctl acl roles destroy --filter-by-tk <name>` | `(^|\s)roles\s+destroy$` |
| `roles_set_system_role_mode` | `nocobase-ctl acl roles set-system-role-mode --role-mode <mode>` | `role.*mode.*(set|update)` |
| `roles_check` | `nocobase-ctl acl roles check` | `(^|\s)roles\s+check$` |
| `available_actions_list` | `nocobase-ctl acl available-actions list` | `available.*actions.*list` |
| `data_sources_roles_get` | `nocobase-ctl acl data-sources roles get --data-source-key <key> --filter-by-tk <name>` | `data.*sources.*roles.*get$` |
| `data_sources_roles_update` | `nocobase-ctl acl data-sources roles update --data-source-key <key> --filter-by-tk <name> --body '<json>'` | `data.*sources.*roles.*update$` |
| `roles_data_sources_collections_list` | `nocobase-ctl acl roles data-sources-collections list --role-name <name> --filter '{"dataSourceKey":"<key>"}'` | `roles.*data.*sources.*collections.*list` |
| `roles_data_source_resources_get` | `nocobase-ctl acl roles data-source-resources get --data-source-key <key> --role-name <name> --collection-name <coll>` | `roles.*data.*source.*resources.*get` |
| `roles_data_source_resources_create` | `nocobase-ctl acl roles data-source-resources create --data-source-key <key> --role-name <name> --collection-name <coll> --body '<json>'` | `roles.*data.*source.*resources.*create$` |
| `roles_data_source_resources_update` | `nocobase-ctl acl roles data-source-resources update --data-source-key <key> --role-name <name> --collection-name <coll> --filter-by-tk <id> --body '<json>'` | `roles.*data.*source.*resources.*update$` |
| `roles_desktop_routes_list` | `nocobase-ctl acl roles desktop-routes list --role-name <name>` | `roles.*desktop.*routes.*list` |
| `roles_desktop_routes_set` | `nocobase-ctl acl roles desktop-routes set --role-name <name> --body '<json>'` | `roles.*desktop.*routes.*set` |
| `roles_desktop_routes_add` | `nocobase-ctl acl roles desktop-routes add --role-name <name> --body '<json>'` | `roles.*desktop.*routes.*add` |
| `roles_desktop_routes_remove` | `nocobase-ctl acl roles desktop-routes remove --role-name <name> --body '<json>'` | `roles.*desktop.*routes.*remove` |
| `roles_resources_scopes_list` | `nocobase-ctl acl roles resources-scopes list --role-name <name> --data-source-key <key>` | `roles.*resources.*scopes.*list` |
| `roles_resources_scopes_get` | `nocobase-ctl acl roles resources-scopes get --role-name <name> --data-source-key <key> --filter-by-tk <id>` | `roles.*resources.*scopes.*get` |
| `data_sources_roles_resources_scopes_list` | `nocobase-ctl acl data-sources roles-resources-scopes list --data-source-key <key>` | `data.*sources.*roles.*resources.*scopes.*list` |
| `data_sources_roles_resources_scopes_create` | `nocobase-ctl acl data-sources roles-resources-scopes create --data-source-key <key> --body '<json>'` | `data.*sources.*roles.*resources.*scopes.*create$` |
| `data_sources_roles_resources_scopes_update` | `nocobase-ctl acl data-sources roles-resources-scopes update --data-source-key <key> --filter-by-tk <id> --body '<json>'` | `data.*sources.*roles.*resources.*scopes.*update$` |
| `data_sources_roles_resources_scopes_destroy` | `nocobase-ctl acl data-sources roles-resources-scopes destroy --data-source-key <key> --filter-by-tk <id>` | `data.*sources.*roles.*resources.*scopes.*destroy$` |
| `resource_list` | `nocobase-ctl resource list --resource <name>` | `(^|\s)resource\s+list$` |
| `resource_get` | `nocobase-ctl resource get --resource <name> --filter-by-tk <id>` | `(^|\s)resource\s+get$` |
| `resource_update` | `nocobase-ctl resource update --resource <name> --filter-by-tk <id> --values '<json>'` | `(^|\s)resource\s+update$` |

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
4. data scope (`all` or `own` or `custom`)
5. resolved collection names (`resolved_collection_names[]`)
6. resolved scope binding (`resolved_scope_id` / `resolved_scope_key`)
7. resolved full-field list for field-configurable actions (`resolved_field_names_by_action`)

Resolution policy:

- user input may be business-facing names, not exact technical collection names
- do not infer ACL action `create` from generic operation wording
- resolve by listing collections in selected data source and matching hints
- if any hint maps to multiple collections, ask user to choose
- if any hint has no matches, ask user for clearer input
- resolve scope through scope-list command:
  - `all` -> row with `key=all`
  - `own` -> row with `key=own`
  - `custom` -> user-selected scope id/key
- do not write until resolved collections are explicitly confirmed

Execution chain:

1. `roles_data_sources_collections_list` (include `dataSourceKey`) to fetch collections
2. `data_sources_roles_resources_scopes_list` to resolve built-in/custom scope binding
3. resolve hints into concrete collection names
4. resolve full-field defaults from collection metadata when user did not provide field restrictions
5. show pre-write confirmation summary
6. `roles_data_source_resources_get` (for each resolved collection)
7. `roles_data_source_resources_create` or `roles_data_source_resources_update` (for each resolved collection)
8. `roles_data_source_resources_get` readback

## D) User Domain

Default policy: do not use generic commands for ACL writes.

### strict path (`allow_generic_association_write=false`)

- if no dedicated role-user write command is available, return boundary message

### guarded fallback path (`allow_generic_association_write=true`)

Allowed only for `users.roles` membership updates:

- assign role:

```bash
nocobase-ctl resource update --resource users --filter-by-tk <userId> --values '{"roles":[{"name":"sales_reader"}]}' --update-association-values roles -j
```

- readback:

```bash
nocobase-ctl resource list --resource users.roles --source-id <userId> -j
```

or

```bash
nocobase-ctl resource list --resource roles.users --source-id <roleName> -j
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
- for scope=`all|own`, require non-null scope binding in write payload (`scopeId`)
- for field-configurable actions with default-all behavior, require explicit non-empty `fields` arrays in write payload
- if user asks for `all permissions`, expanded runtime action set must be shown and confirmed before write
- do not execute `permission.data-source.resource.set` writes until resolved collections are confirmed by user
- never execute guarded fallback path unless explicitly enabled
- every write must have readback evidence

## Unsupported / Blocked Rules

If strict policy blocks a request:

- `This operation is blocked by current governance policy in this skill.`
- `If you want, enable guarded fallback for user-role membership updates, or finish in NocoBase admin UI.`
