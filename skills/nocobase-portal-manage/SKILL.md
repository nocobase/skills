---
name: nocobase-portal-manage
description: "Use when users need to build, modify, inspect, create, configure, sync, push, pull, deploy, develop, diagnose, or destroy NocoBase portals, including named or classed Portal UI requests such as customer, supplier, admin, custom, or AI Portal pages. For natural Portal UI requests, first detect whether the installed CLI supports `nb portal`; when available, run `nb portal list` and identify whether the target is a no-code Portal or an AI Portal. If `nb portal` is unavailable, degrade gracefully: lifecycle/source/deploy actions are blocked with the missing CLI capability, while no-code Modern UI workspace authoring may fall back to `nocobase-ui-builder` and `flow-surfaces list-navigation-targets`. Use direct `nb portal` commands for Portal lifecycle, source storage, sync, and deployment operations whenever the command surface exists."
argument-hint: "[action: build|list|info|create|config|pull|push|deploy|dev|destroy|diagnose] [portal?] [env?: name]"
allowed-tools: Bash, Read, Write, Grep, Glob
owner: platform-tools
version: 1.0.0
last-reviewed: 2026-07-28
risk-level: medium
---

# Goal

Manage NocoBase Portal workspaces and route Portal UI build requests to the correct implementation path, preserving env selection, source storage configuration, and clear readback after changes.

# Scope

- Inspect Portal inventory and details.
- Start natural Portal UI build requests by resolving the target env, Portal, and Portal type.
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
- Do not directly edit Portal source files unless the user explicitly asks for code changes.
- Do not mutate databases or NocoBase internals outside the public `nb portal` command surface.
- Do not run wrapper scripts, Docker fallback commands, or direct SQL as a substitute for `nb portal`.
- Do not treat the absence of `nb portal` as permission to emulate Portal lifecycle, source storage, sync, deploy, or destroy operations through private APIs.

# Hard Rules

- Before executing any `nb portal ...` command, confirm the installed CLI exposes the Portal command surface with `nb portal --help`, `nb --help`, or an equivalent local command-help check.
- Use direct `nb portal` commands for Portal lifecycle, source storage, sync, deploy, and diagnosis operations when that command surface exists.
- If `nb portal` is unavailable, report lifecycle/source/deploy/destroy tasks as blocked by the installed CLI version and hand CLI update/env work to `nocobase-env-manage`; do not switch transports.
- For any natural UI request that mentions `portal`, names a Portal, mentions a Portal class such as customer / supplier / admin / custom / AI Portal, or asks to build/change a page inside a Portal, inspect Portal inventory with `nb portal list` before using `flow-surfaces list-navigation-targets`, `apply-blueprint`, or any source-code edit path when `nb portal` is available.
- When `nb portal` is unavailable and the request can reasonably be handled as no-code Modern UI workspace/page authoring, hand off to `nocobase-ui-builder` and allow its `flow-surfaces list-navigation-targets` compatibility path. State that AI Portal source-code routing and Portal lifecycle features could not be resolved without `nb portal`.
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
- If a Git source storage failure mentions an empty remote, missing branch, or missing configured Git path, diagnose from [Git Source Storage](references/git-source-storage.md) before recommending manual Git commands.

# Workflow

## Natural Portal UI Build Workflow

Use this path when the user asks to build, modify, or continue a Portal UI in natural language, such as "搭一个客户门户", "做一个供应商 Portal", "改 AI Portal 首页", "admin portal 里建页面", "合作伙伴 portal 加页面", "给外部客户做订单查询", or "在 Portal 里加一个工单页面".

1. Inspect the current env with `nb env current` and `nb env info`.
2. Detect Portal CLI support with `nb portal --help` or equivalent command-help output.
3. If `nb portal` is unavailable:
   - For explicit AI Portal/source-code requests, report that AI Portal source resolution requires a CLI with `nb portal` support unless a local Portal source directory is already obvious from the current workspace.
   - For create/config/pull/push/deploy/dev/destroy/list/info requests, stop and report the missing CLI capability; recommend `nocobase-env-manage` for CLI/runtime upgrade or environment diagnosis.
   - For likely no-code Modern UI Portal/workspace page requests, hand off to `nocobase-ui-builder`; it may use `flow-surfaces list-navigation-targets` to find an explicit workspace target and set `navigation.portalUid` when the backend supports it.
4. Inspect Portal inventory with `nb portal list` when the command surface is available.
5. Resolve the target Portal:
   - If exactly one Portal exists, use it by default.
   - If no Portal exists and the request is a new-build request, create a Portal only after resolving the minimum create inputs such as slug/title and Portal type.
   - If no Portal exists and the user did not ask to create one, ask whether to create a new Portal.
   - If multiple Portals exist, infer the target from the user's words, active/local Portal workspace, recent `portal.config.json`, current working directory, or unique name/title match.
   - If multiple Portals still remain possible, ask one concise Portal-selection question and include the available Portal names.
6. Determine whether the target is a no-code Portal or an AI Portal from the user's words, Portal info, template/source metadata, or local workspace structure.
7. If it is a no-code Portal, use the `nocobase-ui-builder` skill for page, menu, block, field, action, and permission authoring.
8. If it is an AI Portal, locate the corresponding Portal source directory from `nb portal info <portal>`, `portal.config.json`, or the local Portal workspace, then edit and test the UI in that directory.
9. If the Portal type is ambiguous, ask one concise question: "这是 no-code portal 还是 ai portal?"
10. After UI changes, use this skill for `nb portal dev`, `nb portal push`, or `nb portal deploy` only when requested or naturally needed for verification/readback and only when `nb portal` is available.

## Portal Command Workflow

1. Infer the Portal action and target env from the user's request.
2. Read [Runtime Contract](references/runtime-contract.md) before executing an unfamiliar command shape or when building a command with flags.
3. For Git source storage setup or failures, read [Git Source Storage](references/git-source-storage.md).
4. Check whether `nb portal` is available before trying the action.
5. If `nb portal` is unavailable, stop without fallback mutation and report the missing command surface plus the next `nocobase-env-manage` handoff.
6. Ask only for missing required inputs or required confirmations.
7. Execute the direct `nb portal` command.
8. For write actions except `dev`, read back with `nb portal info <portal>` when available; otherwise use `nb portal list`.
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
- Use `build` for natural UI requests such as "搭 portal", "客户门户", "供应商 portal", "admin portal 里建页面", "合作伙伴 portal 加页面", "AI Portal 页面", "portal UI", "订单查询页面", "提交工单", "会员中心", or "外部用户页面".
- When a UI request omits the Portal name, inspect env and Portal inventory first; use the only Portal by default, infer from local context when possible, and ask only if multiple targets remain plausible.
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
- Write actions have readback with `nb portal info` or `nb portal list`.
- Natural UI build requests resolve no-code Portal vs AI Portal before choosing an implementation path.
- No-code Portal UI authoring uses the `nocobase-ui-builder` skill.
- AI Portal UI authoring happens in the corresponding Portal source directory.
- Failure output includes the failed command and relevant CLI lines.
- Final answer reports commands, result, readback status, assumptions, and remaining risks.

# Minimal Test Scenarios

1. `list` uses `nb portal list` and does not ask for a Portal name.
2. `config` with Git storage requires `git_repo` and defaults `git_path` to `.`.
3. `push` with an empty Git repository reports branch creation support or actionable recovery.
4. `pull --force` blocks until explicit confirmation.
5. `destroy` blocks until explicit confirmation.
6. No-code Portal UI page authoring request uses the `nocobase-ui-builder` skill.
7. AI Portal UI page authoring request resolves and edits the corresponding Portal source directory.
8. Ambiguous Portal UI request asks whether the target is no-code Portal or AI Portal when it cannot be inferred.
9. App start/update request is handed off to `nocobase-env-manage`.
10. Missing `nb portal` blocks lifecycle/source/deploy actions with a clear CLI capability report and does not use private API fallbacks.
11. Missing `nb portal` still allows likely no-code Modern UI Portal/workspace page authoring to proceed through `nocobase-ui-builder` when `flow-surfaces list-navigation-targets` can resolve the target.

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
