# Test Playbook

## Purpose

Provide deterministic, prompt-first acceptance cases for `nocobase-acl-manage`.
Each case includes:

- an agent prompt (`Prompt`) that can be used directly in chat
- runtime verification commands (`Runtime Command`) for CLI evidence
- field-level expected outcomes (`Expected`)

This playbook is aligned to:

- `./capability-test-plan.md`
- `../references/intent-to-tool-map-v1.md`
- `../references/result-format-v1.md`

## Placeholders

- `<BASE_DIR>`: locked project base directory for all ACL checks
- `<WRONG_BASE_DIR>`: non-project or wrong directory used for fail-closed checks
- `<ENV_NAME>`: environment name (for example `local`)
- `<DATA_SOURCE_KEY>`: data source key (default `main`)
- `<ROLE_NAME>`: temporary test role name (for example `r_acl_playbook_reader`)
- `<ROLE_TITLE>`: role title (for example `ACL Playbook Reader`)
- `<COLLECTION_HINT>`: business collection hint from user prompt (for example `users`)
- `<COLLECTION_NAME>`: resolved technical collection name (for example `users`)
- `<SCOPE_ALL_ID>`: built-in scope id for key `all` in target data source
- `<COLLECTION_ALL_FIELDS_JSON_ARRAY>`: resolved full-field JSON array for `<COLLECTION_NAME>` (technical field names, non-empty)
- `<USERS_ALL_FIELDS_JSON_ARRAY>`: resolved full-field JSON array for `users` collection (technical field names, non-empty)
- `<ORIGINAL_ROLE_MODE>`: role mode captured before TC07-TC09
- `<TEST_USER_ID>`: target user id for guarded membership checks
- `<DESKTOP_ROUTE_KEY>`: desktop route key/id for route permission checks
- `<TC04_BODY_FILE>`: role create payload file path for TC04
- `<TC11_BODY_FILE>`: snippets payload file path for TC11
- `<TC12_BODY_FILE>`: data-source strategy payload file path for TC12
- `<TC13_BODY_FILE>`: single-resource independent permission payload file path for TC13
- `<TC14_BODY_FILE>`: desktop route payload file path for TC14
- `<TC20_BODY_FILE>`: batch independent payload file path for TC20

## Global Assertions

Unless explicitly noted, every prompt-driven result should include:

- `Task Summary`
- `Capability Path`
- `Applied Changes` (or explicit no-change reason)
- `Readback Evidence` (for write tasks)
- `Risk Card`
- `Boundary And Next Action`

Hard requirements across all cases:

- CLI-first execution (`nb ...`) only
- no direct ACL REST fallback
- no ad-hoc script fallback (`*.js`, `*.ps1`, `*.sh`)
- one locked `base-dir` for the full run
- never send uncertain or type-mismatched write parameters to runtime APIs

## Parameter Safety Gate

Before any write command, enforce:

- `<DESKTOP_ROUTE_KEY>` must be a numeric id (bigint/integer)
- for `roles data-source-resources get|update`, use explicit locator `--data-source-key <DATA_SOURCE_KEY> --name <COLLECTION_NAME>` by default; use `--filter-by-tk <id>` only when id is known
- for `roles data-sources-collections list`, use `--data-source-key <DATA_SOURCE_KEY>` by default; do not rely on `--filter` as the only source
- for `roles desktop-routes add`, body must be a JSON array of route ids, not an object payload
- for independent-resource writes, `actions[].fields` must be explicit non-empty technical field-name arrays; when prompt omits field restrictions, resolve full-field arrays from collection metadata
- on PowerShell/Windows, prefer `--body-file <path>` over inline `--body` for all JSON write payloads
- if required ids are missing or unresolved, stop and mark case blocked/warn; do not execute writes

## Body File Templates (Windows/PowerShell)

Use UTF-8 without BOM.

- `<TC04_BODY_FILE>`:

```json
{"name":"<ROLE_NAME>","title":"<ROLE_TITLE>","description":"ACL test role","hidden":false,"allowConfigure":false,"allowNewMenu":false,"snippets":["!ui.*","!pm","!pm.*","!app"],"strategy":{"actions":[]}}
```

- `<TC11_BODY_FILE>`:

```json
{"snippets":["ui.*","pm"]}
```

- `<TC12_BODY_FILE>`:

```json
{"roleName":"<ROLE_NAME>","dataSourceKey":"<DATA_SOURCE_KEY>","strategy":{"actions":["view","update"]}}
```

- `<TC14_BODY_FILE>`:

```json
[<DESKTOP_ROUTE_KEY>]
```

- `<TC13_BODY_FILE>`:

```json
{"dataSourceKey":"<DATA_SOURCE_KEY>","resources":[{"name":"<COLLECTION_NAME>","usingActionsConfig":true,"actions":[{"name":"view","scopeId":<SCOPE_ALL_ID>,"fields":<COLLECTION_ALL_FIELDS_JSON_ARRAY>}]}]}
```

- `<TC20_BODY_FILE>`:

```json
{"dataSourceKey":"<DATA_SOURCE_KEY>","resources":[{"name":"<COLLECTION_NAME>","usingActionsConfig":true,"actions":[{"name":"view","scopeKey":"all","fields":<COLLECTION_ALL_FIELDS_JSON_ARRAY>}]},{"name":"users","usingActionsConfig":true,"actions":[{"name":"create","scopeKey":"own","fields":<USERS_ALL_FIELDS_JSON_ARRAY>}]}]}
```

## Serial Execution Strategy

Because global role-mode and ACL policy writes are high-impact, run in strict serial order.

Rules:

- do not run cases in parallel
- run next case only after previous case is fully completed
- always record command output snippets as evidence
- cleanup temporary role at the end
- if global role mode is modified, restore original mode before ending the run

Recommended serial order (mandatory):

1. TC01
2. TC02
3. TC04
4. TC05
5. TC06
6. TC07
7. TC08
8. TC09
9. TC10
10. TC11
11. TC12
12. TC13
13. TC14
14. TC15
15. TC16
16. TC17
17. TC18
18. TC19
19. TC20

## Failure Tracking (2026-04-22)

- `TC13`: fixed by adding explicit write step (`apply-data-permissions`) before readback, and using explicit get locator (`--data-source-key + --name`).
- `TC15`: fixed by `dataSourceKey` query normalization for `roles data-sources-collections list`.
- `TC17`: adjusted default runtime path to dedicated ACL membership command when available.
- `TC20` (readback step): fixed by get locator compatibility plus `--appends actions` for action-level scope/fields verification.

## Cases

### TC01 CLI Readiness Smoke (`ACL-SMOKE-001`)

Prompt:

```text
请先检查 ACL 运行能力和当前环境上下文，不要执行任何写入。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb --help
nb env list
nb env update <ENV_NAME>
```

Expected:

1. CLI capability check passes, or fails with explicit recovery guidance.
2. Result confirms current env context (or clearly asks for bootstrap).
3. No write command is executed.

### TC02 Execution Guard Fail-Closed (`ACL-SMOKE-002`)

Prompt:

```text
请直接给角色 `<ROLE_NAME>` 设置数据表权限，不做前置检查。
```

Runtime Command:

```bash
cd <WRONG_BASE_DIR>
nb env list
nb api acl --help
nb api acl roles --help
```

Expected:

1. Guard fails closed in wrong base-dir and blocks writes.
2. Output includes capability-boundary wording and recovery path.
3. No fallback executor script is created.

### TC04 Create Blank Role (`ACL-ROLE-001`)

Prompt:

```text
请创建一个新角色，name=`<ROLE_NAME>`，title=`<ROLE_TITLE>`，使用默认空白基线。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api acl roles create --body-file <TC04_BODY_FILE> -j
nb api acl roles get --filter-by-tk <ROLE_NAME> -j
```

Expected:

1. Role is created with conservative baseline values.
2. Readback confirms role exists and key fields match.
3. Result provides next-step permission assignment guidance.

### TC05 Audit Roles Chain (`ACL-ROLE-002`)

Prompt:

```text
请审计所有角色并给出可对比摘要，不要修改任何配置。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api acl roles list -j
```

Expected:

1. Audit output is read-only and comparable.
2. Result includes role summary evidence.
3. No mutation command is issued.

### TC06 Get Global Role Mode (`ACL-GLOBAL-001`)

Prompt:

```text
请读取当前全局 role mode。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api acl roles check -j
```

Expected:

1. Current global role mode is returned explicitly.
2. Result marks this as global policy (not per-role field).
3. No write command is executed.

### TC07 Set Global Role Mode `default` (`ACL-GLOBAL-002`)

Prompt:

```text
请把全局 role mode 设置为 `default`。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api acl roles set-system-role-mode --role-mode default -j
nb api acl roles check -j
```

Expected:

1. High-impact risk is surfaced before apply.
2. If write is permitted, readback confirms `default`.
3. If write is not permitted by safety switches, task stays blocked/warn with explicit next action.

### TC08 Set Global Role Mode `allow-use-union` (`ACL-GLOBAL-003`)

Prompt:

```text
请把全局 role mode 设置为 `allow-use-union`，并说明影响范围。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api acl roles set-system-role-mode --role-mode allow-use-union -j
nb api acl roles check -j
```

Expected:

1. Result includes high-risk blast-radius explanation.
2. If apply executes, readback confirms `allow-use-union`.
3. Mitigation recommendations are included in `Risk Card`.

### TC09 Set Global Role Mode `only-use-union` (`ACL-GLOBAL-004`)

Prompt:

```text
请把全局 role mode 设置为 `only-use-union`，并给出风险提示。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api acl roles set-system-role-mode --role-mode only-use-union -j
nb api acl roles check -j
```

Expected:

1. Result clearly marks force-union impact.
2. If apply executes, readback confirms `only-use-union`.
3. Risk card includes governance follow-up actions.

### TC10 Rollback Global Role Mode (`ACL-GLOBAL-005`)

Prompt:

```text
请把全局 role mode 恢复到之前的值。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api acl roles set-system-role-mode --role-mode <ORIGINAL_ROLE_MODE> -j
nb api acl roles check -j
```

Expected:

1. Original mode is restored when available.
2. Readback confirms rollback mode matches `<ORIGINAL_ROLE_MODE>`.
3. Output records rollback evidence.

### TC11 System Snippets Set/Readback (`ACL-PERM-001`)

Prompt:

```text
请为角色 `<ROLE_NAME>` 设置系统 snippets，并执行读回校验。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api acl roles update --filter-by-tk <ROLE_NAME> --body-file <TC11_BODY_FILE> -j
nb api acl roles get --filter-by-tk <ROLE_NAME> -j
```

Expected:

1. Snippet mutation is reflected in readback.
2. High-impact snippet risk is surfaced.
3. Result includes mitigation recommendations.

### TC12 Data-Source Global Strategy (`ACL-PERM-002`)

Prompt:

```text
请把 `<ROLE_NAME>` 在 `<DATA_SOURCE_KEY>` 上的全局策略设置为 `view` 和 `update`。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api acl data-sources roles update --data-source-key <DATA_SOURCE_KEY> --filter-by-tk <ROLE_NAME> --body-file <TC12_BODY_FILE> -j
nb api acl data-sources roles get --data-source-key <DATA_SOURCE_KEY> --filter-by-tk <ROLE_NAME> -j
```

Expected:

1. Strategy write is executed through ACL-specific command path.
2. Readback confirms expected action set.
3. Output keeps risk card and blast-radius note.

### TC13 Independent Resource Strategy (`ACL-PERM-003`)

Prompt:

```text
请为角色 `<ROLE_NAME>` 配置业务表提示 `<COLLECTION_HINT>` 的独立权限：允许 `view`、范围 `all`；若未指定字段则按默认全字段处理。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api resource list --resource collections --filter '{}' --appends fields -j
nb api acl roles data-sources-collections list --role-name <ROLE_NAME> --data-source-key <DATA_SOURCE_KEY> -j
nb api acl data-sources roles-resources-scopes list --data-source-key <DATA_SOURCE_KEY> -j
nb api acl roles apply-data-permissions --filter-by-tk <ROLE_NAME> --body-file <TC13_BODY_FILE> -j
nb api acl roles data-source-resources get --role-name <ROLE_NAME> --data-source-key <DATA_SOURCE_KEY> --name <COLLECTION_NAME> --appends actions -j
```

Expected:

1. Business hint is resolved to concrete collection name before write.
2. Write payload is one complete body (`usingActionsConfig=true` + final `actions[]` + explicit scope binding `scopeId|scopeKey` + non-empty `fields[]`).
3. Readback confirms scope binding and full-field parity for selected field-configurable actions.
4. If collection/action/scope is unresolved, task remains blocked and asks clarification before write.

### TC14 Desktop Route Permission Capability (`ACL-PERM-004`)

Prompt:

```text
请给 `<ROLE_NAME>` 增加桌面路由权限 `<DESKTOP_ROUTE_KEY>`，并完成校验。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api acl roles desktop-routes add --role-name <ROLE_NAME> --body-file <TC14_BODY_FILE> -j
nb api acl roles desktop-routes list --role-name <ROLE_NAME> -j
```

Expected:

1. When runtime route command exists, write + readback path is clear.
2. When route command is unavailable or writes are disabled, output is contract-level warn/block with actionable fallback.
3. No generic resource write is used for route ACL policy.

### TC15 Role Collections List With Data Source (`ACL-PERM-005`)

Prompt:

```text
请列出 `<ROLE_NAME>` 在 `<DATA_SOURCE_KEY>` 下可配置的集合。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api acl roles data-sources-collections list --role-name <ROLE_NAME> --data-source-key <DATA_SOURCE_KEY> -j
```

Expected:

1. Command includes explicit `dataSourceKey` filter.
2. Result is read-only and suitable for collection resolution.
3. No write command is executed.

### TC16 Strict Membership Write Block (`ACL-USER-001`)

Prompt:

```text
请在严格模式下把角色 `<ROLE_NAME>` 分配给用户 `<TEST_USER_ID>`。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api acl --help
nb api acl roles --help
```

Expected:

1. In strict mode, prefer dedicated ACL membership command path (`nb api acl roles users add`).
2. If dedicated command is unavailable, task is blocked with governance-boundary explanation.
3. No guarded generic write is executed when dedicated command exists.

### TC17 Guarded Membership Write (`ACL-USER-002`)

Prompt:

```text
请在启用受控兜底的前提下，把角色 `<ROLE_NAME>` 分配给用户 `<TEST_USER_ID>`，并做读回校验。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api acl roles users add --role-name <ROLE_NAME> --filter-by-tk <TEST_USER_ID> -j
```

Expected:

1. When dedicated membership command exists, use ACL-specific path first.
2. Guarded generic fallback is allowed only when dedicated command is unavailable and fallback is explicitly enabled.
3. Readback step is mandatory and announced.

### TC18 Membership Readback (`ACL-USER-003`)

Prompt:

```text
请校验用户 `<TEST_USER_ID>` 与角色 `<ROLE_NAME>` 的成员绑定关系。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api resource list --resource users.roles --source-id <TEST_USER_ID> -j
nb api resource list --resource roles.users --source-id <ROLE_NAME> -j
```

Expected:

1. Membership evidence is available from at least one association direction.
2. Readback output includes role/user identity match (`users.roles[*].name == <ROLE_NAME>` or `roles.users[*].id == <TEST_USER_ID>`; pivot `rolesUsers.roleName/userId` can be used as equivalent evidence).
3. No mutation command is executed.

### TC19 Risk Assessment Data Prerequisites (`ACL-RISK-001`)

Prompt:

```text
请评估角色 `<ROLE_NAME>` 的权限风险，并给出评分、证据和整改建议。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api acl roles get --filter-by-tk <ROLE_NAME> -j
nb api acl roles check -j
nb api acl available-actions list -j
nb api acl data-sources roles get --data-source-key <DATA_SOURCE_KEY> --filter-by-tk <ROLE_NAME> -j
```

Expected:

1. Risk result includes score/severity, evidence factors, and recommendations.
2. Evidence chain is based on read commands only.
3. No write command is executed.

### TC20 Batch Independent Strategy (`ACL-PERM-006`)

Prompt:

```text
请一次性为角色 `<ROLE_NAME>` 配置多个数据表的独立权限，要求单次执行完成，并使用 `scopeKey` 绑定范围；若未指定字段则按默认全字段处理。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api resource list --resource collections --filter '{}' --appends fields -j
nb api acl roles apply-data-permissions --filter-by-tk <ROLE_NAME> --body-file <TC20_BODY_FILE> -j
nb api acl roles data-source-resources get --role-name <ROLE_NAME> --data-source-key <DATA_SOURCE_KEY> --name users --appends actions -j
```

Expected:

1. Batch write is completed by one apply command with `resources[]` payload.
2. Readback confirms action scope binding resolved from `scopeKey` to non-null `scopeId`.
3. Readback confirms each selected action has explicit non-empty field-name arrays and matches default full-field policy when field restrictions are omitted.
4. No pre-step scope list query is required before write.

## Quick Regression Set

Run this full set on each ACL skill change:

1. TC01
2. TC02
3. TC04
4. TC05
5. TC06
6. TC07
7. TC08
8. TC09
9. TC10
10. TC11
11. TC12
12. TC13
13. TC14
14. TC15
15. TC16
16. TC17
17. TC18
18. TC19
19. TC20

## Capability Coverage Map

| Capability ID | Case |
|---|---|
| `ACL-SMOKE-001` | TC01 |
| `ACL-SMOKE-002` | TC02 |
| `ACL-ROLE-001` | TC04 |
| `ACL-ROLE-002` | TC05 |
| `ACL-GLOBAL-001` | TC06 |
| `ACL-GLOBAL-002` | TC07 |
| `ACL-GLOBAL-003` | TC08 |
| `ACL-GLOBAL-004` | TC09 |
| `ACL-GLOBAL-005` | TC10 |
| `ACL-PERM-001` | TC11 |
| `ACL-PERM-002` | TC12 |
| `ACL-PERM-003` | TC13 |
| `ACL-PERM-004` | TC14 |
| `ACL-PERM-005` | TC15 |
| `ACL-PERM-006` | TC20 |
| `ACL-USER-001` | TC16 |
| `ACL-USER-002` | TC17 |
| `ACL-USER-003` | TC18 |
| `ACL-RISK-001` | TC19 |
