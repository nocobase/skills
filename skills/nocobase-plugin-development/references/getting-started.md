# Getting Started

Read this when scaffolding a new plugin (Step 3 of the workflow).

## Prerequisite: a source tree

Plugin development requires NocoBase source code — the plugin is scaffolded into `packages/plugins/` of a source tree and built from there. Two setups qualify:

- **CLI-managed Git-source app** — created with `nb init --ui` choosing **`Git source install`**. Source lives at `<app-path>/source/`.
- **Plain source repo** — cloned directly (`git clone https://github.com/nocobase/nocobase.git`). Source is the repo root.

Apps installed via Docker or `create-nocobase-app` do not carry a usable source tree. If that is what the user has, stop and walk them through the options in Step 0 of `SKILL.md` before scaffolding anything.

## Scaffold Command

For CLI-managed source apps, run from `<app-path>/source/`:

```bash
cd <app-path>/source
nb scaffold plugin @my-project/plugin-hello
```

This creates the plugin at `<app-path>/source/packages/plugins/@my-project/plugin-hello/`.

For plain source repos, run from the repo root:

```bash
yarn pm create @my-project/plugin-hello
```

This creates the plugin at `packages/plugins/@my-project/plugin-hello/`.

Both commands generate into `packages/plugins/` relative to the current working directory — `nb scaffold plugin` is a thin wrapper around `pm create` — so running them from the wrong directory puts the plugin in the wrong place.

## Development Mode

Start dev mode after scaffolding so code changes hot-reload:

```bash
# CLI-managed source app — from <app-path>/source/
nb source dev

# Plain source repo — from the repo root
yarn dev
```

## Project Structure

The scaffold creates both `src/client-v2/` and `src/client/` directories. **Only use `src/client-v2/`** — the `src/client/` directory is legacy v1 code and must be ignored.

```
# CLI-managed app: <app-path>/source/packages/plugins/@my-project/plugin-hello/
# Plain source repo: packages/plugins/@my-project/plugin-hello/
plugin-hello/
├── package.json
├── README.md
├── .npmignore
├── client-v2.d.ts               # Frontend type declaration (v2)
├── client-v2.js                 # Frontend build entry (v2)
├── client.d.ts                  # Frontend type declaration (v1 legacy)
├── client.js                    # Frontend build entry (v1 legacy)
├── server.d.ts                  # Server type declaration
├── server.js                    # Server build entry
└── src/
    ├── index.ts                  # Default export: server plugin
    ├── client-v2/                # Client code — ALL client code goes here
    │   ├── index.tsx             # Default export: client plugin class
    │   ├── plugin.tsx            # Plugin entry (extends @nocobase/client-v2 Plugin)
    │   └── client.d.ts
    ├── client/                   # LEGACY v1 — do NOT write code here
    ├── server/                   # Server code
    │   ├── index.ts              # Default export: server plugin class
    │   ├── plugin.ts             # Plugin entry (extends @nocobase/server Plugin)
    │   └── collections/          # defineCollection files (empty directory initially)
    └── locale/                   # i18n files (shared by client and server)
        ├── zh-CN.json
        └── en-US.json
```

**The scaffold is minimal.** `src/client-v2/` contains only the entry files above — these directories and files do NOT exist yet and you must create them as needed:

| Create when you need... | Path |
|---|---|
| `tExpr()` / `useT()` with the plugin namespace | `src/client-v2/locale.ts` (see [Client i18n](./client/i18n.md) for the exact contents) |
| FlowModel classes (blocks, fields, actions) | `src/client-v2/models/` |
| Migration scripts | `src/server/migrations/` (or generate via `nb scaffold migration` / `yarn nocobase create-migration`) |

Note that `src/client/locale.ts` and `src/client/models/` DO exist in the scaffold — they belong to the legacy v1 client. Do not import from them; create the `client-v2` counterparts instead.

## Key Files to Edit

| What | File |
|---|---|
| Server plugin logic | `src/server/plugin.ts` |
| Client plugin logic | `src/client-v2/plugin.tsx` |
| Data table definitions | `src/server/collections/*.ts` |
| FlowModel classes | `src/client-v2/models/*.tsx` |
| Translations | `src/locale/zh-CN.json`, `src/locale/en-US.json` |

## Enable Plugin

For CLI-managed source apps:

```bash
nb plugin enable @my-project/plugin-hello
```

For plain source repos:

```bash
yarn pm enable @my-project/plugin-hello
```

After enabling, the plugin appears in the Plugin Manager (typically at `http://localhost:13000/v/admin/settings/plugin-manager` — adjust the port and base URL to match your environment).

## Deep Reference

- https://docs.nocobase.com/cn/plugin-development/write-your-first-plugin.md
- https://docs.nocobase.com/cn/plugin-development/project-structure.md

## Related Links

- [Server Plugin](./server/plugin.md) — server plugin class and lifecycle
- [Client Plugin](./client/plugin.md) — client plugin class and registration
- [Client i18n](./client/i18n.md) — locale.ts, tExpr, useT
- [Build](./build.md) — building and packaging
