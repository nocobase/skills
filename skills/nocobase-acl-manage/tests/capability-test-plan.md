# ACL Capability Verification Matrix (CLI)

This document defines executable capability checks for `nocobase-acl-manage` v2 using CLI calls.

Companion acceptance suite:

- `./test-playbook.md` (TC01-TC20)

## Scope

Included:

- CLI readiness
- role domain
- global role-mode domain
- permission domain
- user domain (strict and guarded path)
- risk-domain data prerequisites

Excluded:

- direct REST mutation

## Capability IDs

| ID | Domain | Capability | Validation Mode |
|---|---|---|---|
| ACL-SMOKE-001 | cli | `nb --help` + `$nocobase-env-bootstrap task=app-manage app_env_action=current` availability | runtime |
| ACL-SMOKE-002 | cli | execution guard fail-closed check (`env -s project`, `nb api acl --help`, `nb api acl roles --help`) in one locked base-dir | runtime |
| ACL-SMOKE-003 | cli | payload guard rejects malformed `nb api acl roles data-source-resources create|update --body` before execution | contract + runtime |
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
| ACL-PERM-005 | permission | role collections listing with `dataSourceKey` | runtime |
| ACL-PERM-006 | permission | batch independent strategy via `roles apply-data-permissions` | runtime |
| ACL-USER-001 | user | strict mode blocks membership write without dedicated command | contract/runtime |
| ACL-USER-002 | user | dedicated membership command first; guarded fallback only when dedicated path is unavailable | optional runtime |
| ACL-USER-003 | user | membership readback via `users.roles` or `roles.users` | runtime |
| ACL-RISK-001 | risk | risk assessment data prerequisites available | runtime |

## Status Semantics

- `pass`: capability verified successfully
- `warn`: contract exists but runtime verification skipped by safety switches or optional inputs
- `fail`: capability missing or runtime verification failed

## Runtime Inputs

Required:

- `nb` CLI available in PATH
- bootstrap skill app-manage available (`$nocobase-env-bootstrap task=app-manage ...`)
- configured current env context and token (when remote env requires it)
- `@nocobase/plugin-api-doc` active (`swagger:get` available for runtime command discovery)
- `@nocobase/plugin-api-keys` active (token generation/refresh recovery path)

Optional:

- `test_user_id` for membership checks
- `desktop_route_key` for route write path
- `enable_high_impact_writes` for global role-mode writes
- `enable_route_writes` for route write path
- `enable_guarded_user_writes` for guarded membership fallback

## Safety Rules For Tests

- execute through CLI only
- no direct ACL REST fallback
- no temporary executor scripts as fallback (`*.js`, `*.ps1`, `*.sh`)
- keep high-impact writes behind explicit switches
- restore global role mode when modified during tests
- cleanup temporary test role when possible

## Critical Assertions

- For `ACL-PERM-003` with scope mode `all` or `own`, write payload must include explicit non-null `scopeId`.
- For `ACL-PERM-003` default-all field policy, write payload must include explicit non-empty field-name arrays for selected field-configurable actions.
- For `ACL-PERM-003`, when multiple field-configurable actions are selected, readback should verify full field-set parity for each selected action.
- `ACL-PERM-003` readback must verify:
  - action `scopeId` is non-null and equals the resolved scope id
  - scope key matches expected built-in/custom scope
  - action field list length matches resolved collection field count for default-all actions
- For `ACL-PERM-006`, write should complete in one command call with `resources[]` payload that includes at least two collections.
- `ACL-PERM-006` must verify action-level `scopeKey` is resolved to non-null `scopeId` in readback.
- `ACL-PERM-006` must not require pre-querying scope list before write execution.
- `ACL-SMOKE-002` must verify fail-closed behavior:
  - when guard commands fail in the selected base-dir, runner stops writes and emits recovery guidance
  - no ad-hoc script file is created to continue execution
- `ACL-SMOKE-003` must verify payload guard behavior:
  - malformed independent-resource write payload is blocked before CLI execution
  - error output explains missing/invalid keys (`usingActionsConfig`, `actions`, `scopeId`, `fields`)
