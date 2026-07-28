# Runtime Contract

## Purpose

Map Portal management intent to direct `nb portal` commands.

## Table Of Contents

- [Env Flags](#env-flags)
- [Capability Detection](#capability-detection)
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

For natural no-code UI requests that merely need a Modern UI workspace/page target, the caller may fall back to `nocobase-ui-builder`; that skill can use `nb api flow-surfaces list-navigation-targets -j` when the backend supports explicit workspace targets.

## Command Map

### list

```bash
nb portal list
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
nb portal list
```

## Failure Reporting

Report:

- failed command
- key stderr/stdout lines
- likely cause
- one concrete next command

Do not switch to direct database edits, Docker commands, or private scripts as fallback.
