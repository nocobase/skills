# Upgrade Runbook

## Goal

Upgrade one running NocoBase instance safely with clear pre-checks, execution steps, and post-checks.

## Upgrade Rules

1. Backup first, always.
2. Use explicit target version where possible.
3. Do not assume downgrade support.
4. Validate health immediately after upgrade.

## Pre-Upgrade Checklist

1. Confirm backup completed.
- At minimum: database backup.
- Recommended: config snapshot and compose/env snapshot.

2. Confirm current version and target version.

3. Confirm plugin compatibility expectations.

4. Confirm maintenance window acceptance if environment is user-facing.

## Docker Upgrade Path

1. Update image tag in compose config.
2. Pull target image.
3. Restart app service.
4. Review logs and run health checks.

Command pattern:

```bash
docker compose pull app
docker compose up -d app
docker compose logs --tail=300 app
```

## create-nocobase-app / Git Upgrade Path

1. Stop running process if needed.
2. Update dependencies.
3. Run NocoBase upgrade command.
4. Start runtime and validate.

Command pattern:

```bash
yarn nocobase pm2-stop
yarn nocobase upgrade
yarn nocobase start
```

## Post-Upgrade Smoke Check

1. Login page loads and auth works.
2. Core modules render normally.
3. Installed plugin list has no dependency mismatch.
4. Logs contain no startup-level fatal errors.

## Recovery Guidance

If upgrade fails:

1. Stop further writes.
2. Capture logs and diagnostics.
3. Restore from backup according to your backup process.
4. Re-run with corrected version/compatibility matrix.

## High-Frequency Upgrade Issues

1. App errors after version bump.
2. Plugin dependency mismatch after Docker image update.
3. License status changes after environment change.
4. Startup failure due to missing env/runtime key.
