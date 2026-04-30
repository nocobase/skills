# Intent Routing

## Goal

Map user publish requests to a normalized publish context before any `nb release` command runs.

## Intent Signals

Backup restore signals:

- restore
- backup
- recover
- Chinese words meaning restore, recover, or backup restore
- Chinese sentence patterns meaning restore one environment

Migration signals:

- migration
- migrate
- migration rule
- ruleId
- Chinese words meaning migration or migration rule
- Chinese sentence patterns meaning migrate one environment to another

Existing file reuse signals:

- specified file
- use file
- `<file-name>.nbdata`
- Chinese phrases meaning specified file, use this package, or use existing file

Generation signals:

- restore `<env>`
- restore `<sourceEnv>` to `<targetEnv>`
- migrate `<sourceEnv>` to `<targetEnv>`
- user explicitly refers to the package generated in the current workflow
- Chinese sentence patterns meaning restore an environment
- Chinese sentence patterns meaning restore source environment to target
- Chinese sentence patterns meaning migrate source environment to target
- Chinese phrases meaning generate a file or create a package

## Normalization Rules

1. Set `type=backup` for restore or backup restore requests.
2. Set `type=migration` for migration requests.
3. Set `sourceEnv` from the environment that provides or generates the file.
4. Set `targetEnv` from the environment that receives and executes the file.
5. If only one environment is named for restore, use it as both `sourceEnv` and `targetEnv`.
6. If a `.nbdata` file is named, set `fileArg` and skip generation.
7. If the user asks to choose an existing package, run `nb release file list` before asking them to pick.
8. If no file is named, generation is required before upload.
9. If `type=migration`, no file is named, and `ruleId` is missing, run `nb release migration-rule list` before asking the user to select or create a rule.

## Supported Scenario Mapping

| User scenario | Type | Source | Target | Generate? | Required extra input |
|---|---|---|---|---|---|
| Restore specified file in one env | `backup` | env | same env | no | file |
| Restore dev without file | `backup` | dev | dev | yes | none |
| Restore dev to test without file | `backup` | dev | test | yes | none |
| Migrate specified file to test | `migration` | file source env | test | no | file |
| Migrate dev to test without file | `migration` | dev | test | yes | `ruleId` selected from `release migration-rule list` or created by `release migration-rule create` |

## Stop Conditions

- Unknown method after two clarification rounds.
- Missing target environment.
- Missing source environment for a file name lookup.
- Missing `ruleId` for migration generation.
- User asks to create migration rule but also requires publish-only execution.
