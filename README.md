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
| `nocobase-ai-manager`      | Prepare shared AI prerequisites — discover providers/models and securely manage saved LLM services through `nb api ai`.                    |
| `nocobase-ai-employee` | Decide, create, maintain, verify, and prepare placement for AI employees, including model restrictions and knowledge-base bindings. |
| `nocobase-ai-knowledge-base-manager` | Maintain vector databases, knowledge bases, documents, retrieval tests, and employee KB bindings through `nb api kb`.             |
| `nocobase-data-modeling`   | Create and manage data models — collections, fields, relations, and view-backed schemas.                                                   |
| `nocobase-ui-builder`      | Execute no-code UI authoring after `nocobase-portal-manage` resolves exactly one enabled no-code Portal.                             |
| `nocobase-ai-builder`      | Design, implement, and verify polished source-code applications for every selected AI Portal.                                            |
| `nocobase-prototype-repro` | **Opt-in** reproduce a given HTML/image prototype as a faithful NocoBase app — region→native-block map + a screenshot-vs-prototype loop.   |
| `nocobase-portal-manage`   | **Default dispatcher for NocoBase UI authoring** — resolve every page, menu, block, field, action, layout, or reaction request with `nb portal list -j`, then route by `portalType` to the required Portal builder. Multiple Portals require explicit selection; missing Portal CLI falls back only when `capabilities.multiPortal` is explicitly `false`. |
| `nocobase-workflow-manage` | Create, edit, enable, diagnose, and manage NocoBase workflows — triggers, node chains, versions, and execution troubleshooting.            |
| `nocobase-acl-manage`      | Manage roles, permission policies, Portal entry access, user-role membership, global role mode, and risk assessment.                      |
| `nocobase-dsl-reconciler`  | **Opt-in** YAML-DSL path for building whole NocoBase applications from spec files committed to git. Use only when explicitly requested.    |
| `nocobase-plugin-manage`   | List, enable, and disable NocoBase plugins via `nb pm` commands.                                                                           |
| `nocobase-publish-manage`  | Cross-environment release operations — backup & restore, and migration via `nb` CLI.                                                       |
| `nocobase-revision`        | Save completed NocoBase app-building milestones as restorable revisions via `nb revision create`.                                          |

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
npm install -g @nocobase/cli
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
