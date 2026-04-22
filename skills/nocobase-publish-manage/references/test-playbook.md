# Test Playbook

## Purpose

Provide deterministic, prompt-first acceptance cases for `nocobase-publish-manage`.
Each case includes:

- an agent prompt (`Prompt`) that can be used directly in chat
- an equivalent runtime command (`Runtime Command`) for script-level verification
- field-level expected outcomes (`Expected`)

## Placeholders

- `<BASE_DIR>`: workspace path for runtime command execution
- `<SOURCE_ENV>`: source env name (for example `local`)
- `<TARGET_ENV>`: target env name (for example `test`)
- `<SOURCE_URL>`: source app URL
- `<TARGET_URL>`: target app URL
- `<BACKUP_ID>`: known backup artifact id/name
- `<TOKEN_ENV>`: env var name holding API token (for example `NOCOBASE_API_TOKEN`)
- `<SSH_HOST>` / `<SSH_USER>` / `<SSH_PATH>`: SSH target parameters

## Global Assertions

Unless explicitly noted as CLI invalid-input hard fail, every result should include:

- `request`
- `channel`
- `checks`
- `blockers`
- `warnings`
- `plugin_checks`
- `action_required`
- `commands_or_actions`
- `verification`

When `apply=true`, output should also include:

- `execution.steps[*].status`
- `execution.steps[*].exec_context` (`source` or `target`)

## Serial Execution Strategy

Because migration apply is expensive and environments are shared, execute cases in strict serial order.

Rules:

- Do not run cases in parallel.
- Run next case only after previous case is fully completed.
- Full suite is mandatory on every run; do not skip long-running migration cases.
- Keep one long-timeout profile for apply/migration cases (`>= 600s`).

Recommended serial order (mandatory):

1. TC01
2. TC02
3. TC03
4. TC04
5. TC05
6. TC06
7. TC07
8. TC08
9. TC09
10. TC10
11. TC11
12. TC12
13. TC13
14. TC14
15. TC15
16. TC16
17. TC17
18. TC18

Timeout guidance:

- Precheck/guard/verify: 60-300s per case.
- Publish apply migration (TC13): 600-1800s per case (depends on data size and migration complexity).

## Cases

### TC01 Precheck Migration Schema-Only-All

提示词：

```text
我准备把 `<SOURCE_ENV>` 迁移到 `<TARGET_ENV>`，策略是“只迁结构（用户和系统）”。请先做发布前检查，不要执行发布。
```

Runtime Command:

```text
node ./scripts/publish-manage.mjs precheck --method migration --migration-template schema_only_all --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected:

1. `request.action=precheck`, `request.method=migration`, `request.migration_template=schema_only_all`.
2. `checks` contains `REL-CLI-001` and `REL-CHK-001`.
3. `channel` is explicitly resolved.
4. `verification` is `passed` or `failed` with actionable blockers.

### TC02 Publish Plan Only (Backup Restore)

提示词：

```text
我想把 `<SOURCE_ENV>` 发布到 `<TARGET_ENV>`，走“用已有备份包恢复”的方案。请先给我一份执行计划，先不要真正执行。
```

Runtime Command:

```text
node ./scripts/publish-manage.mjs publish --method backup_restore --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected:

1. `request.apply=false` by default.
2. `verification=pending_verification`.
3. `execution.steps[*].status=planned`.
4. `commands_or_actions[*].operation` includes `backup_download` and `backup_upload`.
5. `backup_candidates` is present (may be empty when source query fails, with warning).

### TC03 Publish Apply Without Confirm (Hard Guard)

提示词：

```text
我现在要直接发布到 `<TARGET_ENV>`，走“备份包恢复”的方式，并且直接执行（apply）。
```

Runtime Command:

```text
node ./scripts/publish-manage.mjs publish --method backup_restore --target-env <TARGET_ENV> --base-dir <BASE_DIR> --apply
```

Expected:

1. Process exits with invalid-input hard fail (exit code `2`).
2. Error code is `RELEASE_INVALID_INPUT`.
3. Message requires `--confirm confirm`.

### TC04 Rollback Missing Backup Artifact (Hard Guard)

提示词：

```text
帮我把 `<TARGET_ENV>` 做一次回滚，按备份恢复的方式处理。
```

Runtime Command:

```text
node ./scripts/publish-manage.mjs rollback --method backup_restore --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected:

1. Process exits with invalid-input hard fail (exit code `2`).
2. Error code is `RELEASE_INVALID_INPUT`.
3. Message indicates `Rollback requires --backup-artifact`.

### TC05 Remote API Missing Token Guard

提示词：

```text
目标我想走远程 API 通道，地址是 `<TARGET_URL>`，token 环境变量名是 `<TOKEN_ENV>`。请先做一遍 precheck 看有没有阻塞。
```

Runtime Command:

```text
node ./scripts/publish-manage.mjs precheck --method backup_restore --channel remote_api --target-url <TARGET_URL> --target-token-env <TOKEN_ENV> --base-dir <BASE_DIR>
```

Expected:

1. `checks` contains `REL-CHK-002`.
2. `blockers` includes `Missing remote token env: <TOKEN_ENV>` when env var is unset.
3. `verification=failed`.

### TC06 Remote SSH Missing Path Guard

提示词：

```text
我想通过 SSH 去目标机做发布检查：主机 `<SSH_HOST>`，用户 `<SSH_USER>`。请先按远程 SSH 通道跑 precheck。
```

Runtime Command:

```text
node ./scripts/publish-manage.mjs precheck --method backup_restore --channel remote_ssh_cli --ssh-host <SSH_HOST> --ssh-user <SSH_USER> --base-dir <BASE_DIR>
```

Expected:

1. `checks` contains `REL-CHK-003`.
2. `blockers` includes `Missing --ssh-host or --ssh-path.`.
3. `verification=failed`.

### TC07 Migration Full Overwrite Warning

提示词：

```text
我在评估从 `<SOURCE_ENV>` 到 `<TARGET_ENV>` 的迁移发布，策略考虑“全量覆盖”。请先做 precheck 并告诉我风险。
```

Runtime Command:

```text
node ./scripts/publish-manage.mjs precheck --method migration --migration-template full_overwrite --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected:

1. `request.migration_template=full_overwrite`.
2. `warnings` contains high-impact overwrite warning.
3. If other gates pass, `verification` can still be `passed`.

### TC08 Commercial Capability Gate

提示词：

```text
请帮我检查从 `<SOURCE_ENV>` 到 `<TARGET_ENV>` 的“备份包恢复发布”条件，重点看商业能力是否满足。先做 precheck。
```

Runtime Command:

```text
node ./scripts/publish-manage.mjs precheck --method backup_restore --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected (when capability plugin is not enabled):

1. `checks` contains `REL-PRO-001` with `ok=false`.
2. `blockers` includes commercial capability missing message.
3. `action_required` includes:
   - `type=purchase_commercial` with `url=https://www.nocobase.com/en/commercial`
   - `type=restart_app` with restart guidance

### TC09 Required Plugin Activation Gate

提示词：

```text
我准备走迁移发布（只迁结构）把 `<SOURCE_ENV>` 发到 `<TARGET_ENV>`。请先做 precheck，重点看必需插件是否都可用。
```

Runtime Command:

```text
node ./scripts/publish-manage.mjs precheck --method migration --migration-template schema_only_all --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected (when required plugin missing/disabled):

1. `plugin_checks.required_plugins[*]` marks non-ready plugin (`exists=false` or `enabled!=true`).
2. `blockers` includes `Required plugin not ready: ...`.
3. `action_required` includes `type=activate_plugins`.
4. `action_required[*].prompt` contains `$nocobase-plugin-manage enable ...`.

### TC10 Publish Method Hard Gate

提示词：

```text
我要执行正式发布：从 `<SOURCE_ENV>` 到 `<TARGET_ENV>`，走迁移发布且按“只迁结构”策略，并且立即 apply。我确认 `confirm`。
```

Runtime Command:

```text
node ./scripts/publish-manage.mjs publish --method migration --migration-template schema_only_all --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR> --apply --confirm confirm
```

Expected:

1. `checks` contains `REL-GATE-001` with `ok=false`.
2. `blockers` includes publish method gate not confirmed.
3. `action_required` includes `type=choose_publish_method`.
4. `action_required[*].rerun_example` includes `--publish-method-confirm migration`.

### TC11 Migration Template Selection Gate

提示词：

```text
我要执行一次迁移发布：`<SOURCE_ENV>` 到 `<TARGET_ENV>`，并且发布方式我已经确认是“迁移方案”，直接 apply，我也确认 `confirm`。
```

Runtime Command:

```text
node ./scripts/publish-manage.mjs publish --method migration --publish-method-confirm migration --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR> --apply --confirm confirm
```

Expected:

1. `blockers` includes unresolved migration template.
2. `action_required` includes `type=choose_migration_template`.
3. `action_required[*].options` includes exactly four presets:
   - `schema_only_all`
   - `user_overwrite_only`
   - `system_overwrite_only`
   - `full_overwrite`
4. Each option includes `user_defined_rule` and `system_defined_rule`.

### TC12 Backup Artifact Selection Gate

提示词：

```text
我要执行一次“备份包恢复”发布：`<SOURCE_ENV>` 到 `<TARGET_ENV>`，发布方式我已确认是“备份恢复方案”，直接 apply，我确认 `confirm`。
```

Runtime Command:

```text
node ./scripts/publish-manage.mjs publish --method backup_restore --publish-method-confirm backup_restore --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR> --apply --confirm confirm
```

Expected:

1. `blockers` includes backup artifact selection required message.
2. `action_required` includes `type=choose_backup_artifact`.
3. `action_required[*].backup_candidates` exists and has at most 5 entries.

### TC13 Migration Apply Happy Path

提示词：

```text
我现在要正式执行迁移发布：从 `<SOURCE_ENV>` 到 `<TARGET_ENV>`，策略是“只迁结构”，并确认发布方式是“迁移方案”，立即 apply，确认词是 `confirm`。
```

Runtime Command:

```text
node ./scripts/publish-manage.mjs publish --method migration --publish-method-confirm migration --migration-template schema_only_all --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR> --apply --confirm confirm
```

Expected (when runtime dependencies are ready):

1. `verification=passed`.
2. `execution.steps` includes source-context operations:
   - `migration-rule-create`
   - `migration-generate`
   - `migration-download`
3. `execution.steps` includes target-context operations:
   - `backup-create` (when `backup_auto=true`)
   - `migration-check`
   - `migration-up`

### TC14 Verify Action

提示词：

```text
请帮我做一次发布后核验：目标环境 `<TARGET_ENV>`，按“备份恢复链路”相关项来 verify。
```

Runtime Command:

```text
node ./scripts/publish-manage.mjs verify --method backup_restore --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected:

1. `request.action=verify`.
2. `commands_or_actions` contains verify-oriented steps (`env-list` and method-specific check such as `backup-list`).
3. `verification` reflects check results (`passed` or `failed`).

### TC15 Intent Routing: Restore Keyword

提示词：

```text
请把 local 环境的数据恢复到 test 环境。
```

Expected:

1. Routing resolves to restore intent.
2. Method is locked to `backup_restore`.
3. Next gate focuses on `choose_backup_artifact`.
4. Migration template selection is not requested.

### TC16 Intent Routing: Migration Keyword

提示词：

```text
请把 local 环境迁移到 test 环境。
```

Expected:

1. Routing resolves to migration intent.
2. Method is locked to `migration`.
3. Next gate focuses on `choose_migration_template`.
4. Backup artifact selection is not requested first.

### TC17 Intent Routing: Generic Publish Keyword

提示词：

```text
请把 local 发布到 test。
```

Expected:

1. Routing resolves to generic publish intent.
2. Method is not auto-inferred.
3. `action_required` includes `type=choose_publish_method`.

### TC18 Intent Routing Conflict

提示词：

```text
请把 local 恢复并迁移到 test。
```

Expected:

1. Conflict is detected (`restore` + `migration`).
2. Workflow stops and asks user to choose one intent.
3. No apply execution starts.

## Quick Regression Set

Run this full set on each change:

1. TC01
2. TC02
3. TC03
4. TC04
5. TC05
6. TC06
7. TC07
8. TC08
9. TC09
10. TC10
11. TC11
12. TC12
13. TC13
14. TC14
15. TC15
16. TC16
17. TC17
18. TC18

