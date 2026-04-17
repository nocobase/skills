# Test Playbook

## Purpose

Provide prompt-ready checks for `nocobase-publish-manage`.

## Table of Contents

- [Purpose](#purpose)
- [Placeholders](#placeholders)
- [Global Assertions](#global-assertions)
- [Cases](#cases)

## Placeholders

- `<BASE_DIR>`: local workspace for release command
- `<TARGET_URL>`: target app URL
- `<SOURCE_URL>`: source app URL
- `<TARGET_ENV>`: target env name managed by `nocobase-env-bootstrap task=app-manage`
- `<SOURCE_ENV>`: source env name managed by `nocobase-env-bootstrap task=app-manage`
- `<BACKUP_ID>`: known backup artifact identifier
- `<TOKEN_ENV>`: env var name with target API token
- `<SSH_HOST>` / `<SSH_USER>` / `<SSH_PATH>`: SSH target info

## Global Assertions

Every case should return:

- `request`
- `channel`
- `checks`
- `blockers`
- `plugin_checks`
- `action_required`
- `commands_or_actions`
- `verification`

When apply mode is used:

- `execution.steps` should include each step status.

## Cases

### TC01 Precheck Migration Schema-Only-All

```text
node ./scripts/publish-manage.mjs precheck --method migration --migration-template schema_only_all --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected:

- `verification=passed` or `failed` with actionable blockers
- `channel` explicitly resolved

### TC02 Publish Plan Only (Backup Restore)

```text
node ./scripts/publish-manage.mjs publish --method backup_restore --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected:

- `verification=pending_verification`
- `execution.steps[*].status=planned`
- `commands_or_actions[*].operation` includes `backup_download` and `backup_upload`
- `backup_candidates` exists (latest source candidates when query succeeds)

### TC03 Publish Apply Without Confirm (Guard)

```text
node ./scripts/publish-manage.mjs publish --method backup_restore --target-env <TARGET_ENV> --base-dir <BASE_DIR> --apply
```

Expected:

- hard failure with `RELEASE_INVALID_INPUT`
- message indicates `--confirm confirm` required

### TC04 Rollback Missing Backup ID (Guard)

```text
node ./scripts/publish-manage.mjs rollback --method backup_restore --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected:

- hard failure with missing backup artifact message

### TC05 Remote API Missing Token (Guard)

```text
node ./scripts/publish-manage.mjs precheck --method backup_restore --channel remote_api --target-url <TARGET_URL> --target-token-env <TOKEN_ENV> --base-dir <BASE_DIR>
```

Expected:

- `blockers` includes missing token env when not present in process env

### TC06 Remote SSH Missing Path (Guard)

```text
node ./scripts/publish-manage.mjs precheck --method backup_restore --channel remote_ssh_cli --ssh-host <SSH_HOST> --ssh-user <SSH_USER> --base-dir <BASE_DIR>
```

Expected:

- blocker indicates missing `--ssh-path`

### TC07 Migration Full Overwrite Warning

```text
node ./scripts/publish-manage.mjs precheck --method migration --migration-template full_overwrite --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected:

- `warnings` contains overwrite high-impact warning

### TC08 Non-Commercial Gate

```text
node ./scripts/publish-manage.mjs precheck --method backup_restore --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected:

- if `pm list` does not include enabled `plugin-migration-manager` capability:
  - `blockers` includes commercial capability missing reason
  - `action_required` includes purchase URL `https://www.nocobase.com/en/commercial`
  - `action_required` includes restart-app guidance before rerun

### TC09 Required Plugin Activation Gate

```text
node ./scripts/publish-manage.mjs precheck --method migration --migration-template schema_only_all --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected:

- if migration/backup manager plugin is missing or disabled:
  - `blockers` includes required plugin not ready
  - `action_required` includes `$nocobase-plugin-manage enable ...`

### TC10 Publish Method Hard Gate

```text
node ./scripts/publish-manage.mjs publish --method migration --migration-template schema_only_all --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR> --apply --confirm confirm
```

Expected:

- `blockers` includes publish method gate not confirmed
- `action_required` includes `choose_publish_method`
- rerun hint includes `--publish-method-confirm migration`

### TC10B Migration Template Selection Gate

```text
node ./scripts/publish-manage.mjs publish --method migration --publish-method-confirm migration --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR> --apply --confirm confirm
```

Expected:

- `blockers` includes unresolved migration template
- `action_required` includes `choose_migration_template`
- options include 4 presets (`schema_only_all`, `user_overwrite_only`, `system_overwrite_only`, `full_overwrite`)
- `action_required.choose_migration_template.options[*]` includes both `user_defined_rule` and `system_defined_rule`

### TC11 Backup Artifact Selection Gate

```text
node ./scripts/publish-manage.mjs publish --method backup_restore --publish-method-confirm backup_restore --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR> --apply --confirm confirm
```

Expected:

- `blockers` includes missing backup artifact selection
- `action_required` includes `choose_backup_artifact`
- `action_required.choose_backup_artifact.backup_candidates` returns up to latest 5 source backups

### TC12 Migration Apply Happy Path

```text
node ./scripts/publish-manage.mjs publish --method migration --publish-method-confirm migration --migration-template schema_only_all --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR> --apply --confirm confirm
```

Expected:

- `verification=passed`
- steps include source then target contexts:
  - `migration-rule-create` (source)
  - `migration-generate` (source, with resolved rule ID)
  - `migration-download` (source)
  - `backup-create` (target, when backup_auto=true)
  - `migration-check` (target)
  - `migration-up` (target)

### TC13 Intent Routing: Restore Keyword

```text
User request intent text: "Restore data from local to test"
```

Expected:

- intent resolves to restore
- method is locked to `backup_restore`
- next required gate is `choose_backup_artifact`
- migration template selection is not shown

### TC14 Intent Routing: Migration Keyword

```text
User request intent text: "Migrate local to test"
```

Expected:

- intent resolves to migration
- method is locked to `migration`
- next required gate is `choose_migration_template`
- backup artifact selection is not shown

### TC15 Intent Routing: Generic Publish Keyword

```text
User request intent text: "Publish local to test"
```

Expected:

- intent resolves to publish
- method is not auto-inferred
- next required gate is `choose_publish_method`

### TC16 Intent Routing Conflict

```text
User request intent text: "Restore and migrate local to test"
```

Expected:

- routing conflict detected (`restore` + `migration`)
- workflow stops and requests one explicit intent from user
- no publish apply execution starts

## Quick Regression Set

1. TC01
2. TC02
3. TC03
4. TC05
5. TC06
6. TC08
7. TC09
8. TC10
9. TC10B
10. TC11
11. TC12
12. TC13
13. TC14
14. TC15
15. TC16
