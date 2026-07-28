---
name: nocobase-portal-manage
description: "Use when users need to create, configure, inspect, sync, push, pull, deploy, develop, diagnose, or destroy NocoBase portals through direct `nb portal` commands, including Git source storage setup and portal source push/pull workflows."
argument-hint: "[action: list|info|create|config|pull|push|deploy|dev|destroy|diagnose] [portal?] [env?: name]"
allowed-tools: Bash, Read, Write, Grep, Glob
owner: platform-tools
version: 1.0.0
last-reviewed: 2026-07-28
risk-level: medium
---

# Goal

Manage NocoBase Portal workspaces with direct `nb portal` commands, preserving env selection, source storage configuration, and clear readback after changes.

# Scope

- Inspect Portal inventory and details.
- Create Portal workspaces from templates.
- Configure Portal source storage, including Git repo, branch, and path.
- Pull and push Portal source between local workspace, NocoBase storage, and Git source storage.
- Deploy a Portal or start Portal development mode.
- Diagnose common Portal CLI and Git source storage failures.
- Destroy a Portal only when explicitly requested and confirmed.

# Non-Goals

- Do not author Modern UI pages, blocks, menus, reactions, or page content; hand off to `nocobase-ui-builder`.
- Do not manage app runtime lifecycle, CLI self-update, env setup, or installed skills update; hand off to `nocobase-env-manage`.
- Do not manage backup restore or migration publishing; hand off to `nocobase-publish-manage`.
- Do not directly edit Portal source files unless the user explicitly asks for code changes.
- Do not mutate databases or NocoBase internals outside the public `nb portal` command surface.
- Do not run wrapper scripts, Docker fallback commands, or direct SQL as a substitute for `nb portal`.

# Hard Rules

- Use direct `nb portal` commands only.
- Use the current configured CLI env unless the user provides an explicit env.
- When passing an explicit env that may differ from the current env, include `--yes` only when the user requested non-interactive execution or explicitly confirmed the target env.
- Before `destroy`, require explicit confirmation from the user.
- Before `pull --force`, `create --force`, or any operation that overwrites local Portal source, require explicit confirmation.
- For one-Portal-per-repository Git workflows, prefer `--git-path .`.
- Use subdirectory `--git-path` values only when the user wants multiple Portals or other content in the same Git repository.
- If an existing `portal.config.json` or remote Portal record already has `git.path`, do not assume the current CLI default rewrites it; change it explicitly with `nb portal config <portal> --git-path .` when requested.
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

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `action` | yes | inferred | one of `list/info/create/config/pull/push/deploy/dev/destroy/diagnose` | "Which Portal action should I run?" |
| `portal` | except `list` | none | valid Portal slug/name accepted by CLI | "Which Portal should I target?" |
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
- If a Git source storage failure mentions an empty remote, missing branch, or missing `gitPath`, diagnose from [Git Source Storage](references/git-source-storage.md) before recommending manual Git commands.

# Workflow

1. Infer the Portal action and target env from the user's request.
2. Read [Runtime Contract](references/runtime-contract.md) before executing an unfamiliar command shape or when building a command with flags.
3. For Git source storage setup or failures, read [Git Source Storage](references/git-source-storage.md).
4. Ask only for missing required inputs or required confirmations.
5. Execute the direct `nb portal` command.
6. For write actions except `dev`, read back with `nb portal info <portal>` when available; otherwise use `nb portal list`.
7. For `push`, report whether source changes were committed or the CLI reported no changes.
8. For failures, return the failed command, key CLI output, likely cause, and one next command.

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

- Action and Portal target are resolved.
- Direct `nb portal` command is used.
- Explicit env handling is preserved.
- Required confirmations are collected before destructive or overwrite actions.
- Git source storage commands include a full remote URL when required.
- Default Git path uses `.` for one-Portal-per-repository workflows.
- Write actions have readback with `nb portal info` or `nb portal list`.
- Failure output includes the failed command and relevant CLI lines.
- Final answer reports commands, result, readback status, assumptions, and remaining risks.

# Minimal Test Scenarios

1. `list` uses `nb portal list` and does not ask for a Portal name.
2. `config` with Git storage requires `git_repo` and defaults `git_path` to `.`.
3. `push` with an empty Git repository reports branch creation support or actionable recovery.
4. `pull --force` blocks until explicit confirmation.
5. `destroy` blocks until explicit confirmation.
6. UI page authoring request is handed off to `nocobase-ui-builder`.
7. App start/update request is handed off to `nocobase-env-manage`.

# Output Contract

Always return:

- `request`
- `commands`
- `env`
- `portal`
- `result`
- `readback`
- `assumptions`
- `next_steps`

# References

- [Runtime Contract](references/runtime-contract.md)
- [Git Source Storage](references/git-source-storage.md)
- [Test Playbook](references/test-playbook.md)
- [NocoBase Portal CLI docs](https://docs.nocobase.com/api/cli/portal): official command reference. [verified: 2026-07-28]
