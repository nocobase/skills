# Upgrade Runbook

## Goal

Upgrade one running NocoBase instance safely with explicit pre-checks, deterministic local scripts, and post-upgrade validation.

## Upgrade Rules

1. Backup first, always.
2. Upgrade only. Do not downgrade NocoBase version.
3. Upgrade method should be auto-detected by default; explicit method is optional override.
4. Upgrade plan confirmation is mandatory before any non-dry-run execution.
5. Use explicit target version for production-like environments.
6. For git method, dirty worktree is blocked by default unless `allow_dirty=true`.
7. Validate app health immediately after upgrade.
8. Upgrade third-party plugins after core upgrade.

## Mandatory Inputs

- `install_method`: optional; default `auto` (`docker` | `create-nocobase-app` | `git` when explicitly provided)
- `target_dir`: project working directory
- `backup_confirmed=true`: hard gate before any mutable upgrade action
- `confirm_upgrade=true`: hard gate before any non-dry-run upgrade action

Optional:

- `target_version`: explicit target version
- `release_channel`: `latest` | `beta` | `alpha` (docker alias tag path)
- `restart_mode`: `manual` | `dev` | `start` | `pm2`
- `clean_retry`: `true|false` (git path only; retry on failure with clean + reinstall)
- `allow_dirty`: `true|false` (git path only)

## Local Script Entrypoints

Windows:

```powershell
powershell -File scripts/upgrade.ps1 --method <auto|docker|create-nocobase-app|git> --target-dir <dir> --backup-confirmed true --confirm-upgrade true --target-version <version> --restart-mode <manual|dev|start|pm2> --clean-retry <true|false> --allow-dirty <true|false>
```

Linux/macOS:

```bash
bash scripts/upgrade.sh --method <auto|docker|create-nocobase-app|git> --target-dir <dir> --backup-confirmed true --confirm-upgrade true --target-version <version> --restart-mode <manual|dev|start|pm2> --clean-retry <true|false> --allow-dirty <true|false>
```

Dry-run:

```bash
node scripts/upgrade.mjs --target-dir . --backup-confirmed true --dry-run
```

## Pre-Upgrade Checklist

1. Backup completed and confirmed.
- minimum: database backup
- recommended: `.env`, compose file, and runtime config snapshots

2. Current version/image and target version/image confirmed.

3. Auto-detected method and target directory confirmed.

4. Plugin compatibility expectations confirmed.

5. Maintenance window accepted for user-facing environment.

## Docker Upgrade Path

### A) Upgrade by alias tag (`latest` / `beta` / `alpha`)

```bash
node scripts/upgrade.mjs --target-dir . --backup-confirmed true --confirm-upgrade true --release-channel latest
```

### B) Upgrade by fixed version

```bash
node scripts/upgrade.mjs --target-dir . --backup-confirmed true --confirm-upgrade true --target-version 2.1.0-alpha.16
```

Behavior:

1. Resolve/update `NOCOBASE_APP_IMAGE`.
2. Run `docker compose pull app`.
3. Run `docker compose up -d app`.
4. Run `docker compose logs --tail=300 app`.
5. Emit rollback and plugin-upgrade hints.

## create-nocobase-app Upgrade Path

### A) Normal upgrade

```bash
node scripts/upgrade.mjs --method create-nocobase-app --target-dir ./my-nocobase-app --backup-confirmed true --confirm-upgrade true
```

Equivalent command sequence:

1. Stop running process (foreground Ctrl+C, or `yarn nocobase pm2-stop` when using pm2 mode).
2. Run `yarn nocobase upgrade`.
3. Restart runtime by selected `restart_mode`.

### B) Upgrade to specific version

```bash
node scripts/upgrade.mjs --method create-nocobase-app --target-dir ./my-nocobase-app --backup-confirmed true --confirm-upgrade true --target-version 2.1.0-alpha.16
```

Equivalent command sequence:

1. Update `package.json`:
- `dependencies.@nocobase/cli=<target_version>`
- `devDependencies.@nocobase/devtools=<target_version>`
2. Run `yarn install`.
3. Run `yarn nocobase upgrade --skip-code-update`.
4. Restart runtime by selected `restart_mode`.

## Git Upgrade Path

### A) Normal upgrade

```bash
node scripts/upgrade.mjs --method git --target-dir ./my-nocobase --backup-confirmed true --confirm-upgrade true
```

Equivalent command sequence:

1. Stop running process.
2. Run `git pull`.
3. Run `yarn install`.
4. Run `yarn nocobase upgrade`.
5. Restart runtime by selected `restart_mode`.

Dirty worktree note:

- default behavior blocks dirty worktree.
- if you explicitly accept the risk, add `--allow-dirty true`.

### B) Upgrade to specific version

```bash
node scripts/upgrade.mjs --method git --target-dir ./my-nocobase --backup-confirmed true --confirm-upgrade true --target-version 2.1.0-alpha.16
```

Equivalent command sequence:

1. Stop running process.
2. Run `git pull`.
3. Update `@nocobase/cli` and `@nocobase/devtools` in `package.json`.
4. Run `yarn install`.
5. Run `yarn nocobase upgrade --skip-code-update`.
6. Restart runtime by selected `restart_mode`.

### C) Failure retry (optional)

```bash
node scripts/upgrade.mjs --method git --target-dir ./my-nocobase --backup-confirmed true --confirm-upgrade true --clean-retry true
```

Retry sequence:

1. `yarn nocobase clean`
2. remove `node_modules`
3. `yarn install`
4. rerun upgrade command

## Post-Upgrade Smoke Check

1. Login page loads and auth works.
2. Core modules render normally.
3. Runtime logs have no startup-level fatal errors.
4. API and CLI runtime refresh both work.
5. Third-party plugins are upgraded and compatible.

## Recovery Guidance

If upgrade fails:

1. Stop further writes.
2. Capture logs and diagnostics.
3. Restore database backup and related runtime snapshots.
4. For docker path, switch image back to previous known-good tag.
5. Re-run upgrade with corrected compatibility/version inputs.
