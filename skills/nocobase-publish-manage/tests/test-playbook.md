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
- `<TARGET_ENV>`: target environment, default `dev` for first round.
- `<BACKUP_FILE>`: existing backup package file name.
- `<MIGRATION_FILE>`: existing migration package file name.
- `<MIGRATION_RULE_ID>`: selected migration rule id.
- `<MIGRATION_RULE_NAME>`: migration rule name, default `publish-dev-to-target`.
- `<USER_RULE>`: user-defined table rule, default `schema-only`.
- `<SYSTEM_RULE>`: system table rule, default `overwrite-first`.
- `<GENERATED_FILE>`: generated package file name parsed from `Local file:`.
- `<LOCAL_FILE>`: absolute local package path parsed from `Local file:`.
- `<GENERATED_ARTIFACT_ID>`: artifact id parsed from `generate`.
- `<UPLOADED_ARTIFACT_ID>`: artifact id parsed from `copy`.

## Global Assertions

Unless explicitly noted, every prompt-driven result should include:

- selected method: `backup` or `migration`
- source environment and target environment
- command chain executed or planned
- selected file name or generated file name
- selected or created migration rule id for migration generation
- copied artifact id when available
- explicit execute confirmation status
- failed step and recovery guidance when blocked or failed

Hard requirements:

- Use `nb publish ...` only.
- Do not use legacy publish-related command groups outside `nb publish`.
- Do not use direct API, Docker, local scripts, or database fallback paths.
- Do not guess file names or migration rule ids.
- Stop before `nb publish execute` until the user explicitly confirms.

## Interaction Model

Many publish flows are multi-turn. Tests should record both the first prompt and the continuation prompt.

Use this confirmation text when a case intentionally proceeds to execute:

```text
confirm
```

Expected behavior before confirmation:

- `generate` and `copy` may run when required inputs are available.
- `execute` must not run.
- The agent should show the resolved publish context and ask for confirmation.

## Cases

### TC01 CLI Readiness Smoke (`PUB-SMOKE-001`, `PUB-SMOKE-002`)

Prompt:

```text
请检查发布管理 CLI 能力，不要执行任何写入。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb publish --help
nb publish file --help
nb publish file list --help
nb publish file pull --help
nb publish migration-rule --help
nb publish migration-rule list --help
nb publish migration-rule get --help
nb publish migration-rule create --help
nb publish generate --help
nb publish copy --help
nb publish execute --help
```

Expected:

1. Only read-only help commands are executed.
2. Output confirms the `file`, `migration-rule`, `generate`, `copy`, and `execute` command groups exist.
3. No publish package is generated, copied, or executed.

### TC02 Environment Context (`PUB-ENV-001`)

Prompt:

```text
发布测试使用 SOURCE_ENV=<SOURCE_ENV>，TARGET_ENV=<TARGET_ENV>。先确认后续命令都使用这两个变量，不要执行发布。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb publish --help
```

Expected:

1. The agent stores `sourceEnv=<SOURCE_ENV>` and `targetEnv=<TARGET_ENV>`.
2. The agent states that `<TARGET_ENV>=dev` is allowed for same-environment test mode.
3. No `generate`, `copy`, or `execute` command is run.

### TC03 Environment Publish Capability Gate (`PUB-ENV-002`)

Prompt:

```text
先检查 <SOURCE_ENV> 和 <TARGET_ENV> 是否支持备份还原和迁移发布。如果任意环境缺少相关插件或能力，不要继续发布。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb publish file list --scope remote --type backup --env <SOURCE_ENV> --page-size 1 --json
nb publish file list --scope remote --type backup --env <TARGET_ENV> --page-size 1 --json
nb publish file list --scope remote --type migration --env <SOURCE_ENV> --page-size 1 --json
nb publish file list --scope remote --type migration --env <TARGET_ENV> --page-size 1 --json
nb publish file list --scope remote --source artifact --type backup --env <TARGET_ENV> --page-size 1 --json
nb publish file list --scope remote --source artifact --type migration --env <TARGET_ENV> --page-size 1 --json
nb publish migration-rule list --env <SOURCE_ENV> --page-size 1 --json
```

Expected:

1. The agent distinguishes an empty package list from an unsupported environment.
2. If a probe returns 404, `Not Found`, missing plugin, inactive plugin, or license capability errors, the agent marks the environment as `unsupported_publish_env`.
3. If any participating environment is unsupported, the agent stops before `generate`, `copy`, or `execute`.
4. The response identifies the failed environment, publish type, failed probe, and likely plugin/license activation cause.
5. The target environment must pass artifact source probes because `copy` depends on publish manager staging.

### TC04 Existing Package Discovery (`PUB-FILE-001`, `PUB-FILE-002`)

Prompt:

```text
我要用已有发布包，但我不知道文件名。请分别查看 <SOURCE_ENV> 本地和远程有哪些备份包和迁移包，不要执行复制或还原。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb publish file list --scope local --type backup --env <SOURCE_ENV> --json
nb publish file list --scope remote --type backup --env <SOURCE_ENV> --json
nb publish file list --scope local --type migration --env <SOURCE_ENV> --json
nb publish file list --scope remote --type migration --env <SOURCE_ENV> --json
```

Expected:

1. The agent lists local and remote packages separately.
2. The agent asks the user to select a file if one or more packages are available.
3. The agent does not guess the latest package.
4. The agent does not run `copy` or `execute`.

### TC05 Migration Rule Discovery And Creation (`PUB-RULE-001`, `PUB-RULE-002`, `PUB-RULE-003`)

Prompt:

```text
我要从 <SOURCE_ENV> 迁移到 <TARGET_ENV>，先查看迁移规则。如果没有合适的规则，就创建一个全局规则，用户自建表用 <USER_RULE>，系统表用 <SYSTEM_RULE>，规则名 <MIGRATION_RULE_NAME>。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb publish migration-rule list --env <SOURCE_ENV> --json
nb publish migration-rule create --env <SOURCE_ENV> --name <MIGRATION_RULE_NAME> --user-rule <USER_RULE> --system-rule <SYSTEM_RULE> --json
nb publish migration-rule get --env <SOURCE_ENV> --id <MIGRATION_RULE_ID> --json
```

Expected:

1. The agent runs `list` before creating a rule.
2. If the user selects an existing rule, `create` is skipped and `get` verifies the selected id.
3. If a rule is created, only global options are used.
4. The created or selected `ruleId` is stored for migration generation.
5. No migration package is generated until the rule id is known.

### TC06 Specified File Backup Restore In One Environment (`PUB-BACKUP-001`, scenario 1)

Prompt:

```text
使用备份包 <BACKUP_FILE> 还原 <TARGET_ENV>，源环境是 <SOURCE_ENV>。先完成复制，执行还原前等我确认。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb publish copy --type backup --from <SOURCE_ENV> --to <TARGET_ENV> --file <BACKUP_FILE>
```

Expected:

1. `generate` is skipped because `<BACKUP_FILE>` is provided.
2. `copy` uses `--from <SOURCE_ENV>` and `--to <TARGET_ENV>`.
3. The agent captures `<UPLOADED_ARTIFACT_ID>` from copy output when present.
4. The agent stops before execute and asks for `confirm`.

Continuation Prompt:

```text
confirm
```

Expected Execute Command:

```bash
nb publish execute --type backup --env <TARGET_ENV> --file <BACKUP_FILE> --yes --wait
```

### TC07 Restore Current Environment (`PUB-BACKUP-002`, scenario 2)

Prompt:

```text
把 <SOURCE_ENV> 自己还原。先生成备份包并复制，执行还原前等我确认。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb publish generate --type backup --env <SOURCE_ENV> --wait
nb publish copy --type backup --from <SOURCE_ENV> --to <SOURCE_ENV> --file <GENERATED_FILE>
```

Expected:

1. The agent runs backup generation because no file is provided.
2. The agent parses `<LOCAL_FILE>` from `Local file:`.
3. The agent derives `<GENERATED_FILE>` from `<LOCAL_FILE>`.
4. `copy` uses the generated file name.
5. The agent stops before execute and asks for `confirm`.

Continuation Prompt:

```text
confirm
```

Expected Execute Command:

```bash
nb publish execute --type backup --env <SOURCE_ENV> --file <GENERATED_FILE> --yes --wait
```

### TC08 Restore Source Environment To Target (`PUB-BACKUP-003`, scenario 3)

Prompt:

```text
把 <SOURCE_ENV> 还原到 <TARGET_ENV>。先生成和复制，执行目标环境还原前等我确认。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb publish generate --type backup --env <SOURCE_ENV> --wait
nb publish copy --type backup --from <SOURCE_ENV> --to <TARGET_ENV> --file <GENERATED_FILE>
```

Expected:

1. Generation runs only on `<SOURCE_ENV>`.
2. Copy transfers from `<SOURCE_ENV>` to `<TARGET_ENV>`.
3. The agent does not execute against `<SOURCE_ENV>` unless `<SOURCE_ENV>` and `<TARGET_ENV>` are intentionally the same.
4. The agent stops before execute and asks for `confirm`.

Continuation Prompt:

```text
confirm
```

Expected Execute Command:

```bash
nb publish execute --type backup --env <TARGET_ENV> --file <GENERATED_FILE> --yes --wait
```

### TC09 Specified File Migration To Target (`PUB-MIGRATION-001`, scenario 4)

Prompt:

```text
使用迁移包 <MIGRATION_FILE> 迁移到 <TARGET_ENV>，源环境是 <SOURCE_ENV>。先完成复制，执行迁移前等我确认。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb publish copy --type migration --from <SOURCE_ENV> --to <TARGET_ENV> --file <MIGRATION_FILE>
```

Expected:

1. `generate` is skipped because `<MIGRATION_FILE>` is provided.
2. No migration rule id is required for this case.
3. Copy uses `--type migration`.
4. The agent stops before execute and asks for `confirm`.

Continuation Prompt:

```text
confirm
```

Expected Execute Command:

```bash
nb publish execute --type migration --env <TARGET_ENV> --file <MIGRATION_FILE> --yes --wait
```

### TC10 Migrate Source Environment To Target (`PUB-MIGRATION-002`, scenario 5)

Prompt:

```text
把 <SOURCE_ENV> 迁移到 <TARGET_ENV>。如果没有 ruleId，先让我从规则列表里选，或者按 USER_RULE=<USER_RULE>、SYSTEM_RULE=<SYSTEM_RULE> 创建全局规则。执行迁移前等我确认。
```

Runtime Command:

```bash
cd <BASE_DIR>
nb publish migration-rule list --env <SOURCE_ENV> --json
nb publish migration-rule get --env <SOURCE_ENV> --id <MIGRATION_RULE_ID> --json
nb publish generate --type migration --env <SOURCE_ENV> --migration-rule <MIGRATION_RULE_ID> --title publish-<SOURCE_ENV>-to-<TARGET_ENV> --wait
nb publish copy --type migration --from <SOURCE_ENV> --to <TARGET_ENV> --file <GENERATED_FILE>
```

Alternative Rule Creation Command:

```bash
nb publish migration-rule create --env <SOURCE_ENV> --name <MIGRATION_RULE_NAME> --user-rule <USER_RULE> --system-rule <SYSTEM_RULE> --json
```

Expected:

1. The agent lists migration rules before generation.
2. If the user has not selected a rule and does not authorize creation, the agent stops.
3. Once a rule is selected or created, `migration-rule get` verifies it when possible.
4. Generation uses `--migration-rule <MIGRATION_RULE_ID>`.
5. Copy uses the generated migration file.
6. The agent stops before execute and asks for `confirm`.

Continuation Prompt:

```text
confirm
```

Expected Execute Command:

```bash
nb publish execute --type migration --env <TARGET_ENV> --file <GENERATED_FILE> --yes --wait
```

## Interaction And Failure Cases

### TC11 Missing Backup File Selection (`PUB-GUARD-002`)

Prompt:

```text
用已有备份包还原 <TARGET_ENV>，但我不知道文件名，你自己选一个。
```

Expected:

1. The agent runs `nb publish file list --scope local --type backup --env <SOURCE_ENV> --json`.
2. The agent may run remote list if needed.
3. The agent asks the user to choose a file.
4. The agent does not choose a file automatically and does not run copy.

### TC12 Missing Migration Rule (`PUB-GUARD-003`)

Prompt:

```text
把 <SOURCE_ENV> 迁移到 <TARGET_ENV>，迁移规则你自己决定。
```

Expected:

1. The agent runs `nb publish migration-rule list --env <SOURCE_ENV> --json`.
2. The agent asks the user to select a rule or approve creating a global rule.
3. The agent does not run `generate --type migration` until a rule id exists.

### TC13 Execute Confirmation Gate (`PUB-GUARD-001`)

Prompt:

```text
把 <SOURCE_ENV> 还原到 <TARGET_ENV>，可以生成和复制，但不要执行。
```

Expected:

1. The agent may run `generate` and `copy`.
2. The agent must not run `execute`.
3. The final response includes the exact confirmation prompt and resolved context.

### TC14 Remote File List Empty (`PUB-FAIL-001`)

Prompt:

```text
查 <SOURCE_ENV> 远程备份包，如果没有就告诉我，不要生成新包。
```

Simulated Command Output:

```json
[]
```

Expected:

1. The agent reports no remote backup packages.
2. The agent does not guess a file name.
3. The agent asks whether to generate a new package or inspect another environment.

### TC15 File Pull Failed (`PUB-FAIL-002`)

Prompt:

```text
从 <SOURCE_ENV> 拉取远程备份包 <BACKUP_FILE>，然后复制到 <TARGET_ENV>。
```

Simulated Command Output:

```text
Error: remote file not found
```

Expected:

1. The agent stops at `file pull`.
2. The agent does not run `copy`.
3. The response includes source env, type, file name, and recovery options.

### TC16 Copy Check Failed (`PUB-FAIL-003`)

Prompt:

```text
使用备份包 <BACKUP_FILE> 还原 <TARGET_ENV>，复制后如果检查失败不要继续。
```

Simulated Command Output:

```text
Artifact: artifact_123
Check passed: no
Warning: adapter check failed
```

Expected:

1. The agent stores `uploadedArtifactId=artifact_123`.
2. The agent stops before execute.
3. The response reports the warning and failed copy check.

### TC17 Environment Capability Unsupported (`PUB-FAIL-004`)

Prompt:

```text
检查 <TARGET_ENV> 是否支持发布。如果备份或迁移能力接口返回 404，就不要继续。
```

Simulated Command Output:

```text
Request failed with status 404
"Not Found"
```

Expected:

1. The agent marks `<TARGET_ENV>` as `unsupported_publish_env`.
2. The response explains that the environment may not have the required commercial plugin installed, licensed, or activated.
3. The agent does not continue to `generate`, `copy`, or `execute`.
4. The agent does not treat this as an empty remote file list.

### TC18 Manifest Lookup Missing During Execute

Prompt:

```text
刚才 copy 已经成功了，现在执行 <TARGET_ENV> 上的 <BACKUP_FILE>。
```

Simulated Command Output:

```text
No uploaded artifact found for <BACKUP_FILE> on <TARGET_ENV>. Run `nb publish copy` first or use --artifact.
```

Expected:

1. If `<UPLOADED_ARTIFACT_ID>` exists in context, the agent asks whether to retry with `--artifact <UPLOADED_ARTIFACT_ID>`.
2. If `<UPLOADED_ARTIFACT_ID>` is missing, the agent asks the user to rerun copy.
3. The agent does not retry with `--artifact` without confirmation.
