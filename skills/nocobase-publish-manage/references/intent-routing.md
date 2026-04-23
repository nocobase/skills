# Intent Routing (v2)

## Goal

Route publish intent to the new CLI-first flows:

- backup_restore
- migration

## Routing Rules

1. Explicit `method` in input wins.
2. If user text includes restore/restore-like keywords (`restore`, `还原`, `恢复`) and excludes migration keywords, route to `backup_restore`.
3. If user text includes migration keywords (`migration`, `迁移`) and excludes restore keywords, route to `migration`.
4. If method is still ambiguous, do not execute publish; ask user to choose one method.

## Action Rules

- `publish`: execute direct publish commands with selected method.
- `restore` and `migration run` require `confirm=confirm` before mutation steps.

## Unsupported Command Rule

No proactive capability detection.

If direct command execution returns unknown command / not supported, return `feature_status=developing` and block subsequent mutation commands.
