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

For an ordinary UI authoring request, first try:

```bash
nb api flow-surfaces list-navigation-targets -j
```

- If the response explicitly has `capabilities.multiPortal === false`, use the legacy `nocobase-ui-builder` lane.
- If it returns `true`, stop.
- If the action is explicitly unknown or returns `404` / `Not Found`, run the verified legacy Flow Surfaces probe:

```bash
nb api flow-surfaces --help
nb api flow-surfaces list-templates --body '{}' -j
```

Continue in the legacy lane only when help exposes both `apply-blueprint` and `list-templates`, and the read probe returns a structured success response. This combination proves that the runtime predates Portal target discovery while still exposing the Flow Surfaces authoring path. Auth errors, `5xx`, malformed output, a missing core action, or a failed read probe stop.
- Do not use returned navigation targets as Portal inventory or infer no-code versus AI Portal from them.

## UI Target Resolution

Every ordinary NocoBase page, menu, block, field, action, layout, or reaction request enters this resolution flow, even if the user does not mention a Portal.

When `nb portal` is available, fetch structured inventory:

```bash
nb portal list -j
```

Count only records where `enabled === true`.

Preserve `isDefault` when it appears in structured output. It is a UI/CLI marker for display and readback only, not a selector.

If the CLI command exists but this call returns explicit endpoint absence (`404` / `Not Found`), treat Portal inventory as runtime-unavailable for ordinary UI authoring and use Capability Detection above. Do not apply that fallback to a user-specified Portal or to Portal lifecycle/source/deploy tasks. Auth failures, `5xx`, and malformed output are real failures, not legacy signals.

- Explicit target: match `name` exactly across structured records. Continue only when exactly one record matches and it has `enabled === true`; a missing, disabled, or non-unique match must stop without substitution.
- No explicit target and zero enabled records: stop the ordinary UI build and tell the user to explicitly create a Portal first. Do not create one automatically.
- No explicit target and exactly one enabled record: select it automatically.
- No explicit target and multiple Portals: list each enabled record's `name`, `portalType`, and default marker when `isDefault === true`, then require explicit user selection before any write. Do not auto-select the default Portal.

Do not infer a selection from cwd, active files, the nearest or most recent `portal.config.json`, `localPath`, sync state, title similarity, source directories, or a preference for the first no-code Portal. Explicit `action=create` remains a separate lifecycle request and is not blocked by the zero-Portal UI-build rule.

## Implementation Routing

Read the selected structured record's `portalType`; it is the only authority for implementation routing.

- `no-code`: hand the selected Portal to `nocobase-ui-builder` for UI authoring.
- `ai`: locate that already selected Portal's local source project with the list record's `developmentPath`, `nb portal info <portal> -j`, `localPath`, `portal.config.json`, or local workspace information. If the CLI reports an empty or missing development/local source path, run `nb portal pull <portal>` first, then read back the path and enter the pulled development directory before invoking `nocobase-ai-builder`. Do not use `sourceStorage`, `git_repo`, `git_branch`, `git_path`, `--git-path`, repository subdirectories, or deployment/storage paths as edit locations; those are remote storage configuration for pull/push/deploy, not the local development directory. The UI build request itself authorizes these source changes; do not request a second "modify source" authorization.
- Missing or unsupported `portalType`: stop; do not infer a type from user language, template structure, cwd, or source files.

Local source metadata is a post-selection locator only. It must not participate in choosing among multiple Portals. Source storage metadata is never a local source locator.

## Command Map

### list

```bash
nb portal list -j
```

### info

```bash
nb portal info <portal>
nb portal info <portal> -j
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

`--git-path` / `git_path` is a repository-relative storage path, not a local working directory. For AI Portal source edits, use only an existing `developmentPath` / `localPath` or the local development directory returned after `nb portal pull <portal>` readback.

### pull

```bash
nb portal pull <portal>
nb portal pull <portal> --no-install
nb portal pull <portal> --force
```

For an already selected AI Portal UI build, run plain `nb portal pull <portal>` when `nb portal list -j` or `nb portal info <portal> -j` has no `developmentPath` / `localPath`. This initializes the local development directory and is not the destructive `--force` path. After pull, enter the returned local development directory; do not edit in the configured source storage path.

Use `--force` only after explicit confirmation because it can replace local Portal source.

### push

```bash
nb portal push <portal>
nb portal push <portal> --message "Update portal source"
nb portal push <portal> -m "Update portal source"
```

If there are no source changes, the CLI may report a no-op. Treat that as a successful no-change outcome.

Run `push` only when the user explicitly asks to push, sync, or commit Portal source. Do not add a push step after ordinary UI/source edits, and do not infer push from deployment wording.

`push` does not gate `deploy` by default. In a request that asks for both actions, report a push failure and then continue to the requested deploy after any required deploy confirmation. Stop before deploy only when the user made deployment conditional on push success, such as "push successfully then deploy", "only deploy after push succeeds", or equivalent wording.

### deploy

```bash
nb portal deploy <portal>
```

For production-like envs, ask for explicit confirmation before execution.

Run `deploy` only when the user explicitly asks to deploy, publish, or release the Portal. A deploy request executes deploy only; do not run `push` first unless the user also explicitly asks to push source.

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
