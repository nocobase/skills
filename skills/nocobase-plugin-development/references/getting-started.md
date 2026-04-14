# Getting Started

Read this when scaffolding a new plugin (Step 3 of the workflow).

## Scaffold Command

```bash
yarn pm create @my-project/plugin-hello
```

This creates the plugin at `packages/plugins/@my-project/plugin-hello/`.

## Project Structure

The scaffold creates both `src/client-v2/` and `src/client/` directories. **Only use `src/client-v2/`** — the `src/client/` directory is legacy v1 code and must be ignored.

```
packages/plugins/@my-project/plugin-hello/
├── package.json
├── client-v2.d.ts
├── client-v2.js
├── server.d.ts
├── server.js
└── src/
    ├── index.ts                  # Default export: server plugin
    ├── client-v2/                # Client code — ALL client code goes here
    │   ├── index.tsx             # Default export: client plugin class
    │   ├── plugin.tsx            # Plugin entry (extends @nocobase/client-v2 Plugin)
    │   ├── locale.ts             # Auto-generated: tExpr() and useT() with plugin namespace
    │   └── models/               # FlowModel classes (blocks, fields, actions)
    │       └── index.ts
    ├── client/                   # LEGACY v1 — do NOT write code here
    ├── server/                   # Server code
    │   ├── index.ts              # Default export: server plugin class
    │   ├── plugin.ts             # Plugin entry (extends @nocobase/server Plugin)
    │   ├── collections/          # defineCollection files
    │   └── migrations/           # Migration scripts
    └── locale/                   # i18n files
        ├── zh-CN.json
        └── en-US.json
```

## Key Files to Edit

| What | File |
|---|---|
| Server plugin logic | `src/server/plugin.ts` |
| Client plugin logic | `src/client-v2/plugin.tsx` |
| Data table definitions | `src/server/collections/*.ts` |
| FlowModel classes | `src/client-v2/models/*.tsx` |
| Translations | `src/locale/zh-CN.json`, `src/locale/en-US.json` |

## Enable Plugin

```bash
yarn pm enable @my-project/plugin-hello
```

After enabling, the plugin appears in the Plugin Manager (typically at `http://localhost:13000/admin/settings/plugin-manager` — adjust the port and base URL to match your environment).

## Deep Reference

- https://pr-8998.v2.docs.nocobase.com/cn/plugin-development/write-your-first-plugin.md
- https://pr-8998.v2.docs.nocobase.com/cn/plugin-development/project-structure.md

## Related Links

- [Server Plugin](./server/plugin.md) — server plugin class and lifecycle
- [Client Plugin](./client/plugin.md) — client plugin class and registration
- [Client i18n](./client/i18n.md) — locale.ts, tExpr, useT
- [Build](./build.md) — building and packaging
