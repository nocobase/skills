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

### TC01 Precheck Migration Structure Only

```text
node ./publish-manage.mjs precheck --method migration --migration-template structure_only --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected:

- `verification=passed` or `failed` with actionable blockers
- `channel` explicitly resolved

### TC02 Publish Plan Only

```text
node ./publish-manage.mjs publish --method backup_restore --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected:

- `verification=pending_verification`
- `execution.steps[*].status=planned`
- `commands_or_actions[*].operation` exists for release mutations (`backup_create`, `backup_restore`, `migration_generate`, `migration_up`)

### TC03 Publish Apply Without Confirm (Guard)

```text
node ./publish-manage.mjs publish --method backup_restore --target-env <TARGET_ENV> --base-dir <BASE_DIR> --apply
```

Expected:

- hard failure with `RELEASE_INVALID_INPUT`
- message indicates `--confirm confirm` required

### TC04 Rollback Missing Backup ID (Guard)

```text
node ./publish-manage.mjs rollback --method backup_restore --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected:

- hard failure with missing backup artifact message

### TC05 Remote API Missing Token (Guard)

```text
node ./publish-manage.mjs precheck --method backup_restore --channel remote_api --target-url <TARGET_URL> --target-token-env <TOKEN_ENV> --base-dir <BASE_DIR>
```

Expected:

- `blockers` includes missing token env when not present in process env

### TC06 Remote SSH Missing Path (Guard)

```text
node ./publish-manage.mjs precheck --method backup_restore --channel remote_ssh_cli --ssh-host <SSH_HOST> --ssh-user <SSH_USER> --base-dir <BASE_DIR>
```

Expected:

- blocker indicates missing `--ssh-path`

### TC07 Migration Full Overwrite Warning

```text
node ./publish-manage.mjs precheck --method migration --migration-template full_overwrite --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected:

- `warnings` contains overwrite high-impact warning

### TC08 Non-Commercial Gate

```text
node ./publish-manage.mjs precheck --method backup_restore --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected:

- if `pm list` does not include enabled `plugin-migration-manager` capability:
- `blockers` includes commercial capability missing reason
- `action_required` includes purchase URL `https://www.nocobase.com/en/commercial`
- `action_required` includes restart-app guidance before rerun

### TC09 Required Plugin Activation Gate

```text
node ./publish-manage.mjs precheck --method migration --migration-template structure_only --source-env <SOURCE_ENV> --target-env <TARGET_ENV> --base-dir <BASE_DIR>
```

Expected:

- if migration/backup manager plugin is missing or disabled:
- `blockers` includes required plugin not ready
- `action_required` includes `$nocobase-plugin-manage enable ...`

## Quick Regression Set

1. TC01
2. TC02
3. TC03
4. TC05
5. TC06
6. TC08
7. TC09

