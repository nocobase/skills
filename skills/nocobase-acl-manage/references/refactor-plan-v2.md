# ACL Manage Skill Refactor Plan (v2, CLI Transport)

Last updated: 2026-04-13

## 1. Requirement Consolidation

This skill is organized into five domains:

- Role domain
  - `role.audit-all`
  - `role.create-blank`
  - `role.compare`
- Global role-mode domain
  - `global.role-mode.get`
  - `global.role-mode.set`
- Permission domain
  - `permission.system-snippets.set`
  - `permission.data-source.global.set`
  - `permission.data-source.resource.set`
  - `permission.route.desktop.set`
  - `permission.scope.manage`
- User domain
  - `user.assign-role`
  - `user.unassign-role`
  - `user.audit-role-membership`
- Risk domain
  - `risk.assess-role`
  - `risk.assess-user`
  - `risk.assess-system`

Role creation interaction requirement:

- use a single creation mode: default read-only baseline (`role.create-blank`)
- do not ask users to pick role archetypes first
- create first, then ask which permissions to assign

Resource permission interaction requirement:

- before `permission.data-source.resource.set`, collect required inputs:
- data source (`data_source_key`, default `main`, user may override)
- collection hint(s)
- action list
- data scope
- resolved collection names
- resolved scope binding (`scopeId`/scope key)
- if any is missing/unresolved, clarify first and block writes
- if collection matching is ambiguous, ask user to choose from candidates
- if collection matching fails, ask user for clearer keywords
- before write, confirm final plan: data source + resolved collections + actions + scope
- field policy default: all fields for selected actions
- implement default-all with explicit non-empty field-name arrays
- when scope is `all` or `own`, write payload must include explicit non-null `scopeId`

## 2. Transport Strategy

Current transport strategy is CLI-first:

1. use `nb` runtime commands generated from swagger
   - execute through direct nb CLI: `nb <command> [subcommand ...] [flags ...]`
2. verify commands through CLI help discovery
3. use generic `resource` commands only for guarded user-role membership fallback
4. no direct REST mutation fallback in this skill

## 3. Capability Baseline

CLI capability gate requires:

- direct nb CLI exists (`nb`) and `node` exists
- current env is available via direct CLI (`nb env list`)
- runtime commands are available (`nb env update` when needed)
- auth/runtime connectivity is valid for the selected env

## 4. Current Constraints

- Runtime command names can vary by generated command set and build config.
- User-role dedicated write commands may be unavailable in some environments.
- Guarded fallback (`resource update users.roles`) may still hit backend limits in specific versions.

## 5. Execution Plan

### Phase A: Contract Hardening

- keep canonical tasks grouped by domain
- keep high-impact write gating
- keep strict default for user-domain writes when no dedicated command exists

### Phase B: Command Resolution Policy

- maintain logical-to-command mapping in `intent-to-tool-map-v1.md`
- keep schema-conform argument shaping
- add explicit command help discovery before first use

### Phase C: Verification

- align capability matrix to CLI transport
- keep readback evidence for every write
- keep cleanup/rollback behavior for test writes

### Phase D: Membership Gap Closure

Need one of the following to remove guarded fallback dependence:

- dedicated ACL membership runtime commands
- stable backend behavior for generic association updates

## 6. Next Actions

- keep `user.assign-role` and `user.unassign-role` in strict-block mode by default.
- use guarded fallback only when explicitly enabled and runtime supports it.
- after backend/runtime improvements, re-run capability checks and promote guarded path if stable.
