---
name: nocobase-plugin-development
description: Use when users need to create a NocoBase plugin from scratch, including server-side collections/APIs and client-side blocks/fields/actions with FlowEngine.
argument-hint: "[user requirement in natural language]"
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Agent, WebFetch
owner: nocobase-team
version: 1.0.0
last-reviewed: 2026-04-10
risk-level: medium
---

# Goal

Guide an AI agent through the complete process of developing a NocoBase plugin — from requirement analysis to working code — producing a plugin that follows NocoBase conventions and can be enabled immediately.

# Scope

- Analyze user requirements and map them to NocoBase extension points.
- Scaffold a new plugin with `yarn pm create`.
- Generate server-side code: collections, ACL, custom APIs, migrations, install hooks.
- Generate client-side code: blocks, fields, actions, settings pages, routes.
- Generate i18n locale files.
- Enable and verify the plugin.
- Troubleshoot common issues using FAQ checklist and source code (when available).

# Non-Goals

- Do not build NocoBase applications through the UI (that's `nocobase-ui-builder`).
- Do not handle plugin publishing to external registries.
- Do not modify NocoBase core code.
- Do not migrate existing plugins from client v1 to v2 (that's `nocobase-client-v2-plugin-migration`).

# Input Contract

| Input | Required | Default | Validation | Clarification Question |
|---|---|---|---|---|
| `requirement` | yes | none | non-empty natural language description | "What should this plugin do?" |
| `nocobase_root` | yes | current working directory | must contain `package.json` with `@nocobase/server` | "Where is your NocoBase project root directory?" |
| `plugin_name` | no | derived from requirement | `@<scope>/plugin-<name>` format | "What should the plugin package name be?" |

Rules:

- If `nocobase_root` is not provided, check if the current working directory is a NocoBase project.
- If `plugin_name` is not provided, derive a reasonable name from the requirement and confirm with the user.
- If user says "you decide", use documented defaults.

# Mandatory Clarification Gate

- Max clarification rounds: `2`
- Max questions per round: `3`
- Mutation preconditions:
  - `nocobase_root` is a valid NocoBase project with `yarn` available.
  - `requirement` is clear enough to determine which extension points are needed.
  - Functional plan has been confirmed by the user in plain language.
- If preconditions are not met after two rounds, stop and report what's missing.

# Workflow

## Step 0: Environment Check

1. Verify `nocobase_root` contains a valid NocoBase project (`package.json` with `@nocobase/server`).
2. Verify `yarn` is available.
3. Detect environment type:
   - **Source install**: `packages/core/` exists → AI can read source code for troubleshooting.
   - **create-nocobase-app**: no `packages/core/` → rely on documentation and online references only.

## Step 1: Requirement Analysis

Analyze the user's requirement and determine which extension points are needed:

- **Server-side**: collections, custom REST APIs, ACL, cron jobs, migrations, event listeners
- **Client-side**: blocks (BlockModel/TableBlockModel), fields (FieldModel), actions (ActionModel), settings pages, routes
- **Both**: full-stack plugins with server data + client UI

Do NOT ask the user about technical details (e.g., "Do you need a BlockModel or TableBlockModel?"). Map requirements to extension points internally.

## Step 2: Plan Confirmation

Present a functional plan in plain language the user can understand. Example:

> "Here's my plan:
> 1. Create a settings page where you can configure the API key
> 2. Add a scheduled task that syncs data every 5 minutes
> 3. Create a data table to store the synced records
> 4. The table will be available as a block in the UI
>
> Does this look right?"

Wait for user confirmation before proceeding.

## Step 3: Scaffold Plugin

```bash
yarn pm create <plugin_name>
```

Read `references/getting-started.md` for the expected project structure.

## Step 4: Generate Code

Read `references/index.md` to locate the relevant reference files, then read only the ones needed for this plugin.

Generation order is flexible — adapt to the plugin's needs:
- Server-first when the plugin has data tables and APIs.
- Client-first when the plugin is purely frontend.
- Interleaved when both sides are tightly coupled.

## Step 5: Internationalization

Default behavior (do NOT ask):
- Always generate `src/locale/zh-CN.json` and `src/locale/en-US.json`.
- Use the plugin's auto-generated `locale.ts` for `tExpr` and `useT` imports.

Only ask about additional languages if:
- The user explicitly mentions other languages, OR
- The user is communicating in a language other than Chinese or English.

## Step 6: Enable and Verify

```bash
yarn pm enable <plugin_name>
```

After enabling, describe what the user should see in the UI and how to test the plugin.

# Default Behaviors

These defaults apply unless the user explicitly requests otherwise. Do NOT ask about them.

| Decision | Default | When to ask |
|---|---|---|
| Client version | `client-v2` with `@nocobase/client-v2` | Never |
| Model registration | `registerModelLoaders` (lazy loading) | Never |
| Route registration | `componentLoader` (lazy loading) | Never |
| Settings page registration | `pluginSettingsRouter.add` with `componentLoader` | Never |
| ACL | `acl.allow('*', '*', 'loggedIn')` | User mentions fine-grained permissions |
| Locale files | `zh-CN.json` + `en-US.json` | User mentions other languages |
| `addCollection` (client-side) | Do NOT add — recommend UI "Data Source Management" instead | Only as a demo; if needed, use `eventBus` pattern (NOT direct call in `load()`) |
| `install()` seed data | Do NOT add | User mentions preset/demo data |
| `tExpr` import | From plugin's `locale.ts`, NOT from `@nocobase/flow-engine` directly | Never |

# Troubleshooting

When the plugin doesn't work as expected:

## FAQ Checklist

1. **Plugin not appearing in plugin manager** → Check `package.json` has correct NocoBase metadata. Run `yarn pm enable <name>`.
2. **Collection not showing in block picker** → Recommend user to add the table via NocoBase UI "Data Source Management". If code-level registration is needed (demo only), use `addCollection` with `filterTargetKey: 'id'` and `eventBus` pattern. See `client/plugin.md`.
3. **Settings page shows blank** → Verify using `componentLoader` (not `Component`) for client-v2.
4. **Model not appearing in menus** → Check `define({ label: tExpr('...') })` and `registerModelLoaders` in plugin `load()`.
5. **`load()` database query fails** → `load()` runs before DB sync. Move DB operations to `install()` or request handlers.
6. **i18n not working** → First-time locale files require app restart. Check `tExpr` is imported from `locale.ts` not `@nocobase/flow-engine`.
7. **registerFlow handler not firing** → Check `on` event name. Use `'click'` for buttons, `'beforeRender'` for initialization.

## Source Code Debugging (Source Install Only)

If the environment is a source install, the AI agent may read NocoBase core source code to debug issues:

```
packages/core/server/src/          — Server core
packages/core/client/src/          — Client core (v1, reference only)
packages/core/client-v2/src/       — Client core (v2, recommended)
packages/core/database/src/        — Database layer
packages/core/flow-engine/src/     — FlowEngine
```

## Complete Example Plugins

When a full working example is needed:

- **Source install**: Read `packages/plugins/@nocobase-example/` for working example plugins.
- **Non-source install**: Browse https://github.com/nocobase/nocobase/tree/main/packages/plugins/%40nocobase-example/

# Reference Loading Map

| Reference | Use When | Notes |
|---|---|---|
| [references/index.md](references/index.md) | Always, after Step 1 | Global index — read this to find relevant module references |
| [references/getting-started.md](references/getting-started.md) | Step 3 (scaffolding) | Plugin scaffold + project structure |
| [references/server/*.md](references/server/) | Plugin needs server-side code | One file per server module |
| [references/client/*.md](references/client/) | Plugin needs client-side code | One file per client module |
| [references/build.md](references/build.md) | User asks about building/packaging | Build and distribution |

# Safety Gate

High-impact actions:

- Running `yarn pm create` (creates files in user's project)
- Running `yarn pm enable` (modifies database state)
- Modifying existing plugin files (if plugin already exists)

Secondary confirmation template:

- "I'm about to run `{{command}}` in `{{directory}}`. This will {{impact}}. Should I proceed?"

Rollback guidance:

- If `yarn pm create` produced wrong scaffold → delete the generated directory and re-run.
- If plugin code has bugs after enable → fix the code, the plugin can be disabled with `yarn pm disable <name>`.
- Never run `yarn nocobase install -f` without explicit user confirmation — it resets the database.

# Verification Checklist

- NocoBase project root is valid and `yarn` is available.
- Environment type (source vs create-nocobase-app) is detected.
- User requirement is analyzed and extension points are identified.
- Functional plan is confirmed by user before code generation.
- Plugin scaffold is created successfully.
- All generated files follow NocoBase conventions (client-v2, lazy loading, locale.ts).
- `zh-CN.json` and `en-US.json` are generated with all translatable strings.
- Plugin can be enabled with `yarn pm enable` without errors.
- Generated code matches the patterns in reference templates.
- FAQ checklist is consulted when issues arise.

# Minimal Test Scenarios

1. User requests a simple settings page plugin → scaffold + server API + client settings page.
2. User requests a custom block plugin → scaffold + BlockModel + registerFlow + i18n.
3. User requests a full-stack CRUD plugin → scaffold + defineCollection + ACL + TableBlockModel + custom field + custom action.
4. User provides vague requirement → clarification gate triggers, plan is confirmed before coding.
5. Plugin enable fails → FAQ checklist is consulted, source code is read if available.

# Output Contract

Final response must include:

- What was requested (user's original requirement).
- What was created (list of generated files).
- How to enable and test (commands + expected UI behavior).
- What assumptions/defaults were applied.
- Known limitations or next steps (if any).

# References

- [Reference Index](references/index.md): global index of all reference files.
- [Getting Started](references/getting-started.md): plugin scaffold and project structure.
- [Online Docs — Plugin Development](https://pr-8998.v2.docs.nocobase.com/cn/plugin-development/index.md): full plugin development documentation. [verified: 2026-04-10]
- [Online Docs — FlowEngine](https://pr-8998.v2.docs.nocobase.com/cn/flow-engine/index.md): FlowEngine complete reference. [verified: 2026-04-10]
- [Example Plugins (GitHub)](https://github.com/nocobase/nocobase/tree/main/packages/plugins/%40nocobase-example): working example plugins. [verified: 2026-04-10]
