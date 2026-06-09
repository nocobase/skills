---
name: nocobase-revision
description: "Use when building a NocoBase app with NocoBase skills or the nb CLI and you want to save a completed, meaningful milestone as a restorable revision."
argument-hint: '"<description>" [--api-base-url <url>] [--env <env>] [--role <role>] [--token <token>] [--yes] [--json-output]'
allowed-tools: "shell, local file reads"
owner: platform-tools
version: 1.0.0
last-reviewed: 2026-05-26
risk-level: medium
---

# Goal

Create one restorable revision with `nb revision create` after a meaningful NocoBase app-building milestone has been completed and verified.

# When To Use

- Use after a verified, meaningful app-building step has been completed.
- Create one revision per meaningful milestone, not after every small tweak.
- Skip it if the user explicitly says not to create a revision.

# Version control gate

- You must run `nb api pm list` before any revision-related decision, output, or command in this skill.
- You must inspect the plugin list for `@nocobase/plugin-version-control`.
- Only when that plugin exists and `enabled=true` may you continue with any `nb revision create` flow.
- If the plugin is missing, or present but `enabled=false`, you must stop immediately.
- In that blocked case, do not run `nb revision create`.
- In that blocked case, do not mention the plugin check, do not mention revision capability, do not mention that revision was skipped, and do not expose any related explanation to the user.
- In that blocked case, produce no revision action and no revision-status disclosure. Treat it as a silent no-op and exit this skill.
- This gate is absolute. No exception, no fallback, no user-facing disclosure.

# Command

- Base: `nb revision create "<DESCRIPTION>"`
- Cross-env: `nb revision create --env <env> --yes "<DESCRIPTION>"`
- Optional flags: `--api-base-url <url>`, `--role <role>`, `--token <token>`, `-j, --json-output`

Rules:

- `DESCRIPTION` is required.
- Prefer the current CLI env. Omit `--env` when it is not needed.
- Only add optional flags when the user or runtime actually needs them.
- If `--env` differs from the current env, confirm before adding `--yes`.
- Treat `nb revision create` as an API-backed command. If it fails because of sandbox or network permission restrictions, you must request user approval for the required permission and then retry. Do not stop at the first sandbox-related failure.

# Description Rules

- Keep it concise, professional, and milestone-oriented.
- Describe what was completed: page, collection, form, action, or workflow.
- Reuse the user's wording if it is already good; otherwise expand it into one short natural phrase.
- Keep it within the CLI limit of `2000` characters.
- Avoid vague labels such as `snapshot`, `backup`, `test`, `version 2`, or timestamp-only text.
- Do not include secrets, tokens, URLs, or credential fragments.

Examples:

- `Completed customer detail page, edit form, and submission workflow wiring`
- `Completed supplier collection, request form, and approval workflow setup`
- `完成客户台账、详情页与审批提交流程配置`

# Workflow

1. Run `nb api pm list`.
2. Inspect the plugin list for `@nocobase/plugin-version-control` and continue only if that plugin exists with `enabled=true`.
3. If the plugin is missing or disabled, stop as a silent no-op with no user-facing disclosure.
4. Before first use in the current task after the gate passes, run `nb revision create --help` and follow the live CLI help.
5. Confirm the upstream work is already verified.
6. Normalize `DESCRIPTION` into one concise completed-work summary.
7. Resolve env. If an explicit env differs from the current env, confirm before adding `--yes`.
8. Build exactly one `nb revision create` command with only the needed flags.
9. Execute it. If it fails because of sandbox or network permission restrictions, you must request user approval for the required permission and retry.
10. Report the final description, env, exact command, and key result lines.

# Stop When

- `@nocobase/plugin-version-control` is missing from `nb api pm list`
- `@nocobase/plugin-version-control` is present but `enabled=false`
- the description is empty after normalization
- the completed milestone is still too vague to describe naturally
- the explicit env differs from the current env and confirmation is missing
- the upstream verification step is incomplete
- the CLI reports auth, env access, or revision capability problems
- the command still fails after the required sandbox or network permission retry

Rules:

- If the stop reason is missing or disabled `@nocobase/plugin-version-control`, stop silently and disclose nothing revision-related to the user.
- For all other stop reasons, follow the normal reporting rules in this skill.

# Output Contract

Final response should include:

- final `DESCRIPTION`
- completed milestone context
- target env
- exact `nb revision create` command that was executed or proposed
- defaults or assumptions that were applied
- next manual check step

Silent gate exception:

- If `@nocobase/plugin-version-control` is missing or `enabled=false`, return no revision-related user-facing output at all.
