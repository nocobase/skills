# ACL Intent Presets v1

This reference defines task-driven intent presets for `nocobase-acl-manage` v2.

Use presets to translate business language into stable task inputs.

## Preset Principles

- explicit user values override preset defaults
- use conservative defaults for blank role creation
- role creation uses a single baseline mode (default read-only)
- treat global role mode as system policy, not role metadata
- require confirmation for high-impact presets

## Global Role-Mode Language Mapping

| User wording | Canonical Task | role_mode |
|---|---|---|
| 独立角色 / 不使用并集 / 逐个切换角色 | `global.role-mode.set` | `default` |
| 允许角色并集 / 可同时使用所有角色权限 | `global.role-mode.set` | `allow-use-union` |
| 仅角色并集 / 强制用户只能使用并集角色 | `global.role-mode.set` | `only-use-union` |

If user says "set mode for role X", normalize to global mode task and explain global impact.

## Role Creation Presets

## `blank-role`

Intended use:

- create a role with no default business permissions
- force explicit follow-up for permission grants

Applied defaults:

```json
{
  "allowConfigure": false,
  "allowNewMenu": false,
  "snippets": ["!ui.*", "!pm", "!pm.*", "!app"],
  "strategy": { "actions": [] }
}
```

Post-create prompt:

- `Role created as blank baseline. Which permissions should be granted next (system snippets, routes, global actions, resource actions)?`
- `角色已按默认只读基线创建。下一步要分配哪些权限（系统 snippets、页面路由权限、全局数据源权限、表级独立权限）？`

Role creation interaction rule (hard rule):

- do not present role archetype menus such as "employee/auditor/manager/custom"
- when intent is "create role", normalize to `role.create-blank` and execute directly once `role_name` is known
- if `role_name` is missing, ask only for `role_name`
- after creation, ask only about permission assignment scope

## Resource Permission Preset

For `permission.data-source.resource.set`, required pre-write inputs:

- data source (`data_source_key`, default `main` unless user specifies another)
- collection hint input (`collection_hint` or `collection_hints[]`, business name/keyword allowed)
- resolved collection targets (`resolved_collection_names[]`)
- action list (`actions[]`)
- data scope (`all` or `own` or `custom`)

If any required input is missing:

- ask user for the missing part first
- do not execute writes

Resolution behavior:

- do not force user to provide exact technical collection names
- list collections from the selected data source and auto-match by hint
- if one hint matches multiple collections, present candidates and ask user to choose
- if no collection can be matched, ask user to provide a clearer business keyword
- resolve scope binding before write:
  - `all` -> built-in scope id where `key=all`
  - `own` -> built-in scope id where `key=own`
  - `custom` -> user-specified scope id/key
- do not keep action scope as null when user selected `all` or `own`
- before write, confirm: data source + resolved collections + actions + scope

Action-language normalization:

- Treat operation wording (`add/configure/set table permission`) as task intent, not ACL action `create`.
- Resolve ACL actions only from explicit capability wording, for example:
  - `can create/add records` -> `create`
  - `can view/read` -> `view`
  - `can edit/update` -> `update`
  - `can export` -> `export`
  - `can import` -> `importXlsx`
- If user says `all permissions on this table`, expand to runtime available action set (typically `create/view/update/destroy/export/importXlsx`) and confirm before write.

Field default policy:

- default is all fields for each selected action
- if user says only "grant view", treat it as "grant view on all fields"
- implement default-all behavior as explicit non-empty field-name arrays resolved from the target collection
- do not use `fields: []` as a full-field shortcut
- if user provides explicit field restrictions, respect user-provided field list
- when multiple field-configurable actions are selected, apply full-field defaults to each selected action unless user restricts fields per action

## System Snippet Presets

| Preset | Intended Use | Snippets | Risk |
|---|---|---|---|
| `none` | blank role baseline | `["!ui.*","!pm","!pm.*","!app"]` | low |
| `minimal-ui` | basic interface access only | `["ui.*"]` | medium |
| `ops-admin` | operations and plugin administration | `["ui.*","pm","pm.*","app"]` | high |
| `plugin-doc-admin` | manage API docs plus UI | `["ui.*","pm.api-doc.documentation"]` | medium |

## Data Source Global Action Presets

| Preset | Intended Use | Global Actions | Risk |
|---|---|---|---|
| `none` | deny-by-default baseline | `[]` | low |
| `read-only` | read only | `["view"]` | low |
| `editor` | create and edit without delete | `["view","create","update"]` | medium |
| `manager` | full CRUD | `["view","create","update","destroy"]` | high |

## Risk Evaluation Presets

| Preset | Intended Use | Focus |
|---|---|---|
| `quick` | quick governance check | snippets + global actions + mode |
| `standard` | default risk assessment | quick + resource exceptions + membership breadth |
| `deep` | audit-grade review | standard + scope quality + route spread + privilege concentration |

## Task Defaults

### Role Domain

- `role.create-blank`: always use `blank-role` baseline first; do not ask role-type questions
- `role.audit-all`: include `data_source_key=main` summary by default

### Global Role-Mode Domain

- no default write mode; require explicit target mode
- read task default: `global.role-mode.get`

### Permission Domain

- `permission.system-snippets.set`: require explicit snippets or preset
- `permission.data-source.global.set`: default `data_source_key=main`
- `permission.route.desktop.set`: default `set_mode=set`
- `permission.data-source.resource.set`: collection hint(s)/actions/scope are mandatory; default data source is `main`; if fields are omitted, default to explicit full-field lists

### User Domain

- default `allow_generic_association_write=false`
- require explicit enablement for guarded fallback path

### Risk Domain

- default `preset=standard`
- default `data_source_key=main`

## Confirmation Templates

High-impact global role mode:

- `You are about to change global role mode to {{role_mode}}. This may affect every multi-role user. Continue?`

High-impact snippets:

- `You are about to grant high-privilege snippets (pm/pm.*/app/ui.*). Continue?`

Resource permission write confirmation:

- `Please confirm before write: data_source={{data_source_key}}, collections={{resolved_collection_names}}, actions={{actions}}, scope={{resource_scope}}, resolved_scope_id={{resolved_scope_id}}. Continue?`

Guarded fallback for user-role writes:

- `Enable guarded generic association writes for user-role membership in this task?`
