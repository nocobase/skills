---
name: nocobase-portal-manage
description: "Default dispatcher for every NocoBase page, menu, block, field, action, layout, or reaction authoring request, even when the user does not mention a Portal. Resolve an enabled Portal from structured `nb portal list -j` output: exact `name` when specified; otherwise zero stops, exactly one is automatic, and multiple Portals require explicit selection. Read the type only from `portalType`; route no-code to `nocobase-ui-builder` and AI Portal work to its source project. Also use direct `nb portal` commands for explicit Portal lifecycle, source storage, sync, deployment, diagnosis, and destroy tasks."
argument-hint: "[action: build|list|info|create|config|pull|push|deploy|dev|destroy|diagnose] [portal?] [env?: name]"
allowed-tools: Bash, Read, Write, Grep, Glob
owner: platform-tools
version: 1.0.0
last-reviewed: 2026-07-28
risk-level: medium
---

# Goal

Dispatch all ordinary NocoBase UI authoring to one explicitly resolved Portal and manage Portal workspaces, preserving env selection, source storage configuration, and clear readback after changes.

# Scope

- Inspect Portal inventory and details.
- Start every ordinary NocoBase page, menu, block, field, action, layout, and reaction request by resolving the target env and Portal.
- Use the `nocobase-ui-builder` skill to build no-code Portal UI.
- Route AI Portal UI building to the corresponding Portal source directory.
- Create Portal workspaces from templates.
- Configure Portal source storage, including Git repo, branch, and path.
- Pull and push Portal source between local workspace, NocoBase storage, and Git source storage.
- Deploy a Portal or start Portal development mode.
- Diagnose common Portal CLI and Git source storage failures.
- Destroy a Portal only when explicitly requested and confirmed.

# Non-Goals

- Do not directly author no-code Modern UI pages, blocks, menus, reactions, or page content inside this skill; use the `nocobase-ui-builder` skill while preserving Portal env and workspace context.
- Do not use `nocobase-ui-builder` for AI Portal source-code UI implementation; work in the corresponding Portal source directory after resolving it from Portal info or local workspace state.
- Do not manage app runtime lifecycle, CLI self-update, env setup, or installed skills update; hand off to `nocobase-env-manage`.
- Do not manage backup restore or migration publishing; hand off to `nocobase-publish-manage`.
- Do not infer Portal type from user wording, templates, source layout, current directory, or local files; use the selected record's `portalType` only.
- Once an AI Portal is selected for an ordinary UI build, that build request authorizes implementing and testing the change in its source project; do not ask for separate source-code authorization.
- Do not mutate databases or NocoBase internals outside the public `nb portal` command surface.
- Do not run wrapper scripts, Docker fallback commands, or direct SQL as a substitute for `nb portal`.
- Do not treat the absence of `nb portal` as permission to emulate Portal lifecycle, source storage, sync, deploy, or destroy operations through private APIs.

# Hard Rules

- Before executing any `nb portal ...` command, confirm the installed CLI exposes the Portal command surface with `nb portal --help`, `nb --help`, or an equivalent local command-help check.
- Use direct `nb portal` commands for Portal lifecycle, source storage, sync, deploy, and diagnosis operations when that command surface exists.
- If `nb portal` is unavailable, report lifecycle/source/deploy/destroy tasks as blocked by the installed CLI version and hand CLI update/env work to `nocobase-env-manage`; do not switch transports.
- Treat this skill as the entry point for every ordinary NocoBase UI authoring request, even if it does not contain the word "Portal".
- Before any ordinary UI authoring write, inspect structured Portal inventory with `nb portal list -j`; count only records where `enabled === true`.
- When the user specifies a Portal, match its CLI `name` exactly across structured records. Continue only when exactly one record matches and it has `enabled === true`; a missing, disabled, or non-unique match must stop without substitution.
- When the user does not specify a Portal: zero enabled Portals must stop the UI build without automatically creating one; exactly one is selected automatically; multiple Portals must be listed by `name` and `portalType` for explicit user selection.
- Do not infer a target among multiple Portals from cwd, active files, a nearby or recent `portal.config.json`, `localPath`, sync state, title similarity, or Portal type preference.
- Determine the selected Portal's implementation path only from its `portalType`; do not infer type from the request, template, source tree, or local workspace.
- Use `portal.config.json`, `localPath`, and other local workspace information only after an AI Portal is selected, and only to locate its source project.
- Treat `nb portal` as runtime-unavailable when the command is unknown or when `nb portal list -j` returns the explicit endpoint-absence signatures `404` / `Not Found`. For ordinary UI authoring only, this enters the legacy capability probe below; Portal lifecycle/source/deploy operations remain blocked.
- When Portal inventory is runtime-unavailable, do not use `flow-surfaces list-navigation-targets` as Portal inventory or infer no-code versus AI. Run `nb api flow-surfaces list-navigation-targets -j` only to inspect `capabilities.multiPortal`: `false` enables the legacy UI Builder lane and `true` stops.
- Older pre-Portal runtimes may not expose `list-navigation-targets`. When that action is explicitly unknown or returns `404` / `Not Found`, and the user did not name a Portal, allow the legacy UI Builder lane only after both checks succeed: `nb api flow-surfaces --help` exposes `apply-blueprint` and `list-templates`, and `nb api flow-surfaces list-templates --body '{}' -j` returns a structured success response. This is the verified legacy Flow Surfaces signature. Auth errors, `5xx`, malformed output, a missing core action, or a failed read probe must stop; never reinterpret them as legacy evidence.
- Use the current configured CLI env unless the user provides an explicit env.
- When passing an explicit env that may differ from the current env, include `--yes` only when the user requested non-interactive execution or explicitly confirmed the target env.
- Before `destroy`, require explicit confirmation from the user.
- Before `pull --force`, `create --force`, or any operation that overwrites local Portal source, require explicit confirmation.
- For one-Portal-per-repository Git workflows, prefer `--git-path .`.
- Use subdirectory `--git-path` values only when the user wants multiple Portals or other content in the same Git repository.
- If an existing `portal.config.json` or remote Portal record already has a configured Git path, do not assume the current CLI default rewrites it; change it explicitly with `nb portal config <portal> --git-path .` when requested.
- For `push`, use the user's requested commit message when provided; otherwise let CLI defaults apply.
- On command failure, report the relevant CLI output and the next concrete recovery command instead of switching transports.

# Supported Tasks

- `list`
- `info`
- `create`
- `config`
- `pull`
- `push`
- `deploy`
- `dev`
- `destroy`
- `diagnose`
- `build`

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `action` | yes | inferred | one of `build/list/info/create/config/pull/push/deploy/dev/destroy/diagnose` | "Which Portal action should I run?" |
| `portal` | lifecycle actions except `list`; optional for `build` | the only enabled Portal for `build` | exact CLI `name` | "Which Portal should I target?" |
| `runtime_env_name` | no | current env | configured CLI env name | "Which env should I target?" |
| `template` | create only | CLI default | npm package, local path, or `file://` URL | "Which Portal template should I use?" |
| `title` | create only | generated from slug | non-empty string | "What display title should this Portal use?" |
| `source_storage` | create/config only | `nocobase` for create, existing config for config | `nocobase` or `git` | "Should source storage be `nocobase` or `git`?" |
| `git_repo` | git create/config | none | full Git remote URL | "Which Git remote URL should store the Portal source?" |
| `git_branch` | no | `main` | non-empty branch name | "Which Git branch should be used?" |
| `git_path` | no | `.` | relative path inside repository, no `..` | "Which repository path should store the Portal source?" |
| `message` | push only | CLI default | non-empty commit message | "What commit message should I use?" |
| `force` | destructive/overwrite actions | `false` | requires explicit confirmation | "Confirm overwrite/destruction before I continue." |

Rules:

- If required inputs for a mutating action are missing, stop and ask one concise clarification question.
- If the user says "you decide", use the documented defaults and direct `nb portal` behavior.
- Do not ask for optional inputs that have safe CLI defaults unless the choice materially affects data, source, or deployment outcome.

# Mandatory Clarification Gate

- Max clarification rounds: `2`.
- Max questions per round: `3`.
- Before mutation, resolve `action`, `portal`, env target when explicit, and any required Git fields.
- Before `destroy`, ask for secondary confirmation.
- Before `pull --force` or `create --force`, ask for secondary confirmation.
- Before configuring Git storage without `git_repo`, ask for the Git remote URL.
- If a Git source storage failure mentions an empty remote, missing branch, or missing configured Git path, diagnose from [Git Source Storage](references/git-source-storage.md) before recommending manual Git commands.

# Workflow

## Ordinary UI Build Workflow

Use this path for every ordinary NocoBase page, menu, block, field, action, layout, or reaction request, including requests that never say "Portal".

1. Inspect the current env with `nb env current` and `nb env info`.
2. Detect Portal CLI support with `nb portal --help` or equivalent command-help output.
3. If `nb portal` is unavailable:
   - For create/config/pull/push/deploy/dev/destroy/list/info requests, stop and report the missing CLI capability; recommend `nocobase-env-manage` for CLI/runtime upgrade or environment diagnosis.
   - For ordinary UI authoring, call `nb api flow-surfaces list-navigation-targets -j` only as a capability check. If `capabilities.multiPortal` is explicitly `false`, use the `nocobase-ui-builder` legacy lane. If it is `true`, stop. If the action is explicitly unknown or returns `404` / `Not Found`, use the verified legacy Flow Surfaces probe defined in Hard Rules; continue only when that full probe succeeds. Other missing, unclear, or failed results stop with CLI/runtime guidance.
   - Never treat navigation targets as no-code/AI Portal inventory.
4. Inspect structured Portal inventory with `nb portal list -j` when the command surface is available, and retain only records where `enabled === true`. If this inventory call returns explicit endpoint absence (`404` / `Not Found`), treat Portal inventory as runtime-unavailable and apply step 3 for ordinary UI authoring; do not do so for auth errors, `5xx`, or malformed output.
5. Resolve the target Portal:
   - If the user supplied a Portal name, require exactly one record whose `name` is an exact match and whose `enabled` value is `true`. A missing, disabled, or non-unique match stops the build.
   - If no Portal was supplied and zero enabled Portals exist, stop and tell the user to explicitly create a Portal first. Do not create one automatically.
   - If no Portal was supplied and exactly one enabled Portal exists, select it automatically.
   - If no Portal was supplied and multiple Portals exist, list each `name` and `portalType`, ask for an explicit selection, and do no UI write.
   - Do not infer the target from cwd, active files, `portal.config.json`, `localPath`, sync state, title similarity, or type preference.
6. Read the selected record's `portalType`. It is the only source for no-code versus AI routing.
7. If it is a no-code Portal, use the `nocobase-ui-builder` skill for page, menu, block, field, action, and permission authoring.
8. If it is an AI Portal, use `nb portal info <portal>`, its `localPath`, `portal.config.json`, or local workspace state only to locate the already selected Portal's source project, then implement and test the requested UI there without asking for separate code-edit authorization.
9. If `portalType` is absent or unsupported, stop instead of guessing.
10. After UI changes, use this skill for `nb portal dev`, `nb portal push`, or `nb portal deploy` only when requested or naturally needed for verification/readback and only when `nb portal` is available.

Explicit `action=create` requests continue through the Portal Command Workflow. The zero-Portal stop above applies only to ordinary UI builds and must not suppress an explicit lifecycle request to create a Portal.

## Portal Command Workflow

1. Infer the Portal action and target env from the user's request.
2. Read [Runtime Contract](references/runtime-contract.md) before executing an unfamiliar command shape or when building a command with flags.
3. For Git source storage setup or failures, read [Git Source Storage](references/git-source-storage.md).
4. Check whether `nb portal` is available before trying the action.
5. If `nb portal` is unavailable, stop without fallback mutation and report the missing command surface plus the next `nocobase-env-manage` handoff.
6. Ask only for missing required inputs or required confirmations.
7. Execute the direct `nb portal` command.
8. For write actions except `dev`, read back with `nb portal info <portal>` when available; otherwise use `nb portal list -j`.
9. For `push`, report whether source changes were committed or the CLI reported no changes.
10. For failures, return the failed command, key CLI output, likely cause, and one next command.

# Action Routing

- Use `list` for "show portals", "有哪些 portal", "portal 列表".
- Use `info` for "portal details", "查看 portal 配置", "当前 git 配置".
- Use `create` for "创建 portal", "new Portal workspace", "from template".
- Use `config` for "配置 portal git", "改 source storage", "set git repo/branch/path".
- Use `pull` for "拉取 portal 源码", "sync remote to local".
- Use `push` for "推送 portal 源码", "portal push", "commit source to Git".
- Use `deploy` for "部署 portal", "build and deploy portal".
- Use `dev` for "启动 portal dev", "local portal development".
- Use `destroy` only for explicit delete/destroy intent.
- Use `diagnose` when the user provides an error log or asks why a Portal command failed.
- Use `build` for every ordinary NocoBase page, menu, block, field, action, layout, or reaction request, whether or not it mentions a Portal.
- When a UI request omits the Portal name, inspect structured env inventory first: zero stops, exactly one is automatic, and multiple require explicit selection.
- For no-code Portal build requests, use the `nocobase-ui-builder` skill for UI authoring.
- For AI Portal build requests, locate the Portal source directory and implement UI changes there.

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [Runtime Contract](references/runtime-contract.md) | Building or checking direct `nb portal` command invocations | Contains command map, env flag placement, and readback rules. |
| [Git Source Storage](references/git-source-storage.md) | Configuring Git source storage or diagnosing Git push/pull failures | Covers root path default, empty repositories, and branch/path recovery. |
| [Test Playbook](references/test-playbook.md) | Validating the skill or planning capability checks | Read before adding tests or forward-testing the skill. |

# Safety Gate

High-impact actions:

- `nb portal destroy`
- `nb portal pull --force`
- `nb portal create --force`
- configuring Git source storage for a shared or production Portal
- `nb portal deploy` to a production-like env

Secondary confirmation templates:

- Destroy: `Confirm execution: destroy Portal <portal> in env <env>. Expected impact: Portal record/workspace may be removed. Reply confirm to continue.`
- Overwrite local source: `Confirm execution: overwrite local Portal source for <portal> in env <env>. Reply confirm to continue.`
- Production deploy: `Confirm execution: deploy Portal <portal> to env <env>. Reply confirm to continue.`

Rollback guidance:

- Failed `config`: inspect with `nb portal info <portal>` and re-run `nb portal config` with the previous values if known.
- Failed `pull --force`: local overwritten files may require restoration from Git or backup; do not invent a rollback.
- Failed `push`: inspect the Git error and retry only after branch, auth, repo, or path issue is corrected.
- Failed `deploy`: report CLI output and run `nb portal info <portal>` or deployment-specific readback if available.

# Verification Checklist

- Action and Portal target are resolved when the command surface supports the requested operation.
- Direct `nb portal` command is used when `nb portal` is available.
- `nb portal` availability is checked before Portal command execution.
- Explicit env handling is preserved.
- Required confirmations are collected before destructive or overwrite actions.
- Git source storage commands include a full remote URL when required.
- Default Git path uses `.` for one-Portal-per-repository workflows.
- Write actions have readback with `nb portal info` or `nb portal list -j`.
- Ordinary UI build requests use `nb portal list -j`, filter `enabled === true`, and resolve exactly one Portal before choosing an implementation path.
- Explicit Portal names match `name` exactly; multiple Portals never use local context for selection.
- Portal type comes only from `portalType`.
- No-code Portal UI authoring uses the `nocobase-ui-builder` skill.
- AI Portal UI authoring happens in the corresponding Portal source directory.
- Failure output includes the failed command and relevant CLI lines.
- Final answer reports commands, result, readback status, assumptions, and remaining risks.

# Minimal Test Scenarios

1. `list` uses `nb portal list -j` and does not ask for a Portal name.
2. `config` with Git storage requires `git_repo` and defaults `git_path` to `.`.
3. `push` with an empty Git repository reports branch creation support or actionable recovery.
4. `pull --force` blocks until explicit confirmation.
5. `destroy` blocks until explicit confirmation.
6. Zero enabled Portals stop ordinary UI authoring without implicit creation.
7. Exactly one no-code Portal uses the `nocobase-ui-builder` skill.
8. Exactly one AI Portal resolves and edits the corresponding Portal source directory.
9. Multiple Portals list `name` and `portalType` and require explicit selection without cwd or local-file inference.
10. Explicit missing, disabled, or non-unique Portal names stop without substitution.
11. App start/update request is handed off to `nocobase-env-manage`.
12. Missing `nb portal` blocks lifecycle/source/deploy actions with a clear CLI capability report and does not use private API fallbacks.
13. Missing Portal runtime support permits the legacy UI Builder lane when `list-navigation-targets` explicitly returns `capabilities.multiPortal: false`, or when the action is explicitly absent and the verified legacy Flow Surfaces signature succeeds. `true`, auth errors, `5xx`, malformed output, or a failed core probe stop.

# Output Contract

For direct Portal command tasks, always return:

- `request`
- `capability`
- `commands`
- `env`
- `portal`
- `result`
- `readback`
- `assumptions`
- `next_steps`

For natural UI build tasks, return:

- `request`
- `env`
- `portal`
- `capability`
- `portal_type`
- `implementation_path`
- `build_summary`
- `verification`
- `next_steps`

# References

- [Runtime Contract](references/runtime-contract.md)
- [Git Source Storage](references/git-source-storage.md)
- [Test Playbook](references/test-playbook.md)
- [NocoBase Portal CLI docs](https://docs.nocobase.com/api/cli/portal): official command reference. [verified: 2026-07-28]
