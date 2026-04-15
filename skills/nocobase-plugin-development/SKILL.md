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

# Hard Constraints

These rules apply to ALL generated plugin code. Violating them is always wrong.

## NEVER use `this.app.use()` or React Providers

`this.app.use()` is an internal API. Plugins must NEVER use it to wrap the app with React providers. This is not a suggestion — it is a hard rule with no exceptions.

Providers add unnecessary React rendering layers, hurt performance, and make plugins harder to maintain. When implementing global effects (watermarks, overlays, theming, tracking, global listeners, etc.), use these approaches instead:

1. **FlowEngine mechanisms** (preferred) — `registerModelLoaders`, `registerFlow`, `registerModels` for UI capabilities.
2. **FlowEngine context** — `this.context` holds global data (e.g., `this.context.api`, `this.context.dataSourceManager`, `this.context.logger`). Read from it directly instead of creating Providers to pass data around. Note: some properties like `user`, `viewer`, `message`, `themeToken` are only available after React renders — use them in flow handlers or components, not in `load()`.
3. **API requests** — if the plugin needs data, use `this.app.apiClient.request()` to fetch it directly. Axios interceptors are allowed but should not be the first choice — prefer direct requests or reading from context when possible.
4. **Pure DOM manipulation** — operate on the DOM directly in `load()` for visual effects. No React component needed.
5. **EventBus** — `this.app.eventBus` for reacting to app lifecycle events.

If you find yourself thinking "I need a Provider for this", stop and reconsider. There is always a better alternative.

## Client code goes in `client-v2` ONLY

All client-side plugin code must be written in `src/client-v2/`. The `src/client/` directory is for the legacy v1 client — do NOT write or modify any files there. Import `Plugin` from `@nocobase/client-v2`, never from `@nocobase/client`.

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

**CRITICAL: You MUST always confirm the plan with the user before writing any code or running any scaffold command — even if the requirement seems perfectly clear.** Users often have unstated assumptions, edge cases they haven't considered, or preferences about scope. The plan confirmation step (Step 2) is a hard gate, not a suggestion. Never skip it.

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

## Step 2: Plan Confirmation (HARD GATE)

**This step is mandatory and must not be skipped, regardless of how clear the requirement appears.** Even seemingly straightforward requirements can have unstated edge cases, scope preferences, or assumptions the user hasn't mentioned. Always present the plan and wait for explicit confirmation before proceeding to Step 3.

Present a functional plan in plain language the user can understand. Proactively highlight decisions the user may not have considered (e.g., "Should the data persist after plugin disable?", "Do you need a settings page for configuration?"). Example:

> "Here's my plan:
> 1. Create a settings page where you can configure the API key
> 2. Add a scheduled task that syncs data every 5 minutes
> 3. Create a data table to store the synced records
> 4. The table will be available as a block in the UI
>
> A few things to confirm:
> - Should the synced data be cleared when the plugin is disabled?
> - Do you need permission control for who can access the settings?
>
> Does this look right?"

**Do NOT run `yarn pm create` or write any code until the user explicitly confirms.**

## Step 3: Scaffold Plugin

The exact command is:

```bash
yarn pm create <plugin_name>
# Example: yarn pm create @nocobase-sample/plugin-hello
# Creates:  packages/plugins/@nocobase-sample/plugin-hello/
```

This is the only correct command. Do NOT use `create-plugin`, `generate`, or any other variant. Do NOT look up alternatives — just run it.

Read `references/getting-started.md` for the expected project structure.

## Step 4: Generate Code (MUST Read References First)

**You MUST read the relevant reference files BEFORE writing any code.** Do NOT skip this by searching source code, reading examples, or relying on prior knowledge. The references contain project-specific conventions that override general knowledge.

Read `references/index.md` to locate the relevant reference files, then read the ones needed for this plugin.

### Mandatory Reference Rules

These are hard gates, not suggestions. Read the file BEFORE editing the corresponding code:

| When you edit... | You MUST first read |
|---|---|
| `src/client-v2/plugin.tsx` | `references/client/plugin.md` |
| `src/server/plugin.ts` | `references/server/plugin.md` |
| Any file in `src/client-v2/models/` | `references/client/block.md`, `references/client/field.md`, or `references/client/action.md` (whichever applies) |
| Any file in `src/server/collections/` | `references/server/collection.md` |

### Keyword-Triggered References

If your implementation involves any of these concepts, you MUST also read the corresponding reference:

| Keywords in your code | MUST read |
|---|---|
| `route`, `router`, `navigate`, `location`, `pathname` | `references/client/router.md` and `references/client/ctx.md` |
| `ctx.api`, `ctx.viewer`, `ctx.message`, `ctx.model` | `references/client/ctx.md` |
| `registerFlow`, `uiSchema`, `on:` event handlers | `references/client/flow.md` |
| `resource`, `MultiRecordResource`, `SingleRecordResource` | `references/client/resource.md` |
| `tExpr`, `useT`, `this.t` | `references/client/i18n.md` |
| `acl.allow`, permissions | `references/server/acl.md` |
| `defineCollection`, fields, relations | `references/server/collection.md` |

### Generation Order

Flexible — adapt to the plugin's needs:
- Server-first when the plugin has data tables and APIs.
- Client-first when the plugin is purely frontend.
- Interleaved when both sides are tightly coupled.

**Checkpoint before writing client code:** Review the "Hard Constraints" section. Never use `this.app.use()` or Providers. Use FlowEngine, context, pure DOM, or EventBus instead.

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
| Client version | `client-v2` ONLY. All client code in `src/client-v2/`. Never use `src/client/` or import from `@nocobase/client` | Never |
| Model registration | `registerModelLoaders` (lazy loading) | Never |
| Route registration | `componentLoader` (lazy loading) | Never |
| Settings page registration | `pluginSettingsManager.addMenuItem()` + `addPageTabItem()` with `componentLoader` | Never |
| ACL | `acl.allow('*', '*', 'loggedIn')` | User mentions fine-grained permissions |
| Locale files | `zh-CN.json` + `en-US.json` | User mentions other languages |
| `addCollection` (client-side) | Do NOT add — recommend UI "Data Source Management" instead | Only as a demo; if needed, use `eventBus` pattern (NOT direct call in `load()`) |
| `install()` seed data | Do NOT add | User mentions preset/demo data |
| `tExpr` import | From plugin's `locale.ts`, NOT from `@nocobase/flow-engine` directly | Never |
| `this.app.use()` (Provider) | Do NOT use — use FlowEngine mechanisms or pure DOM instead. See `client/plugin.md` | Never |

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
- **Non-source install**: Browse https://github.com/nocobase/nocobase/tree/develop/packages/plugins/%40nocobase-example/

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
- No `this.app.use()` or React Provider patterns in generated code (Hard Constraint).
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
- [Online Docs — Plugin Development](https://docs.nocobase.com/cn/plugin-development/index.md): full plugin development documentation. [verified: 2026-04-10]
- [Online Docs — FlowEngine](https://docs.nocobase.com/cn/flow-engine/index.md): FlowEngine complete reference. [verified: 2026-04-10]
- [Example Plugins (GitHub)](https://github.com/nocobase/nocobase/tree/develop/packages/plugins/%40nocobase-example): working example plugins. [verified: 2026-04-10]
