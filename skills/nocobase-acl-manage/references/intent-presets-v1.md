# ACL Intent Presets v1

This document defines task-driven presets for `nocobase-acl-manage`.

Use these presets to translate business intent into stable ACL payloads without exposing MCP parameter complexity to end users.

## Preset Principles

- Presets are starting points, not immutable policies.
- Explicit user-provided values override preset defaults.
- Prefer conservative permissions for new roles.
- Keep snippets and global actions separate so risk can be reviewed clearly.

## Snippet Presets

| Preset | Intended Use | Snippets |
|---|---|---|
| `minimal-ui` | safe baseline for new business role | `["ui.*"]` |
| `ops-admin` | operation users who manage plugins and app settings | `["ui.*", "pm", "pm.*", "app"]` |
| `plugin-doc-admin` | manage API doc plugin plus normal UI settings | `["ui.*", "pm.api-doc.documentation"]` |
| `read-only-audit` | strict observer role | `[]` |

Notes:

- `ops-admin` is high-impact and should require explicit confirmation.
- `read-only-audit` relies mostly on global action restrictions rather than snippet grants.

## Global Action Presets

| Preset | Intended Use | Global Actions |
|---|---|---|
| `read-only` | only view data | `["view"]` |
| `editor` | create and modify without delete | `["view", "create", "update"]` |
| `manager` | full basic CRUD | `["view", "create", "update", "destroy"]` |
| `none` | deny-by-default baseline | `[]` |

## Task Defaults

### `onboard-role`

- default `snippet_preset`: `minimal-ui`
- default `global_actions`: not applied unless user asks or preset implies it
- default `set_default`: `false`

### `set-system-snippets`

- must provide either `snippet_preset` or explicit `snippets`
- if both provided, explicit `snippets` wins

### `set-global-actions`

- must provide explicit `global_actions` or one action preset
- default `data_source_key`: `main`

## Conflict Resolution Rules

- user `snippets` overrides `snippet_preset`
- user `global_actions` overrides action preset
- empty arrays are valid only if user intent is explicit deny-by-default

## Recommended Confirmation Text

For high-impact presets:

- `你即将应用高权限预设（例如 pm 或 app 相关能力）。是否继续？`

For conservative presets:

- `将按保守预设应用，完成后我会给你读回校验结果。`
