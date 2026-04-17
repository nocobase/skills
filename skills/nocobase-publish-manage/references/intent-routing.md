# Intent Routing Contract

## Purpose

Define deterministic, low-ambiguity routing from user keywords to publish workflow branches.

## Intent Types

- `publish`: generic publish request
- `restore`: restore/rollback by backup artifact
- `migration`: create and apply a new migration package

## Keyword Dictionary

`publish` keywords:

- Chinese: `发布`, `发版`, `上线`
- English: `publish`, `deploy`, `release`

`restore` keywords:

- Chinese: `还原`, `恢复`, `回滚`
- English: `restore`, `rollback`

`migration` keywords:

- Chinese: `迁移`, `升级迁移`
- English: `migration`, `migrate`

## Deterministic Routing Order

Apply rules in this exact order:

1. Explicit method in command/params wins.
2. If text includes any `restore` keyword and no `migration` keyword -> intent=`restore`.
3. If text includes any `migration` keyword and no `restore` keyword -> intent=`migration`.
4. If text includes any `publish` keyword -> intent=`publish`.
5. Default fallback -> intent=`publish`.

Conflict rule:

- If both `restore` and `migration` keywords appear in the same request, do not execute publish; ask user to choose one intent.

## Intent -> Method Mapping

- intent=`restore` -> lock method=`backup_restore`
- intent=`migration` -> lock method=`migration`
- intent=`publish` -> method not locked; user must choose publish method

## Intent -> Gate Flow

Common first step:

- always run precheck before mutation

Branch rules:

1. intent=`publish`
   - show `choose_publish_method`
   - if user chooses `backup_restore`, show `choose_backup_artifact`
   - if user chooses `migration`, show `choose_migration_template` (4 presets)

2. intent=`restore`
   - skip `choose_publish_method`
   - go directly to `choose_backup_artifact`

3. intent=`migration`
   - skip `choose_publish_method`
   - go directly to `choose_migration_template` (4 presets)

Mandatory stop rule:

- If runtime returns any `action_required` item, stop and wait for user response.
- Do not auto-resolve method/template/artifact.

## Migration Template Presets

- `schema_only_all`
- `user_overwrite_only`
- `system_overwrite_only`
- `full_overwrite`
