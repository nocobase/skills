# ACL Capability Verification Matrix

This document defines executable capability checks for `nocobase-acl-manage` v2 using MCP calls only.

## Scope

Included:

- protocol readiness
- role domain
- global role-mode domain
- permission domain
- user domain (strict and guarded path)
- risk-domain data prerequisites

Excluded:

- deprecated AI permission branch
- non-MCP direct mutation

## Capability IDs

| ID | Domain | Capability | Validation Mode |
|---|---|---|---|
| ACL-SMOKE-001 | protocol | initialize + tools/list + tools/call | runtime |
| ACL-ROLE-001 | role | create blank role | runtime |
| ACL-ROLE-002 | role | audit roles read chain | runtime |
| ACL-GLOBAL-001 | global-role-mode | read current global role mode | runtime |
| ACL-GLOBAL-002 | global-role-mode | set global role mode = `default` | contract + optional runtime/high-impact |
| ACL-GLOBAL-003 | global-role-mode | set global role mode = `allow-use-union` | contract + optional runtime/high-impact |
| ACL-GLOBAL-004 | global-role-mode | set global role mode = `only-use-union` | contract + optional runtime/high-impact |
| ACL-GLOBAL-005 | global-role-mode | rollback global role mode | optional runtime/high-impact |
| ACL-PERM-001 | permission | system snippets write/readback | runtime |
| ACL-PERM-002 | permission | data-source global strategy | runtime |
| ACL-PERM-003 | permission | data-source resource independent strategy | runtime |
| ACL-PERM-004 | permission | desktop route permission capability | contract + optional runtime |
| ACL-PERM-005 | permission | role collections listing with `filter.dataSourceKey` | runtime |
| ACL-USER-001 | user | strict mode blocks membership write without dedicated tool | contract/runtime |
| ACL-USER-002 | user | guarded fallback membership write using `resource_update` | optional runtime |
| ACL-USER-003 | user | membership readback via `users.roles` or `roles.users` | runtime |
| ACL-RISK-001 | risk | risk assessment data prerequisites available | runtime |

## Status Semantics

- `pass`: capability verified successfully
- `warn`: contract exists but runtime verification skipped by safety switches or optional inputs
- `fail`: capability missing or runtime verification failed

## Runtime Inputs

Required:

- MCP endpoint URL
- bearer token (or token env var)

Optional:

- `TestUserId` for membership checks
- `DesktopRouteKey` for route write path
- `EnableHighImpactWrites` for global role-mode writes
- `EnableRouteWrites` for route write path
- `EnableGuardedUserWrites` for guarded membership fallback

## Safety Rules For Tests

- execute through MCP JSON-RPC `tools/call` only
- no direct ACL REST fallback
- keep high-impact writes behind explicit switches
- restore global role mode when modified during tests
- cleanup temporary test role when possible

## Critical Assertions

- For `ACL-PERM-003` with scope mode `all` or `own`, write payload must include explicit non-null `scopeId`.
- For `ACL-PERM-003` default-all field policy, write payload must include explicit non-empty field-name arrays for selected field-configurable actions (`create`, `view`, `update` in default runtime check).
- For `ACL-PERM-003`, when multiple field-configurable actions are selected, readback should verify full field-set parity for each selected action.
- `ACL-PERM-003` readback must verify:
  - action `scopeId` is non-null and equals the resolved scope id
  - appended scope payload contains matching scope key (for example, `all` or `own`)
  - action field list length matches resolved collection field count for default-all actions
