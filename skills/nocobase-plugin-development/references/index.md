# Reference Index

After analyzing the user's requirement (Step 1), read only the references needed for this plugin. Each file contains code templates, key parameters, and links to full documentation.

## Getting Started

| I need to... | Read |
|---|---|
| Scaffold a new plugin, understand project structure | [getting-started.md](./getting-started.md) |

## Server-Side

| I need to... | Read |
|---|---|
| Define data tables with fields and relations | [server/collection.md](./server/collection.md) |
| Use Repository API for CRUD operations | [server/database.md](./server/database.md) |
| Register custom REST API actions | [server/resource-manager.md](./server/resource-manager.md) |
| Configure access permissions | [server/acl.md](./server/acl.md) |
| Add request middleware | [server/middleware.md](./server/middleware.md) |
| Access request context (ctx.action, ctx.db) | [server/context.md](./server/context.md) |
| Write upgrade migration scripts | [server/migration.md](./server/migration.md) |
| Manage multiple data sources | [server/data-source-manager.md](./server/data-source-manager.md) |
| Server-side plugin class and lifecycle | [server/plugin.md](./server/plugin.md) |
| Server-side i18n | [server/i18n.md](./server/i18n.md) |
| Write server-side tests | [server/test.md](./server/test.md) |

## Client-Side

| I need to... | Read |
|---|---|
| Client plugin class, load(), registration | [client/plugin.md](./client/plugin.md) |
| Register page routes or settings pages | [client/router.md](./client/router.md) |
| Write React components with Antd | [client/component.md](./client/component.md) |
| Use ctx.api, ctx.t, ctx.viewer, ctx.message | [client/ctx.md](./client/ctx.md) |
| Create custom blocks (BlockModel, TableBlockModel) | [client/block.md](./client/block.md) |
| Create custom field components (FieldModel) | [client/field.md](./client/field.md) |
| Create custom action buttons (ActionModel) | [client/action.md](./client/action.md) |
| Use registerFlow, uiSchema, events | [client/flow.md](./client/flow.md) |
| Use MultiRecordResource / SingleRecordResource | [client/resource.md](./client/resource.md) |
| Client-side i18n (tExpr, useT, this.t) | [client/i18n.md](./client/i18n.md) |

## Build & Distribution

| I need to... | Read |
|---|---|
| Build and package the plugin | [build.md](./build.md) |

## Online Documentation

For topics not covered in these references, consult the full documentation:

- Plugin Development: https://pr-8998.v2.docs.nocobase.com/cn/plugin-development/index.md
- FlowEngine: https://pr-8998.v2.docs.nocobase.com/cn/flow-engine/index.md
- API Reference: https://pr-8998.v2.docs.nocobase.com/cn/api/index.md
