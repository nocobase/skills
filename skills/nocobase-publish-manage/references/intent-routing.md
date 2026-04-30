# Intent Routing

## Goal

Map user publish requests to a normalized API-first context before any `nb api backup` or `nb api migration` command runs.

## Intent Signals

Backup restore signals:

- restore
- backup
- recover
- Chinese words meaning restore, recover, backup, or backup restore
- Chinese sentence patterns meaning restore one environment or restore from a backup file

Migration signals:

- migration
- migrate
- migration rule
- ruleId
- Chinese words meaning migration or migration rule
- Chinese sentence patterns meaning migrate one environment to another

Existing file signals:

- specified file
- use file
- local `.nbdata` path
- backup or migration file name
- Chinese phrases meaning specified file, use this package, or use existing file

Package creation signals:

- backup current environment
- create backup
- generate migration package
- migrate `<sourceEnv>` to `<targetEnv>`
- Chinese phrases meaning create a package from the source environment

## Normalization Rules

1. Set `method=backup` for backup restore requests.
2. Set `method=migration` for migration requests.
3. Set `sourceEnv` from the environment that owns or generates the package. Use `dev` in tests unless overridden.
4. Set `targetEnv` from the environment that receives restore or migration execution. Use `dev` in tests unless overridden.
5. If only one environment is named for restore, use it as both `sourceEnv` and `targetEnv`.
6. If a local `.nbdata` file is named, set `localFile` and skip package creation.
7. If a server backup file name is named, set `backupName`.
8. If a server migration file name is named, set `migrationName`.
9. If the user asks to choose an existing package, run the relevant list command before asking them to pick:
   - `nb api backup list -e <sourceEnv> --json-output`
   - `nb api migration list -e <sourceEnv> --json-output`
10. If `method=migration`, no migration file is named, and `ruleId` is missing, run `nb api migration rules list -e <sourceEnv> --json-output` before asking the user to select or create a rule.
11. If the user asks to create a migration rule, only create a global rule with `--user-defined-rule` and `--system-defined-rule`.

## Supported Scenario Mapping

| User scenario | Method | Source | Target | Package creation? | Required extra input |
|---|---|---|---|---|---|
| Restore local backup file in one env | `backup` | file path | dev | no | `localFile` |
| Restore server backup in same env | `backup` | dev | dev | no | `backupName` |
| Create backup and restore dev | `backup` | dev | dev | yes | none |
| Restore source backup to target | `backup` | source env | target env | optional | `backupName` or create backup |
| Execute local migration file | `migration` | file path | dev | no | `localFile` |
| Execute server migration file | `migration` | source env | target env | no | `migrationName` |
| Create migration from source | `migration` | source env | target env | yes | `ruleId` selected from `migration rules list` or created by `migration rules create` |

## Stop Conditions

- Unknown method after two clarification rounds.
- Missing target environment.
- Missing source environment for a server package lookup.
- Missing `ruleId` for migration package creation.
- User asks the agent to choose the first/latest backup, migration package, or migration rule automatically.
- User asks to create migration rules with per-table custom rules; this skill only supports global rules.
