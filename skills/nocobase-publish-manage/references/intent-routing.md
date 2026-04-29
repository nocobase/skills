# Intent Routing

## Goal

Map user publish requests to a normalized publish context before any `nb publish` command runs.

## Intent Signals

Backup restore signals:

- restore
- backup
- recover
- 还原
- 恢复
- 备份还原
- 将 `<env>` 还原

Migration signals:

- migration
- migrate
- migration rule
- ruleId
- 迁移
- 迁移规则
- 将 `<env>` 迁移到 `<env>`

Existing file reuse signals:

- specified file
- use file
- `<file-name>.nbdata`
- 指定文件
- 用这个包
- 用已有文件

Generation signals:

- restore `<env>`
- restore `<sourceEnv>` to `<targetEnv>`
- migrate `<sourceEnv>` to `<targetEnv>`
- latest generated package requested after generation
- 还原 `<env>`
- 将 `<sourceEnv>` 还原到 `<targetEnv>`
- 将 `<sourceEnv>` 迁移到 `<targetEnv>`
- 生成文件
- 创建包

## Normalization Rules

1. Set `type=backup` for restore or backup restore requests.
2. Set `type=migration` for migration requests.
3. Set `sourceEnv` from the environment that provides or generates the file.
4. Set `targetEnv` from the environment that receives and executes the file.
5. If only one environment is named for restore, use it as both `sourceEnv` and `targetEnv`.
6. If a `.nbdata` file is named, set `fileArg` and skip generation.
7. If the user asks to choose an existing package, run `nb publish file list` before asking them to pick.
8. If no file is named, generation is required before copy.
9. If `type=migration`, no file is named, and `ruleId` is missing, run `nb publish migration-rule list` before asking the user to select or create a rule.

## Supported Scenario Mapping

| User scenario | Type | Source | Target | Generate? | Required extra input |
|---|---|---|---|---|---|
| Restore specified file in one env | `backup` | env | same env | no | file |
| Restore dev without file | `backup` | dev | dev | yes | none |
| Restore dev to test without file | `backup` | dev | test | yes | none |
| Migrate specified file to test | `migration` | file source env | test | no | file |
| Migrate dev to test without file | `migration` | dev | test | yes | `ruleId` selected from `publish migration-rule list` or created by `publish migration-rule create` |

## Stop Conditions

- Unknown method after two clarification rounds.
- Missing target environment.
- Missing source environment for a file name lookup.
- Missing `ruleId` for migration generation.
- User asks to create migration rule but also requires publish-only execution.
