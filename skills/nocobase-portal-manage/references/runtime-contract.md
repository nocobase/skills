# Runtime Contract

## Purpose

Map ordinary NocoBase UI authoring to one selected Portal and Portal management intent to direct `nb portal` commands.

## Table Of Contents

- [Env Flags](#env-flags)
- [Capability Detection](#capability-detection)
- [UI Target Resolution](#ui-target-resolution)
- [Implementation Routing](#implementation-routing)
- [Command Map](#command-map)
- [Readback](#readback)
- [Failure Reporting](#failure-reporting)

## Env Flags

- Use the current configured env by default.
- When the user names an env, pass the env flag only according to the command help.
- Add `--yes` only when the user explicitly requested non-interactive execution or confirmed the cross-env target.

## Capability Detection

Before running a Portal command, verify the installed CLI exposes the command surface:

```bash
nb portal --help
```

If that command fails because `portal` is unknown or unavailable:

- stop lifecycle, source storage, sync, deploy, dev, destroy, list, and info actions
- report that the installed `nb` version does not provide Portal CLI support
- hand CLI/runtime update or env diagnosis to `nocobase-env-manage`
- do not emulate Portal operations through direct database edits, Docker commands, private APIs, or wrapper scripts

For an ordinary UI authoring request, the only permitted compatibility check is:

```bash
nb api flow-surfaces list-navigation-targets -j
```

- If the response explicitly has `capabilities.multiPortal === false`, use the legacy `nocobase-ui-builder` lane.
- If it returns `true`, omits the capability, is unclear, the command is missing, or it fails, stop and recommend upgrading or diagnosing the CLI/runtime through `nocobase-env-manage`.
- Do not use returned navigation targets as Portal inventory or infer no-code versus AI Portal from them.

## UI Target Resolution

Every ordinary NocoBase page, menu, block, field, action, layout, or reaction request enters this resolution flow, even if the user does not mention a Portal.

When `nb portal` is available, fetch structured inventory:

```bash
nb portal list -j
```

Count only records where `enabled === true`.

- Explicit target: match `name` exactly across structured records. Continue only when exactly one record matches and it has `enabled === true`; a missing, disabled, or non-unique match must stop without substitution.
- No explicit target and zero enabled records: stop the ordinary UI build and tell the user to explicitly create a Portal first. Do not create one automatically.
- No explicit target and exactly one enabled record: select it automatically.
- No explicit target and multiple Portals: list each enabled record's `name` and `portalType`, then require explicit user selection before any write.

Do not infer a selection from cwd, active files, the nearest or most recent `portal.config.json`, `localPath`, sync state, title similarity, source directories, or a preference for the first no-code Portal. Explicit `action=create` remains a separate lifecycle request and is not blocked by the zero-Portal UI-build rule.

## Implementation Routing

Read the selected structured record's `portalType`; it is the only authority for implementation routing.

- `no-code`: hand the selected Portal to `nocobase-ui-builder` for UI authoring.
- `ai`: locate that already selected Portal's source project with `nb portal info <portal>`, `localPath`, `portal.config.json`, or local workspace information, then implement and test the requested UI there. The UI build request itself authorizes these source changes; do not request a second "modify source" authorization.
- Missing or unsupported `portalType`: stop; do not infer a type from user language, template structure, cwd, or source files.

Local source metadata is a post-selection locator only. It must not participate in choosing among multiple Portals.

## Command Map

### list

```bash
nb portal list -j
```

### info

```bash
nb portal info <portal>
```

### create

```bash
nb portal create <portal>
nb portal create <portal> --template <template>
nb portal create <portal> --title <title>
nb portal create <portal> --source-storage git --git-repo <repo> --git-branch <branch> --git-path .
```

Use `--force` only after explicit overwrite confirmation.

### config

```bash
nb portal config <portal> --source-storage nocobase
nb portal config <portal> --source-storage git --git-repo <repo> --git-branch main --git-path .
nb portal config <portal> --git-branch <branch>
nb portal config <portal> --git-path <relative-path>
```

Use `--git-path .` for one-Portal-per-repository Git workflows. Use subdirectories, such as `portals/customer`, only when the user wants multiple Portals or other source trees in the same repository.

### pull

```bash
nb portal pull <portal>
nb portal pull <portal> --no-install
nb portal pull <portal> --force
```

Use `--force` only after explicit confirmation because it can replace local Portal source.

### push

```bash
nb portal push <portal>
nb portal push <portal> --message "Update portal source"
nb portal push <portal> -m "Update portal source"
```

If there are no source changes, the CLI may report a no-op. Treat that as a successful no-change outcome.

### deploy

```bash
nb portal deploy <portal>
```

For production-like envs, ask for explicit confirmation before execution.

### dev

```bash
nb portal dev <portal>
```

Treat dev mode as a long-running command. If it prints a URL, surface it to the user. Do not run post-command readback until the process exits.

### destroy

```bash
nb portal destroy <portal>
```

Run only after explicit confirmation.

## Readback

After write actions except `dev`, prefer:

```bash
nb portal info <portal>
```

If `info` is unavailable or fails for command-surface reasons, use:

```bash
nb portal list -j
```

## Failure Reporting

Report:

- failed command
- key stderr/stdout lines
- likely cause
- one concrete next command

Do not switch to direct database edits, Docker commands, or private scripts as fallback.
