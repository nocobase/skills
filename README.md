# NocoBase Skills

> [!WARNING]
> NocoBase Skills is still in draft status. The content is for reference and may change at any time.

Reusable domain knowledge packages for AI Agent CLIs (Claude Code, Codex, Cursor, OpenCode, etc.) that enable agents to understand and operate NocoBase — covering data modeling, UI configuration, workflow orchestration, permission management, plugin development, and more.

NocoBase CLI automatically installs Skills during initialization (`nb init`), so no manual installation is needed.

## Available Skills

### AI Building

| Skill                      | Description                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `nocobase-env-manage`      | Bootstrap and manage NocoBase application lifecycle — install, start, stop, upgrade, and environment management via `nb` CLI.              |
| `nocobase-data-modeling`   | Create and manage data models — collections, fields, relations, and view-backed schemas.                                                   |
| `nocobase-ui-builder`      | **Default entry point for UI authoring** — create and edit pages, blocks, popups, menu items, and linkage rules on a running NocoBase app. |
| `nocobase-workflow-manage` | Create, edit, enable, diagnose, and manage NocoBase workflows — triggers, node chains, versions, and execution troubleshooting.            |
| `nocobase-acl-manage`      | Manage roles, permission policies, user-role membership, global role mode, and risk assessment.                                            |
| `nocobase-dsl-reconciler`  | **Opt-in** YAML-DSL path for building whole NocoBase applications from spec files committed to git. Use only when explicitly requested.    |
| `nocobase-plugin-manage`   | List, enable, and disable NocoBase plugins via `nb pm` commands.                                                                           |
| `nocobase-publish-manage`  | Cross-environment release operations — backup & restore, and migration via `nb` CLI.                                                       |

### AI Plugin Development

| Skill                         | Description                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `nocobase-plugin-development` | Step-by-step playbook for developing NocoBase plugins — scaffolding, server-side code, client-side code, i18n, and verification. |

### Utilities

| Skill                    | Description                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `nocobase-data-analysis` | Query and analyze business data in NocoBase via MCP — counts, grouped breakdowns, distributions, and summaries. |
| `nocobase-utils`         | Cross-cutting reference utilities — evaluator engines, expression syntax, UID generation, and more.             |

## Getting Started

### 1. Install NocoBase CLI

```bash
npm install -g @nocobase/cli@beta
```

### 2. Initialize

Create a working directory and run the visual setup wizard:

```bash
mkdir my-nocobase && cd my-nocobase
nb init --ui
```

The browser will open a configuration page where you can install a new NocoBase application or connect to an existing one. Skills are installed automatically during this process.

### 3. Connect Your AI Agent

Start or restart your AI Agent session in the initialized directory:

```bash
cd my-nocobase && claude   # or codex, cursor, etc.
```

If using a graphical AI tool (Claude Code Desktop, Cursor, Codex App, etc.), add the initialized directory as the tool's working directory.

For detailed instructions, see the [AI Agent Integration Guide](https://docs.nocobase.com/ai/quick-start).

## Documentation

- [AI Agent Integration Guide](https://docs.nocobase.com/ai/quick-start) — Install CLI, connect AI Agent, get started
- [AI Building](https://docs.nocobase.com/ai-builder) — Build NocoBase applications with AI
- [AI Plugin Development](https://docs.nocobase.com/ai-dev) — Develop NocoBase plugins with AI
- [NocoBase CLI Reference](https://docs.nocobase.com/api/cli/cli) — Full command and parameter documentation
