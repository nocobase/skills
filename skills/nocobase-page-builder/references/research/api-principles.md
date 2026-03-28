---
title: "Page Building API Principles"
description: "NocoBase page building internals: source-level behavior and data structures for desktopRoutes / uiSchemas / flowModels"
tags: [nocobase, api, ui-schema, page-building, blocks, reference, principles]
type: reference
status: active
updated: "2026-02-26"
sidebar:
  label: "Page Building"
  order: 1
---

# Page Building API Principles

> **This document is a low-level reference** covering the source-level behavior, Schema structures, and block models of the NocoBase page building API.
>
> For day-to-day page building operations, see → [Page Building Standard Workflow](/300000-projects/300008-nocobase-builder/02-page-building/usage/)
>
> **Source baseline**: `<nocobase-source>/` (NocoBase v2.x main branch)

---

## 1. Architecture Overview

The NocoBase page system consists of two layers:

```
desktopRoutes (menu / routing table)
    ↕ linked via schemaUid
uiSchemas (JSON Schema tree storing page structure)
```

**Core relationships**:
- The `desktopRoutes` table manages the menu navigation structure (group / page / link / tabs)
- The `uiSchemas` table stores the JSON Schema tree for each page (nested structure, persisted via a closure table)
- Each page-type route links to a root Schema node in `uiSchemas` via the `schemaUid` field
- Blocks, fields, and actions within a page are all dynamically inserted through the `uiSchemas` `insertAdjacent` API

### Table Structures

#### `desktopRoutes` table

| Field | Type | Description |
|-------|------|-------------|
| `id` | snowflakeId | Primary key |
| `parentId` | bigInt | Parent route ID (tree structure) |
| `title` | string | Menu title |
| `tooltip` | string | Hover tooltip |
| `icon` | string | Icon name (Ant Design icons) |
| `schemaUid` | string | Associated page Schema UID |
| `menuSchemaUid` | string | Associated menu Schema UID |
| `tabSchemaName` | string | Tab Schema name |
| `type` | string | Route type (see enum below) |
| `options` | json | Additional options (link type stores href/params) |
| `sort` | sort | Sort order, scopeKey=parentId |
| `hideInMenu` | boolean | Whether to hide in menu |
| `enableTabs` | boolean | Whether to enable multi-tab |
| `enableHeader` | boolean | Whether to show page header |
| `displayTitle` | boolean | Whether to show title |
| `hidden` | boolean | Whether hidden (Tab defaults to hidden=true) |

Route type enum (`NocoBaseDesktopRouteType`):

```typescript
enum NocoBaseDesktopRouteType {
  group = 'group',       // Menu group
  page = 'page',         // Classic page (1.0 Schema)
  flowRoute = 'flowRoute', // Flow route
  link = 'link',         // External link
  tabs = 'tabs',         // In-page Tab
  flowPage = 'flowPage', // Flow page (2.0 FlowModel)
}
```

:::caution[1.0 Page vs 2.0 FlowPage]
**CRM v3 exclusively uses the `flowPage` type** (2.0 architecture). The `page` type is a 1.0 legacy.

Key differences:
- `page` — Schema stored directly in the `uiSchemas` table, rendered with `x-component: "Page"`
- `flowPage` — Uses the FlowModel system, block configuration stored in the `flowModels` table

**The uiSchemas API sections (insert / insertAdjacent / patch) in this document apply to both modes**, since blocks inside flowPage still use uiSchemas for storage. However, use the correct type when creating pages/menus.

Use CRM v3 (localhost:14003) data as the ground truth during verification.
:::

> Source: `<nocobase-source>/packages/core/client/src/route-switch/antd/admin-layout/convertRoutesToSchema.ts`
> Collection definition: `<nocobase-source>/packages/plugins/@nocobase/plugin-client/src/collections/desktopRoutes.ts`

#### `uiSchemas` table

| Field | Type | Description |
|-------|------|-------------|
| `x-uid` | uid | Primary key, unique Schema node identifier |
| `name` | string | Schema node name |
| `schema` | json | The node's own Schema data (excludes child nodes) |

> Important: The Schema tree is NOT stored in a single JSON field! Each node occupies its own row, with parent-child relationships managed by the `uiSchemaTreePath` closure table.

#### `uiSchemaTreePath` table (closure table)

| Field | Type | Description |
|-------|------|-------------|
| `ancestor` | string | Ancestor node UID (composite primary key) |
| `descendant` | string | Descendant node UID (composite primary key) |
| `depth` | integer | Depth from ancestor to descendant (0=self-reference) |
| `async` | boolean | Whether to load asynchronously |
| `type` | string | Child node type (properties / items, etc.) |
| `sort` | integer | Sort order within the same level |

> Source: `<nocobase-source>/packages/plugins/@nocobase/plugin-ui-schema-storage/src/server/collections/uiSchemaTreePath.ts`

---

## 2. Desktop Routes API (Menu/Route Management)

Resource name: `desktopRoutes`

### 2.1 List All Routes

```bash
# List all routes (tree format)
GET /api/desktopRoutes:list?tree=true&sort=sort

# List routes accessible to the current user (tree format, with permission filtering)
GET /api/desktopRoutes:listAccessible
```

### 2.2 Create a Page

Creating a page requires two steps:
1. Create a route record in `desktopRoutes`
2. Insert the corresponding page Schema in `uiSchemas`

```bash
# Step 1: Create route
POST /api/desktopRoutes:create
Content-Type: application/json

{
  "type": "page",
  "title": "Customer Management",
  "icon": "TeamOutlined",
  "parentId": null,
  "schemaUid": "page-uid-xxx",
  "menuSchemaUid": "menu-uid-xxx",
  "enableTabs": false,
  "children": [
    {
      "type": "tabs",
      "schemaUid": "tab-uid-xxx",
      "tabSchemaName": "tab-name-xxx",
      "hidden": true
    }
  ]
}
```

```bash
# Step 2: Insert page Schema
POST /api/uiSchemas:insert
Content-Type: application/json

{
  "type": "void",
  "x-component": "Page",
  "x-uid": "page-uid-xxx",
  "properties": {
    "tab-name-xxx": {
      "type": "void",
      "x-component": "Grid",
      "x-initializer": "page:addBlock",
      "x-uid": "tab-uid-xxx",
      "x-async": true,
      "properties": {}
    }
  }
}
```

> Source: `getPageMenuSchema()` function in `<nocobase-source>/packages/core/client/src/modules/menu/PageMenuItem.tsx`

**Key notes**:
- `schemaUid` is the page's Schema UID (root node of the Page component)
- `menuSchemaUid` is the menu item's Schema UID (legacy, currently separate from schemaUid)
- Every page has a hidden tabs child route by default
- The Tab's Schema must have `x-async: true` set so the frontend loads it on demand
- `x-initializer: "page:addBlock"` makes the frontend display an "Add block" button

### 2.3 Create a Menu Group

```bash
POST /api/desktopRoutes:create
Content-Type: application/json

{
  "type": "group",
  "title": "Sales Management",
  "icon": "ShoppingCartOutlined",
  "parentId": null,
  "schemaUid": "group-uid-xxx"
}
```

> Groups do not need a Schema — only a route record. Child menu items are linked via `parentId`.

### 2.4 Create an External Link

```bash
POST /api/desktopRoutes:create
Content-Type: application/json

{
  "type": "link",
  "title": "Help Docs",
  "icon": "QuestionCircleOutlined",
  "parentId": null,
  "options": {
    "href": "https://docs.nocobase.com",
    "params": [],
    "openInNewWindow": true
  }
}
```

### 2.5 Move a Route

```bash
POST /api/desktopRoutes:move
Content-Type: application/json

{
  "sourceId": 123,
  "targetId": 456,
  "sortField": "sort",
  "method": "insertAfter"
}
```

### 2.6 Delete a Route

```bash
POST /api/desktopRoutes:destroy?filterByTk=123
```

> Note: Deleting a route cascades to child routes and triggers an `afterDestroy` hook that cleans up associated flowModels.

### 2.7 Role Permissions

```bash
# Set routes accessible to a role
POST /api/roles.desktopRoutes:set/admin
Content-Type: application/json

{
  "values": [1, 2, 3, 4, 5]
}
```

> Newly created routes are automatically assigned to all roles with `allowNewMenu=true` (admin and member by default).

---

## 3. UI Schema API

Resource name: `uiSchemas`

> Core source:
> - Actions: `<nocobase-source>/packages/plugins/@nocobase/plugin-ui-schema-storage/src/server/actions/ui-schema-action.ts`
> - Repository: `<nocobase-source>/packages/plugins/@nocobase/plugin-ui-schema-storage/src/server/repository.ts`

### 3.1 Get Schema

```bash
# Get the full JSON Schema tree (excluding async child nodes)
GET /api/uiSchemas:getJsonSchema/<x-uid>

# Get the full JSON Schema tree (including async child nodes)
GET /api/uiSchemas:getJsonSchema/<x-uid>?includeAsyncNode=true

# Get only direct child properties (no async recursion)
GET /api/uiSchemas:getProperties/<x-uid>

# Get the parent node's Schema
GET /api/uiSchemas:getParentJsonSchema/<x-uid>
```

**`x-async` explanation**:
- Nodes marked with `x-async: true` are not expanded by default in `getJsonSchema`
- This is used for on-demand loading of page Tabs: Tab Grids under the page root node are all async
- Adding `includeAsyncNode=true` retrieves the full tree

### 3.2 Insert Schema (Root Node)

```bash
POST /api/uiSchemas:insert
Content-Type: application/json

{
  "x-uid": "n1",
  "name": "a",
  "type": "object",
  "properties": {
    "b": {
      "x-uid": "n2",
      "type": "object",
      "properties": {
        "c": { "x-uid": "n3" }
      }
    },
    "d": { "x-uid": "n4" }
  }
}
```

> This decomposes the entire tree into individual nodes, inserting each into both the `uiSchemas` table and the `uiSchemaTreePath` closure table.

### 3.3 insertAdjacent (Core API)

**This is the core method for adding blocks to an existing page.**

```bash
POST /api/uiSchemas:insertAdjacent/<target-x-uid>?position=<position>
Content-Type: application/json

{
  "schema": { ... },
  "wrap": null
}
```

**Four positions**:

| position | Meaning | Method |
|----------|---------|--------|
| `beforeBegin` | Insert **before** the target node (sibling) | `insertBeside(target, schema, 'before')` |
| `afterBegin` | Insert at the **beginning** inside the target node (child) | `insertInner(target, schema, 'first')` |
| `beforeEnd` | Insert at the **end** inside the target node (child) | `insertInner(target, schema, 'last')` |
| `afterEnd` | Insert **after** the target node (sibling) | `insertBeside(target, schema, 'after')` |

**Visual representation**:
```
<target-node>          ← beforeBegin goes here
  <first-child>        ← afterBegin goes here
  ...
  <last-child>         ← beforeEnd goes here
</target-node>         ← afterEnd goes here
```

**wrap parameter**:

The `wrap` parameter wraps the schema before insertion. For example, when adding a block to a page, it needs to be wrapped in `Grid.Row > Grid.Col`:

```json
{
  "schema": { "the actual block schema" },
  "wrap": {
    "type": "void",
    "x-component": "Grid.Row",
    "properties": {
      "col-uid": {
        "type": "void",
        "x-component": "Grid.Col"
      }
    }
  }
}
```

**Shortcut actions** (fixed position):

```bash
POST /api/uiSchemas:insertBeforeBegin/<target-x-uid>
POST /api/uiSchemas:insertAfterBegin/<target-x-uid>
POST /api/uiSchemas:insertBeforeEnd/<target-x-uid>
POST /api/uiSchemas:insertAfterEnd/<target-x-uid>
```

**Additional parameters**:
- `removeParentsIfNoChildren` — When moving, delete the source parent node if it has no children left
- `breakRemoveOn` — Stop recursive deletion when a node matching the condition is encountered

> Source: Repository's `insertAdjacent` method:
> `<nocobase-source>/packages/plugins/@nocobase/plugin-ui-schema-storage/src/server/repository.ts` line 474

### 3.4 patch (Update Schema)

```bash
POST /api/uiSchemas:patch
Content-Type: application/json

{
  "x-uid": "n1",
  "x-component-props": {
    "title": "New Title"
  }
}
```

If `properties` are included, it recursively traverses and updates each child node (matched by existing `x-uid`):

```json
{
  "x-uid": "n1",
  "properties": {
    "b": {
      "properties": {
        "c": { "title": "c-title" }
      }
    }
  }
}
```

### 3.5 remove (Delete Schema)

```bash
POST /api/uiSchemas:remove/<x-uid>
```

Deletes the specified node and all its descendant nodes.

### 3.6 batchPatch (Batch Update)

```bash
POST /api/uiSchemas:batchPatch
Content-Type: application/json

[
  { "x-uid": "uid1", "title": "new title 1" },
  { "x-uid": "uid2", "x-component-props": { "style": {} } }
]
```

### 3.7 HTTP Request Format Summary

Actual request formats used by the frontend:

```typescript
// insertAdjacent
await api.request({
  url: `/uiSchemas:insertAdjacent/${current['x-uid']}?position=${position}`,
  method: 'post',
  data: {
    schema: schema,
    wrap: wrapSchema,  // optional
  },
});

// patch
await api.request({
  url: `/uiSchemas:patch`,
  method: 'post',
  data: schema,  // pass the schema object directly
});

// remove
await api.request({
  url: `/uiSchemas:remove/${uid}`,
  method: 'post',
});
```

> Source: `<nocobase-source>/packages/core/client/src/schema-component/hooks/useDesignable.tsx` line 186

---

## 4. Page Schema Structure

### 4.1 Full Page Hierarchy

```
Page (x-component: "Page", x-uid: pageSchemaUid)
  └── Tab Grid (x-component: "Grid", x-async: true, x-uid: tabSchemaUid)
        └── Grid.Row (x-component: "Grid.Row")
              └── Grid.Col (x-component: "Grid.Col")
                    └── Block (block wrapped in CardItem/BlockItem)
                          └── ... block internal structure
```

### 4.2 gridRowColWrap Wrapping

When adding a block to a page, it needs to be wrapped in `Grid.Row > Grid.Col`:

```typescript
// This wrap function is called automatically on the frontend
const gridRowColWrap = (schema) => {
  return {
    type: 'void',
    'x-component': 'Grid.Row',
    properties: {
      [uid()]: {
        type: 'void',
        'x-component': 'Grid.Col',
        properties: {
          [schema?.name || uid()]: schema,
        },
      },
    },
  };
};
```

> Source: `<nocobase-source>/packages/core/client/src/schema-initializer/utils.ts` line 44

### 4.3 Full Workflow for Adding a Block to a Page

Assuming the Tab Grid's `x-uid` is `tab-uid-xxx`:

```bash
POST /api/uiSchemas:insertAdjacent/tab-uid-xxx?position=beforeEnd
Content-Type: application/json

{
  "schema": {
    "type": "void",
    "x-decorator": "TableBlockProvider",
    "x-acl-action": "customers:list",
    "x-use-decorator-props": "useTableBlockDecoratorProps",
    "x-decorator-props": {
      "collection": "customers",
      "dataSource": "main",
      "action": "list",
      "params": { "pageSize": 20 },
      "showIndex": true,
      "dragSort": false
    },
    "x-toolbar": "BlockSchemaToolbar",
    "x-settings": "blockSettings:table",
    "x-component": "CardItem",
    "x-filter-targets": [],
    "properties": {
      "actions": {
        "type": "void",
        "x-initializer": "table:configureActions",
        "x-component": "ActionBar",
        "x-component-props": {
          "style": { "marginBottom": "var(--nb-spacing)" }
        },
        "properties": {}
      },
      "table": {
        "type": "array",
        "x-initializer": "table:configureColumns",
        "x-component": "TableV2",
        "x-use-component-props": "useTableBlockProps",
        "x-component-props": {
          "rowKey": "id",
          "rowSelection": { "type": "checkbox" }
        },
        "properties": {
          "actions": {
            "type": "void",
            "title": "{{ t(\"Actions\") }}",
            "x-action-column": "actions",
            "x-decorator": "TableV2.Column.ActionBar",
            "x-component": "TableV2.Column",
            "x-toolbar": "TableColumnSchemaToolbar",
            "x-initializer": "table:configureItemActions",
            "x-settings": "fieldSettings:TableColumn",
            "x-toolbar-props": { "initializer": "table:configureItemActions" },
            "properties": {
              "action-space": {
                "type": "void",
                "x-decorator": "DndContext",
                "x-component": "Space",
                "x-component-props": { "split": "|" }
              }
            }
          }
        }
      }
    }
  },
  "wrap": {
    "type": "void",
    "x-component": "Grid.Row",
    "properties": {
      "col": {
        "type": "void",
        "x-component": "Grid.Col"
      }
    }
  }
}
```

---

## 5. Block Schema Reference

### 5.1 Table Block

```typescript
{
  type: 'void',
  'x-decorator': 'TableBlockProvider',
  'x-acl-action': `${collectionName}:list`,
  'x-use-decorator-props': 'useTableBlockDecoratorProps',
  'x-decorator-props': {
    collection: collectionName,    // Collection name
    dataSource: 'main',            // Data source (fixed 'main')
    association: undefined,        // Association name (e.g. 'orders.items'), mutually exclusive
    action: 'list',
    params: { pageSize: 20 },
    showIndex: true,
    dragSort: false,
  },
  'x-toolbar': 'BlockSchemaToolbar',
  'x-settings': 'blockSettings:table',
  'x-component': 'CardItem',
  'x-filter-targets': [],
  properties: {
    actions: { /* ActionBar */ },
    [uid]: {
      type: 'array',
      'x-initializer': 'table:configureColumns',
      'x-component': 'TableV2',
      'x-use-component-props': 'useTableBlockProps',
      'x-component-props': {
        rowKey: 'id',
        rowSelection: { type: 'checkbox' },
      },
      properties: {
        actions: { /* TableV2.Column for actions */ },
      },
    },
  },
}
```

> Source: `<nocobase-source>/packages/core/client/src/modules/blocks/data-blocks/table/createTableBlockUISchema.ts`

### 5.2 Create Form Block

```typescript
{
  type: 'void',
  'x-acl-action-props': { skipScopeCheck: true },
  'x-acl-action': `${collectionName}:create`,
  'x-decorator': 'FormBlockProvider',
  'x-use-decorator-props': 'useCreateFormBlockDecoratorProps',
  'x-decorator-props': {
    dataSource: 'main',
    collection: collectionName,
  },
  'x-toolbar': 'BlockSchemaToolbar',
  'x-settings': 'blockSettings:createForm',
  'x-component': 'CardItem',
  properties: {
    [uid]: {
      type: 'void',
      'x-component': 'FormV2',
      'x-use-component-props': 'useCreateFormBlockProps',
      properties: {
        grid: {
          type: 'void',
          'x-component': 'Grid',
          'x-initializer': 'form:configureFields',
          properties: {},
        },
        [uid]: {
          type: 'void',
          'x-initializer': 'createForm:configureActions',
          'x-component': 'ActionBar',
          'x-component-props': { layout: 'one-column' },
        },
      },
    },
  },
}
```

> Source: `<nocobase-source>/packages/core/client/src/modules/blocks/data-blocks/form/createCreateFormBlockUISchema.ts`

### 5.3 Edit Form Block

```typescript
{
  type: 'void',
  'x-acl-action-props': { skipScopeCheck: false },
  'x-acl-action': `${collectionName}:update`,
  'x-decorator': 'FormBlockProvider',
  'x-use-decorator-props': 'useEditFormBlockDecoratorProps',
  'x-decorator-props': {
    action: 'get',
    dataSource: 'main',
    collection: collectionName,
  },
  'x-toolbar': 'BlockSchemaToolbar',
  'x-settings': 'blockSettings:editForm',
  'x-component': 'CardItem',
  properties: {
    [uid]: {
      type: 'void',
      'x-component': 'FormV2',
      'x-use-component-props': 'useEditFormBlockProps',
      properties: {
        grid: {
          type: 'void',
          'x-component': 'Grid',
          'x-initializer': 'form:configureFields',
          properties: {},
        },
        [uid]: {
          type: 'void',
          'x-initializer': 'editForm:configureActions',
          'x-component': 'ActionBar',
          'x-component-props': { layout: 'one-column' },
        },
      },
    },
  },
}
```

> Source: `<nocobase-source>/packages/core/client/src/modules/blocks/data-blocks/form/createEditFormBlockUISchema.ts`

### 5.4 Detail Block (Single Record)

```typescript
{
  type: 'void',
  'x-acl-action': `${collectionName}:get`,
  'x-decorator': 'DetailsBlockProvider',
  'x-use-decorator-props': 'useDetailsDecoratorProps',
  'x-decorator-props': {
    dataSource: 'main',
    collection: collectionName,
    readPretty: true,
    action: 'get',
  },
  'x-toolbar': 'BlockSchemaToolbar',
  'x-settings': 'blockSettings:details',
  'x-component': 'CardItem',
  properties: {
    [uid]: {
      type: 'void',
      'x-component': 'Details',
      'x-read-pretty': true,
      'x-use-component-props': 'useDetailsProps',
      properties: {
        [uid]: {
          type: 'void',
          'x-initializer': 'details:configureActions',
          'x-component': 'ActionBar',
          'x-component-props': { style: { marginBottom: 24 } },
          properties: {},
        },
        grid: {
          type: 'void',
          'x-component': 'Grid',
          'x-initializer': 'details:configureFields',
          properties: {},
        },
      },
    },
  },
}
```

> Source: `<nocobase-source>/packages/core/client/src/modules/blocks/data-blocks/details-single/createDetailsUISchema.ts`

### 5.5 Detail Block (With Pagination)

```typescript
{
  type: 'void',
  'x-acl-action': `${collectionName}:view`,
  'x-decorator': 'DetailsBlockProvider',
  'x-use-decorator-props': 'useDetailsWithPaginationDecoratorProps',
  'x-decorator-props': {
    dataSource: 'main',
    collection: collectionName,
    readPretty: true,
    action: 'list',
    params: { pageSize: 1 },
  },
  'x-toolbar': 'BlockSchemaToolbar',
  'x-settings': 'blockSettings:detailsWithPagination',
  'x-component': 'CardItem',
  properties: {
    [uid]: {
      type: 'void',
      'x-component': 'Details',
      'x-read-pretty': true,
      'x-use-component-props': 'useDetailsWithPaginationProps',
      properties: {
        [uid]: { /* ActionBar */ },
        grid: { /* Grid for fields */ },
        pagination: {
          type: 'void',
          'x-component': 'Pagination',
          'x-use-component-props': 'useDetailsPaginationProps',
        },
      },
    },
  },
}
```

> Source: `<nocobase-source>/packages/core/client/src/modules/blocks/data-blocks/details-multi/createDetailsWithPaginationUISchema.ts`

### 5.6 List Block

```typescript
{
  type: 'void',
  'x-acl-action': `${collectionName}:view`,
  'x-decorator': 'List.Decorator',
  'x-use-decorator-props': 'useListBlockDecoratorProps',
  'x-decorator-props': {
    collection: collectionName,
    dataSource: 'main',
    readPretty: true,
    action: 'list',
    params: { pageSize: 10 },
    runWhenParamsChanged: true,
    rowKey: 'id',
  },
  'x-component': 'CardItem',
  'x-toolbar': 'BlockSchemaToolbar',
  'x-settings': 'blockSettings:list',
  properties: {
    actionBar: { /* ActionBar */ },
    list: {
      type: 'array',
      'x-component': 'List',
      'x-use-component-props': 'useListBlockProps',
      properties: {
        item: {
          type: 'object',
          'x-component': 'List.Item',
          'x-read-pretty': true,
          'x-use-component-props': 'useListItemProps',
          properties: {
            grid: { /* Grid for fields */ },
            actionBar: { /* item actions */ },
          },
        },
      },
    },
  },
}
```

> Source: `<nocobase-source>/packages/core/client/src/modules/blocks/data-blocks/list/createListBlockUISchema.ts`

### 5.7 Grid Card Block

```typescript
{
  type: 'void',
  'x-acl-action': `${collectionName}:view`,
  'x-decorator': 'GridCard.Decorator',
  'x-use-decorator-props': 'useGridCardBlockDecoratorProps',
  'x-decorator-props': {
    collection: collectionName,
    dataSource: 'main',
    readPretty: true,
    action: 'list',
    params: { pageSize: 12 },
    runWhenParamsChanged: true,
    rowKey: 'id',
  },
  'x-component': 'BlockItem',
  'x-use-component-props': 'useGridCardBlockItemProps',
  'x-toolbar': 'BlockSchemaToolbar',
  'x-settings': 'blockSettings:gridCard',
  // ... (similar structure to List)
}
```

> Source: `<nocobase-source>/packages/core/client/src/modules/blocks/data-blocks/grid-card/createGridCardBlockUISchema.ts`

### 5.8 Block Type Quick Reference

| Block | x-decorator | x-settings | action | x-component |
|-------|------------|------------|--------|-------------|
| Table | `TableBlockProvider` | `blockSettings:table` | `list` | `CardItem` |
| Create Form | `FormBlockProvider` | `blockSettings:createForm` | none | `CardItem` |
| Edit Form | `FormBlockProvider` | `blockSettings:editForm` | `get` | `CardItem` |
| Details (single) | `DetailsBlockProvider` | `blockSettings:details` | `get` | `CardItem` |
| Details (paginated) | `DetailsBlockProvider` | `blockSettings:detailsWithPagination` | `list` | `CardItem` |
| List | `List.Decorator` | `blockSettings:list` | `list` | `CardItem` |
| Grid Card | `GridCard.Decorator` | `blockSettings:gridCard` | `list` | `BlockItem` |

---

## 6. Field Schema Reference

### 6.1 Table Column Fields

Table columns require `TableV2.Column.Decorator` + `TableV2.Column` wrapping:

```typescript
// Outer layer: column container
{
  type: 'void',
  'x-decorator': 'TableV2.Column.Decorator',
  'x-toolbar': 'TableColumnSchemaToolbar',
  'x-settings': 'fieldSettings:TableColumn',
  'x-component': 'TableV2.Column',
  properties: {
    // Inner layer: the field itself
    [fieldName]: {
      'x-collection-field': `${collectionName}.${fieldName}`,
      'x-component': 'CollectionField',
      'x-component-props': {},       // optional: ellipsis, etc.
      'x-read-pretty': true,
      'x-decorator': null,
      'x-decorator-props': {
        labelStyle: { display: 'none' },
      },
    },
  },
}
```

**Adding a table column**: Use `insertAdjacent` to insert at the `beforeEnd` position of the TableV2 node:

```bash
POST /api/uiSchemas:insertAdjacent/<tableV2-x-uid>?position=beforeEnd
Content-Type: application/json

{
  "schema": {
    "type": "void",
    "x-decorator": "TableV2.Column.Decorator",
    "x-toolbar": "TableColumnSchemaToolbar",
    "x-settings": "fieldSettings:TableColumn",
    "x-component": "TableV2.Column",
    "properties": {
      "nickname": {
        "x-collection-field": "users.nickname",
        "x-component": "CollectionField",
        "x-component-props": { "ellipsis": true },
        "x-read-pretty": true,
        "x-decorator": null,
        "x-decorator-props": {
          "labelStyle": { "display": "none" }
        }
      }
    }
  }
}
```

> Source: wrap function in `<nocobase-source>/packages/core/client/src/modules/blocks/data-blocks/table/TableColumnInitializers.tsx`

### 6.2 Form Fields

Form fields require `Grid.Row > Grid.Col > FormItem` wrapping:

```typescript
// The field schema itself
{
  type: 'string',
  name: fieldName,
  'x-toolbar': 'FormItemSchemaToolbar',
  'x-settings': 'fieldSettings:FormItem',
  'x-component': 'CollectionField',
  'x-decorator': 'FormItem',
  'x-collection-field': `${collectionName}.${fieldName}`,
  'x-component-props': {},
}
```

**Adding a form field**: Use `insertAdjacent` to insert at the `beforeEnd` position of the Grid node inside the form, wrapped with `Grid.Row > Grid.Col`:

```bash
POST /api/uiSchemas:insertAdjacent/<form-grid-x-uid>?position=beforeEnd
Content-Type: application/json

{
  "schema": {
    "type": "string",
    "name": "nickname",
    "x-toolbar": "FormItemSchemaToolbar",
    "x-settings": "fieldSettings:FormItem",
    "x-component": "CollectionField",
    "x-decorator": "FormItem",
    "x-collection-field": "users.nickname",
    "x-component-props": {}
  },
  "wrap": {
    "type": "void",
    "x-component": "Grid.Row",
    "properties": {
      "col": {
        "type": "void",
        "x-component": "Grid.Col"
      }
    }
  }
}
```

### 6.3 Detail Fields

Same structure as form fields, but with `x-read-pretty: true`:

```typescript
{
  type: 'string',
  name: fieldName,
  'x-toolbar': 'FormItemSchemaToolbar',
  'x-settings': 'fieldSettings:FormItem',
  'x-component': 'CollectionField',
  'x-decorator': 'FormItem',
  'x-collection-field': `${collectionName}.${fieldName}`,
  'x-read-pretty': true,
  'x-component-props': {},
}
```

### 6.4 `x-collection-field` Format

```
<collectionName>.<fieldName>

Examples:
- "users.nickname"          — nickname field of the users table
- "users.roles"             — roles association field of the users table
- "orders.customer.name"    — name via customer association on the orders table (nested association field)
```

This property tells the `CollectionField` component which collection and field to fetch the schema definition from (interface, uiSchema, etc.), so it can automatically render the appropriate input/display component.

---

## 7. How Blocks Reference Collections

### 7.1 Core Mechanism: `x-decorator-props`

Every data block specifies its data source via `x-decorator-props`:

```typescript
'x-decorator-props': {
  collection: 'customers',   // Collection name
  dataSource: 'main',        // Data source key (default 'main')
  association: undefined,     // Or 'orders.items' (association block)
  action: 'list',            // Data loading action
  params: {                  // Request parameters
    pageSize: 20,
    filter: {},
    sort: [],
  },
}
```

### 7.2 collection vs association

- **collection mode**: Directly specify the collection name, e.g. `collection: 'customers'`
- **association mode**: Specify the association path, e.g. `association: 'orders.items'` (items association of the orders table)
- These are mutually exclusive — setting association means you don't need to set collection

### 7.3 x-acl-action

Property controlling permission checks:

```typescript
'x-acl-action': 'customers:list'     // Table: requires list permission
'x-acl-action': 'customers:create'   // Create form: requires create permission
'x-acl-action': 'customers:update'   // Edit form: requires update permission
'x-acl-action': 'customers:get'      // Details: requires get permission
'x-acl-action': 'customers:view'     // List/Card: requires view permission
```

---

## 8. Hands-on: Building a Complete Page

### Scenario: Create a "Customer Management" page with a customer table

```bash
# === Step 1: Generate UIDs ===
# Generate one each for pageSchemaUid, tabSchemaUid, tabSchemaName, menuSchemaUid

# === Step 2: Create route ===
POST /api/desktopRoutes:create
{
  "type": "page",
  "title": "Customer Management",
  "icon": "TeamOutlined",
  "schemaUid": "<pageSchemaUid>",
  "menuSchemaUid": "<menuSchemaUid>",
  "enableTabs": false,
  "children": [{
    "type": "tabs",
    "schemaUid": "<tabSchemaUid>",
    "tabSchemaName": "<tabSchemaName>",
    "hidden": true
  }]
}

# === Step 3: Insert page Schema ===
POST /api/uiSchemas:insert
{
  "type": "void",
  "x-component": "Page",
  "x-uid": "<pageSchemaUid>",
  "properties": {
    "<tabSchemaName>": {
      "type": "void",
      "x-component": "Grid",
      "x-initializer": "page:addBlock",
      "x-uid": "<tabSchemaUid>",
      "x-async": true,
      "properties": {}
    }
  }
}

# === Step 4: Add table block to page ===
POST /api/uiSchemas:insertAdjacent/<tabSchemaUid>?position=beforeEnd
{
  "schema": {
    "type": "void",
    "x-decorator": "TableBlockProvider",
    "x-acl-action": "customers:list",
    "x-use-decorator-props": "useTableBlockDecoratorProps",
    "x-decorator-props": {
      "collection": "customers",
      "dataSource": "main",
      "action": "list",
      "params": { "pageSize": 20 },
      "showIndex": true,
      "dragSort": false
    },
    "x-toolbar": "BlockSchemaToolbar",
    "x-settings": "blockSettings:table",
    "x-component": "CardItem",
    "x-filter-targets": [],
    "properties": {
      "actions": {
        "type": "void",
        "x-initializer": "table:configureActions",
        "x-component": "ActionBar",
        "x-component-props": {
          "style": { "marginBottom": "var(--nb-spacing)" }
        },
        "properties": {}
      },
      "table": {
        "type": "array",
        "x-initializer": "table:configureColumns",
        "x-component": "TableV2",
        "x-use-component-props": "useTableBlockProps",
        "x-component-props": {
          "rowKey": "id",
          "rowSelection": { "type": "checkbox" }
        },
        "properties": {
          "actions": {
            "type": "void",
            "title": "{{ t(\"Actions\") }}",
            "x-action-column": "actions",
            "x-decorator": "TableV2.Column.ActionBar",
            "x-component": "TableV2.Column",
            "x-toolbar": "TableColumnSchemaToolbar",
            "x-initializer": "table:configureItemActions",
            "x-settings": "fieldSettings:TableColumn",
            "x-toolbar-props": { "initializer": "table:configureItemActions" },
            "properties": {
              "space": {
                "type": "void",
                "x-decorator": "DndContext",
                "x-component": "Space",
                "x-component-props": { "split": "|" }
              }
            }
          }
        }
      }
    }
  },
  "wrap": {
    "type": "void",
    "x-component": "Grid.Row",
    "properties": {
      "col": {
        "type": "void",
        "x-component": "Grid.Col"
      }
    }
  }
}

# === Step 5: Add table columns (e.g. name field) ===
# First get the table node's x-uid via getJsonSchema
# Then insertAdjacent into the table node
POST /api/uiSchemas:insertAdjacent/<table-x-uid>?position=beforeEnd
{
  "schema": {
    "type": "void",
    "x-decorator": "TableV2.Column.Decorator",
    "x-toolbar": "TableColumnSchemaToolbar",
    "x-settings": "fieldSettings:TableColumn",
    "x-component": "TableV2.Column",
    "properties": {
      "name": {
        "x-collection-field": "customers.name",
        "x-component": "CollectionField",
        "x-component-props": { "ellipsis": true },
        "x-read-pretty": true,
        "x-decorator": null,
        "x-decorator-props": {
          "labelStyle": { "display": "none" }
        }
      }
    }
  }
}
```

---

## 9. Initializer Reference (Frontend "Add" Buttons)

The following `x-initializer` identifiers are used by each block type, controlling what kind of "Add" buttons the frontend displays:

| x-initializer | Description |
|----------------|-------------|
| `page:addBlock` | Add block to page |
| `table:configureActions` | Table top action bar |
| `table:configureColumns` | Table column configuration |
| `table:configureItemActions` | Table row action configuration |
| `form:configureFields` | Form field configuration |
| `createForm:configureActions` | Create form action bar |
| `editForm:configureActions` | Edit form action bar |
| `details:configureActions` | Details action bar |
| `details:configureFields` | Details field configuration |
| `list:configureActions` | List top action bar |
| `list:configureItemActions` | List item action configuration |
| `gridCard:configureActions` | Grid card top actions |
| `gridCard:configureItemActions` | Grid card item actions |

---

## 10. How to Read the Current Page Structure

### 10.1 From Route to Schema

```bash
# 1. Get the route list and find the target page
GET /api/desktopRoutes:list?tree=true&sort=sort

# Find the target page's schemaUid from the results
# e.g. { "title": "Customer Management", "schemaUid": "abc123", ... }

# 2. Get the page Schema
GET /api/uiSchemas:getJsonSchema/abc123?includeAsyncNode=true

# 3. Get the Tab's child properties (list of blocks)
# Find the Tab Grid's x-uid from the previous step's results
GET /api/uiSchemas:getProperties/tab-uid-xxx
```

### 10.2 Direct Database Query

```sql
-- Query route tree
SELECT id, title, type, "schemaUid", "menuSchemaUid", "parentId"
FROM "desktopRoutes"
ORDER BY sort
LIMIT 30;

-- Query a specific page's Schema (overview)
SELECT "x-uid", name, substring("schema"::text, 1, 200) as schema_preview
FROM "uiSchemas"
WHERE "x-uid" IN (
  SELECT "schemaUid" FROM "desktopRoutes" WHERE title = 'Customer Management'
);

-- Query all child nodes of a Schema node
SELECT tp.descendant, tp.depth, tp.type, tp.sort, s.name,
       substring(s."schema"::text, 1, 150) as schema_preview
FROM "uiSchemaTreePath" tp
LEFT JOIN "uiSchemas" s ON s."x-uid" = tp.descendant
WHERE tp.ancestor = '<target-x-uid>'
ORDER BY tp.depth, tp.sort;
```

---

## Related Documents

- [Page Building Standard Workflow](/300000-projects/300008-nocobase-builder/02-page-building/usage/) — Day-to-day operations entry point, read this first
- [Page Inspection Tool Reference](/300000-projects/300008-nocobase-builder/02-page-building/inspect-reference/) — nb_inspect_page: convert low-code pages to readable structure views
- [JS Block Reference Manual](/300000-projects/300008-nocobase-builder/02-page-building/js-blocks-reference/) — ctx API, common patterns, AM system code listing
- [FlowPage Structure Deep Dive](/300000-projects/300008-nocobase-builder/02-page-building/research-notes/) — CRM v3 / Ticket V2 field-tested analysis
- [NocoBase Builder Toolkit](/300000-projects/300008-nocobase-builder/) — Four-module overview
- [Data Modeling API Principles](/300000-projects/300008-nocobase-builder/01-data-modeling/) — Collection API (prerequisite for page building)
- [NocoBase MCP Requirements Spec](/200000-guides/nocobase-3-vision/mcp-requirements/) — Long-term MCP product plan
- [NocoBase Resource Map](/200000-guides/nocobase-resources/) — All NocoBase resource entry points
