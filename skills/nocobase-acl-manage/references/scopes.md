# Scopes

## Table of Contents

- [Critical Scope Format Rule](#critical-scope-format-rule)
- [Always Check Built-in Scopes First](#always-check-built-in-scopes-first)
- [Custom Scope Creation Rules](#custom-scope-creation-rules)
- [CLI Tool Rules](#cli-tool-rules)
- [Scope Variables](#scope-variables)
- [Boundary Notes](#boundary-notes)

Use scopes for:

- own-record access
- site/company/department boundaries
- business-unit filters
- published/active/approved subsets

General rule:

- decide scope explicitly for every important action
- if there is no scope, confirm that full-row visibility or mutation is intended

## Critical Scope Format Rule

A scope's `scope` field uses the same filter condition format as other NocoBase filters.

Full format reference: [nocobase-utils / Filter Condition Format](../../nocobase-utils/references/filter/index.md)

Key rules:

- always wrap conditions with `$and` or `$or`; do not place field conditions at root level
- use `$and` for single or AND-combined conditions
- use `$or` for OR-combined conditions
- values can use dynamic variables with `{{path}}`; ACL commonly uses `$user` and `$nRole`

Wrong example (missing logical wrapper):

```json
{
  "department": {
    "id": {
      "$eq": "{{$user.department.id}}"
    }
  }
}
```

Correct examples:

```json
{
  "$and": [
    {
      "createdBy": {
        "id": {
          "$eq": "{{$user.id}}"
        }
      }
    }
  ]
}
```

```json
{
  "$and": [
    {
      "status": {
        "$eq": "published"
      }
    },
    {
      "department": {
        "id": {
          "$eq": "{{$user.department.id}}"
        }
      }
    }
  ]
}
```

```json
{
  "$or": [
    {
      "status": {
        "$eq": "published"
      }
    },
    {
      "createdBy": {
        "id": {
          "$eq": "{{$user.id}}"
        }
      }
    }
  ]
}
```

## Always Check Built-in Scopes First

Before creating any custom scope, list existing scopes first through CLI read commands.

Built-in scopes:

- `all`
  - means no row restriction
- `own`
  - means own-record semantics based on `createdById`
  - use for "only own records" requirements tied to creator identity

Do not create custom scopes for patterns already covered by built-in scopes.

Use built-in `scopeId` directly when binding action permissions.

## Custom Scope Creation Rules

Only create custom scopes when built-in scopes cannot satisfy the requirement.

Typical custom cases:

- department-level access
- manager approval boundaries
- site-specific data
- published-content-only filters
- custom ownership fields (not `createdBy`)

## CLI Tool Rules

This skill is CLI-first. Do not call REST endpoints such as `/api/*` directly.

Common scope-related CLI commands:

- `data_sources_roles_resources_scopes_list`
- `data_sources_roles_resources_scopes_get`
- `data_sources_roles_resources_scopes_create`
- `data_sources_roles_resources_scopes_update`
- `data_sources_roles_resources_scopes_destroy`

All calls should use resolved `nocobase-ctl` runtime commands through skill-local wrapper (`node ./scripts/run-ctl.mjs -- <nocobase-ctl-args>`) discovered from CLI help, after env context is confirmed by `$nocobase-env-bootstrap task=app-manage app_env_action=current app_scope=project target_dir=<target_dir>`.

Business rules:

- create business scopes under the target data source
- do not create business scopes in global `rolesResourcesScopes`
- when creating a scope, pass business fields such as `name`, `resourceName`, and `scope`
- do not pass `id` when creating a scope
- bind existing scopes via `scopeId`
- do not bind by nested `scope.id` or full `scope` object

## Scope Variables

The ACL scope variable selector primarily exposes:

- `$user`
  - current user
  - backed by the `users` collection
  - nested paths such as `{{$user.department.manager.id}}` may be available when relations exist
- `$nRole`
  - current role
  - bound to the `roles` collection
  - mainly intended for current role value checks

Recommended usage:

- use `$user` for most business scopes
- examples: `{{$user.id}}`, `{{$user.site.id}}`, `{{$user.company.id}}`

## Boundary Notes

- `own` does not mean owner, assignee, approver, manager, or department member
- for those semantics, create a custom scope and reference `$user` against real business relation paths


