# Publish Skill Test Playbook

## Purpose

Provide deterministic, prompt-first acceptance cases for `nocobase-publish-manage`.

Each case includes:

- `Prompt`: user-facing prompt to send to the agent.
- `Runtime Command`: expected CLI command chain or evidence command.
- `Expected`: field-level behavior and safety assertions.

This playbook is aligned to:

- `./capability-test-plan.md`
- `../references/v1-runtime-contract.md`
- `../references/test-playbook.md`

## Placeholders

- `<BASE_DIR>`: project base directory, default `E:\work\nocobase`.
- `<SOURCE_ENV>`: source environment, default `dev`.
- `<TARGET_ENV>`: target environment, default `dev`.
- `<BACKUP_NAME>`: server backup package file name.
- `<BACKUP_FILE>`: local backup package path, default `./backup.nbdata`.
- `<MIGRATION_NAME>`: server migration package file name.
- `<MIGRATION_FILE>`: local migration package path, default `./migration.nbdata`.
- `<MIGRATION_RULE_ID>`: selected migration rule id.
- `<MIGRATION_RULE_NAME>`: migration rule name, default `publish-dev-to-dev`.
- `<USER_RULE>`: user-defined table rule, default `schema-only`.
- `<SYSTEM_RULE>`: system-defined table rule, default `overwrite-first`.
- `<CLI_HOME>`: CLI home directory, default `C:\Users\Enzo\.nocobase`.
- `<RELEASE_DIR>`: source environment release workspace, default `<CLI_HOME>\release\<SOURCE_ENV>`.
- `<DOWNLOADED_BACKUP_FILE>`: path passed to `backup download --output`, default `<RELEASE_DIR>\<BACKUP_NAME>`.
- `<DOWNLOADED_MIGRATION_FILE>`: path passed to `migration download --output`, default `<RELEASE_DIR>\<MIGRATION_NAME>`.

## Global Assertions

Unless explicitly noted, every prompt-driven result should include:

- selected method: `backup` or `migration`
- source environment and target environment
- command chain executed or planned
- selected server file name or local file path
- selected or created migration rule id for migration package creation
- explicit publish input confirmation status
- explicit execute confirmation status
- failed step and recovery guidance when blocked or failed

Hard requirements:

- Use `nb api backup ...` and `nb api migration ...`.
- Use explicit file names or user-selected package/rule ids.
- Store downloaded packages under `<CLI_HOME>\release\<SOURCE_ENV>\`.
- Stop before package create, package download, migration rule create, or migration check until the user confirms the publish input.
- Stop before `backup restore`, `backup restore-upload`, `backup remove`, `migration execute`, or `migration remove` until the user explicitly confirms.
- Use `<SOURCE_ENV>=dev` and `<TARGET_ENV>=dev` in this test suite unless a case explicitly overrides them.

## Interaction Model

Many publish flows are multi-turn. Tests should record the first prompt, input confirmation prompt, and execution confirmation prompt when applicable.

Use this confirmation text when a case intentionally proceeds into package creation, download, migration rule creation, or migration check:

```text
confirm input
```

Use this confirmation text when a case intentionally proceeds to restore or execute:

```text
confirm
```

Expected behavior before confirmation:

- Package create, package download, migration rule create, migration package create, migration download, and migration check wait for publish input confirmation.
- Backup restore, backup restore-upload, and migration execute wait for execution confirmation.
- The agent shows the resolved publish context and asks for confirmation.

## Cases

### TC01 CLI Readiness Smoke (`PUB-SMOKE-001`, `PUB-SMOKE-002`)

Prompt:

```text
请检查发布管理 CLI 能力，只执行帮助命令。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api backup --help
nb api backup list --help
nb api backup create --help
nb api backup status --help
nb api backup download --help
nb api backup restore --help
nb api backup restore-upload --help
nb api backup restore-status --help
nb api migration --help
nb api migration list --help
nb api migration create --help
nb api migration download --help
nb api migration check --help
nb api migration execute --help
nb api migration rules list --help
nb api migration rules get --help
nb api migration rules create --help
nb api migration logs list --help
nb api migration logs get --help
nb api migration logs download --help
```

Expected:

1. Only read-only help commands are executed.
2. Output confirms the `backup`, `migration`, `migration rules`, and `migration logs` command groups exist.
3. The result is a capability report.

### TC02 Environment Context (`PUB-ENV-001`)

Prompt:

```text
发布测试使用 SOURCE_ENV=<SOURCE_ENV>，TARGET_ENV=<TARGET_ENV>。先确认后续命令都使用这两个变量，只做上下文记录。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api backup --help
```

Expected:

1. The agent stores `sourceEnv=<SOURCE_ENV>` and `targetEnv=<TARGET_ENV>`.
2. The agent states that `<TARGET_ENV>=dev` is allowed for same-environment test mode.
3. The result is a context summary.

### TC03 API Capability Gate (`PUB-ENV-002`)

Prompt:

```text
先检查 <SOURCE_ENV> 和 <TARGET_ENV> 是否支持备份还原和迁移 API。能力检查结束后给我结论。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api backup list -e <SOURCE_ENV> --json-output
nb api backup list -e <TARGET_ENV> --json-output
nb api migration list -e <SOURCE_ENV> --json-output
nb api migration list -e <TARGET_ENV> --json-output
nb api migration rules list -e <SOURCE_ENV> --json-output
nb api migration logs list -e <TARGET_ENV> --json-output
```

Expected:

1. The agent distinguishes an empty package list from an unsupported environment.
2. If a probe returns 404, `Not Found`, missing plugin, inactive plugin, or license capability errors, the agent marks the environment as `unsupported_publish_env`.
3. The response identifies the failed environment, method, failed probe, and likely plugin/license activation cause.

### TC04 Existing Package Discovery (`PUB-BACKUP-FILE-001`, `PUB-MIGRATION-FILE-001`)

Prompt:

```text
我要用已有包，但我不知道文件名。请分别查看 <SOURCE_ENV> 上有哪些备份包和迁移包，然后让我选择。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api backup list -e <SOURCE_ENV> --json-output
nb api migration list -e <SOURCE_ENV> --json-output
```

Expected:

1. The agent lists backup and migration packages separately.
2. The agent asks the user to select a file if one or more packages are available.
3. The result remains in package selection flow.

### TC05 Migration Rule Discovery And Creation (`PUB-RULE-001`, `PUB-RULE-002`, `PUB-RULE-003`)

Prompt:

```text
我要从 <SOURCE_ENV> 迁移到 <TARGET_ENV>，先查看迁移规则。如果没有合适的规则，就创建一个全局规则，用户自建表用 <USER_RULE>，系统表用 <SYSTEM_RULE>，规则名 <MIGRATION_RULE_NAME>。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api migration rules list -e <SOURCE_ENV> --json-output
nb api migration rules create --name <MIGRATION_RULE_NAME> --user-defined-rule <USER_RULE> --system-defined-rule <SYSTEM_RULE> -e <SOURCE_ENV> --json-output
nb api migration rules get --filter-by-tk <MIGRATION_RULE_ID> -e <SOURCE_ENV> --json-output
```

Expected:

1. The agent runs `list` before creating a rule.
2. If the user selects an existing rule, `get` verifies the selected id.
3. If a rule is created, global options are used.
4. The agent shows the selected or new rule details and asks for `confirm input` before `create` or later package creation.
5. The created or selected `ruleId` is stored for migration package creation.

### TC06 Local File Backup Restore (`PUB-BACKUP-001`)

Prompt:

```text
使用本地备份包 <BACKUP_FILE> 还原 <TARGET_ENV>，源环境是 <SOURCE_ENV>。执行还原前等我确认。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api backup restore-upload --file <BACKUP_FILE> -e <TARGET_ENV> --json-output
```

Expected:

1. The local package path `<BACKUP_FILE>` is used.
2. The agent echoes `<BACKUP_FILE>`, `<SOURCE_ENV>`, and `<TARGET_ENV>`.
3. The agent asks for `confirm` before `restore-upload`.
4. Restore runs on `<TARGET_ENV>`.

Continuation Prompt:

```text
confirm
```

### TC07 Server Backup Restore In One Environment (`PUB-BACKUP-002`)

Prompt:

```text
使用 <TARGET_ENV> 上已有的备份包 <BACKUP_NAME> 还原 <TARGET_ENV>，执行还原前等我确认。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api backup status --name <BACKUP_NAME> -e <TARGET_ENV> --json-output
nb api backup restore --name <BACKUP_NAME> -e <TARGET_ENV> --json-output
nb api backup restore-status --task <RESTORE_TASK_ID> -e <TARGET_ENV> --json-output
```

Expected:

1. The server backup name `<BACKUP_NAME>` is used.
2. The agent echoes `<BACKUP_NAME>` and `<TARGET_ENV>`.
3. The agent asks for `confirm` before `backup restore`.
4. If restore returns a task id, the agent may inspect `restore-status --task <RESTORE_TASK_ID>` after restore starts.

Continuation Prompt:

```text
confirm
```

### TC08 Create Backup Then Restore Upload (`PUB-BACKUP-003`)

Prompt:

```text
把 <SOURCE_ENV> 的备份创建出来并还原到 <TARGET_ENV>。先创建和下载，执行还原前等我确认。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api backup create -e <SOURCE_ENV> --json-output
nb api backup status --name <BACKUP_NAME> -e <SOURCE_ENV> --json-output
nb api backup download --name <BACKUP_NAME> --output <DOWNLOADED_BACKUP_FILE> -e <SOURCE_ENV>
```

Expected:

1. The agent shows that it will create a backup from `<SOURCE_ENV>` and restore it to `<TARGET_ENV>`.
2. The agent asks for `confirm input` before `backup create`.
3. The agent parses `<BACKUP_NAME>` from create output.
4. Download uses `--output <DOWNLOADED_BACKUP_FILE>` under `<CLI_HOME>\release\<SOURCE_ENV>\`.
5. The agent stops before restore and asks for `confirm`.

Input Confirmation Prompt:

```text
confirm input
```

Continuation Prompt:

```text
confirm
```

Expected Restore Command:

```bash
nb api backup restore-upload --file <DOWNLOADED_BACKUP_FILE> -e <TARGET_ENV> --json-output
```

### TC09 Local Migration File To Target (`PUB-MIGRATION-001`)

Prompt:

```text
使用本地迁移包 <MIGRATION_FILE> 迁移到 <TARGET_ENV>，源环境是 <SOURCE_ENV>。先检查，执行迁移前等我确认。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api migration check --file <MIGRATION_FILE> -e <TARGET_ENV> --json-output
```

Expected:

1. The local migration package `<MIGRATION_FILE>` is used.
2. The agent echoes `<MIGRATION_FILE>`, `<SOURCE_ENV>`, and `<TARGET_ENV>` and asks for `confirm input` before `check`.
3. The agent stops before execute and asks for `confirm`.

Input Confirmation Prompt:

```text
confirm input
```

Continuation Prompt:

```text
confirm
```

Expected Execute Command:

```bash
nb api migration execute --file <MIGRATION_FILE> -e <TARGET_ENV> --json-output
```

### TC10 Create Migration From Rule (`PUB-MIGRATION-002`)

Prompt:

```text
把 <SOURCE_ENV> 迁移到 <TARGET_ENV>。如果没有 ruleId，先让我从规则列表里选，或者按 USER_RULE=<USER_RULE>、SYSTEM_RULE=<SYSTEM_RULE> 创建全局规则。执行迁移前等我确认。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb api migration rules list -e <SOURCE_ENV> --json-output
nb api migration rules get --filter-by-tk <MIGRATION_RULE_ID> -e <SOURCE_ENV> --json-output
nb api migration create --rule-id <MIGRATION_RULE_ID> --title publish-<SOURCE_ENV>-to-<TARGET_ENV> -e <SOURCE_ENV> --json-output
nb api migration get --name <MIGRATION_NAME> -e <SOURCE_ENV> --json-output
nb api migration download --name <MIGRATION_NAME> --output <DOWNLOADED_MIGRATION_FILE> -e <SOURCE_ENV>
nb api migration check --file <DOWNLOADED_MIGRATION_FILE> -e <TARGET_ENV> --json-output
```

Alternative Rule Creation Command:

```bash
nb api migration rules create --name <MIGRATION_RULE_NAME> --user-defined-rule <USER_RULE> --system-defined-rule <SYSTEM_RULE> -e <SOURCE_ENV> --json-output
```

Expected:

1. The agent lists migration rules before package creation.
2. If the user has not selected a rule and has not approved creation, the agent stays at rule selection.
3. Once a rule is selected or created, `migration rules get` verifies it when possible.
4. The agent shows the selected rule or new rule plan and asks for `confirm input` before rule creation or package creation.
5. Package creation uses `--rule-id <MIGRATION_RULE_ID>`.
6. Download uses `--output <DOWNLOADED_MIGRATION_FILE>` under `<CLI_HOME>\release\<SOURCE_ENV>\`.
7. Check runs before execute.
8. The agent stops before execute and asks for `confirm`.
9. If `migration download` returns a transient 400/503 after `migration get` reports `status=ok`, the agent retries the same download once before failing.

Input Confirmation Prompt:

```text
confirm input
```

Continuation Prompt:

```text
confirm
```

Expected Execute Command:

```bash
nb api migration execute --file <DOWNLOADED_MIGRATION_FILE> -e <TARGET_ENV> --json-output
```

## Interaction And Failure Cases

### TC11 Missing Backup File Selection (`PUB-GUARD-002`)

Prompt:

```text
用已有备份包还原 <TARGET_ENV>，但我不知道文件名，请列出来让我选。
```

Expected:

1. The agent runs `nb api backup list -e <SOURCE_ENV> --json-output`.
2. The agent asks the user to choose a file.
3. The result remains in package selection flow.

### TC12 Missing Migration Rule (`PUB-GUARD-003`)

Prompt:

```text
把 <SOURCE_ENV> 迁移到 <TARGET_ENV>，先列出可用迁移规则让我选择。
```

Expected:

1. The agent runs `nb api migration rules list -e <SOURCE_ENV> --json-output`.
2. The agent asks the user to select a rule or approve creating a global rule.
3. Migration package creation starts after rule id exists and publish input is confirmed.

### TC13 Selected File Still Requires Input Confirmation (`PUB-GUARD-004`)

Prompt:

```text
使用迁移包 <MIGRATION_FILE> 迁移 <TARGET_ENV>，源环境是 <SOURCE_ENV>。
```

Expected:

1. The agent echoes the selected file, source environment, target environment, and method.
2. The agent asks for `confirm input` before running `migration check`.
3. Execution waits for the execution confirmation gate.

### TC14 Existing Migration Rule Requires Selection (`PUB-GUARD-005`)

Prompt:

```text
把 <SOURCE_ENV> 迁移到 <TARGET_ENV>。
```

Expected:

1. The agent runs `nb api migration rules list -e <SOURCE_ENV> --json-output`.
2. The agent presents available rules for user selection.
3. Migration package creation starts after a rule is selected and publish input is confirmed.

### TC15 New Migration Rule Creation Requires Input Confirmation (`PUB-GUARD-006`)

Prompt:

```text
把 <SOURCE_ENV> 迁移到 <TARGET_ENV>，新建规则，用户自建表用 <USER_RULE>，系统表用 <SYSTEM_RULE>。
```

Expected:

1. The agent shows the new rule name, user-defined rule, system-defined rule, and source environment.
2. The agent asks for `confirm input` before `nb api migration rules create`.
3. Package creation starts after rule creation and the relevant confirmation gate.

### TC16 Execute Confirmation Gate (`PUB-GUARD-001`)

Prompt:

```text
把 <SOURCE_ENV> 备份并还原到 <TARGET_ENV>，创建和下载后停在还原确认点。
```

Expected:

1. The agent may run `backup create` and `backup download` after publish input confirmation.
2. The workflow stops at the `backup restore-upload` confirmation gate.
3. The final response includes the exact confirmation prompt and resolved context.

### TC17 Package List Empty (`PUB-FAIL-001`)

Prompt:

```text
查 <SOURCE_ENV> 上的备份包，如果列表为空就告诉我下一步选择。
```

Simulated Command Output:

```json
[]
```

Expected:

1. The agent reports no backup packages.
2. The agent asks whether to create a new package or inspect another environment.

### TC18 Download Failed (`PUB-FAIL-002`)

Prompt:

```text
从 <SOURCE_ENV> 下载备份包 <BACKUP_NAME>，然后还原到 <TARGET_ENV>。
```

Simulated Command Output:

```text
Error: file not found
```

Expected:

1. The workflow stays at `backup download`.
2. The response includes source env, method, file name, output path, and recovery options.
3. If this is a migration package and `migration get` reports `status=ok`, one retry of the same download command is allowed before reporting failure.

### TC19 Migration Check Failed (`PUB-FAIL-003`)

Prompt:

```text
使用迁移包 <MIGRATION_FILE> 迁移 <TARGET_ENV>，检查失败时停在检查结果。
```

Simulated Command Output:

```json
{"data":{"checkStatus":"failed","message":"adapter check failed"}}
```

Expected:

1. The agent stores the local migration file path.
2. The workflow stays before execute.
3. The response reports the check failure.

### TC20 Environment Capability Unsupported (`PUB-FAIL-004`)

Prompt:

```text
检查 <TARGET_ENV> 是否支持发布。如果备份或迁移 API 返回 404，请报告能力缺失。
```

Simulated Command Output:

```text
Request failed with status 404
"Not Found"
```

Expected:

1. The agent marks `<TARGET_ENV>` as `unsupported_publish_env`.
2. The response explains the required commercial plugin and license activation state.
3. The workflow stays at the capability gate.

### TC21 Migration Execute Failed

Prompt:

```text
刚才 migration check 已经成功了，现在执行 <TARGET_ENV> 上的 <MIGRATION_FILE>。
```

Simulated Command Output:

```text
State: failed
Error: migration failed
```

Expected:

1. The agent reports the failed execute step.
2. The agent suggests `nb api migration logs list -e <TARGET_ENV> --json-output`.
