# ACL Capability Verification Matrix

This document defines executable capability checks for `nocobase-acl-manage` by MCP calls only.

## Scope

Included in this matrix:

- phase 1: smoke + base capabilities
- phase 2: system/data-source/route configuration capabilities

Excluded:

- deprecated AI-permission branch

## Capability IDs

| ID | Layer | Capability | Validation Mode |
|---|---|---|---|
| ACL-SMOKE-001 | protocol | initialize + tools/list + tools/call | runtime |
| ACL-BASE-001 | base | create role | runtime |
| ACL-BASE-002 | base | bind user to role | contract + optional runtime |
| ACL-BASE-003 | base | set default role | contract + optional runtime/high-impact |
| ACL-BASE-004 | base | role mode `default` | contract + optional runtime/high-impact |
| ACL-BASE-005 | base | role mode `allow-use-union` | contract + optional runtime/high-impact |
| ACL-BASE-006 | base | role mode `only-use-union` | contract + optional runtime/high-impact |
| ACL-SYS-001 | system snippets | interface configuration (`ui.*`) | runtime |
| ACL-SYS-002 | system snippets | plugin lifecycle (`pm`) | runtime |
| ACL-SYS-003 | system snippets | plugin configuration (`pm.*`) | runtime |
| ACL-SYS-004 | system snippets | app lifecycle (`app`) | runtime |
| ACL-SYS-005 | system snippets | per-plugin snippet example | runtime |
| ACL-DS-001 | data source | global strategy actions (all tables) | runtime |
| ACL-DS-002 | data source | per-resource strategy (single table) | runtime |
| ACL-ROUTE-001 | route | route permission capability | contract + optional runtime |

## Status Semantics

- `pass`: capability verified successfully
- `warn`: capability tool contract exists, but runtime verification was skipped due missing optional input or safety switch
- `fail`: capability not available or runtime verification failed

## Runtime Inputs

Required:

- MCP endpoint URL
- bearer token (or env var)

Optional for deeper verification:

- `TestUserId` for user-role binding runtime call
- `DesktopRouteKey` for route mutation runtime call
- `EnableHighImpactWrites` for default-role and role-mode runtime call
- `EnableRouteWrites` for route write path

## Safety

- ACL calls are executed through JSON-RPC `tools/call` only.
- No direct ACL REST fallback (`/api/*`) is used in this test workflow.
- Temporary role is auto-cleaned when `roles_destroy` exists.
