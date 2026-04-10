# Block Models

> Read when creating custom blocks (display areas on pages like tables, cards, charts, etc.).

## Base Class Hierarchy

```
BlockModel              -- Static UI, no data source
  └─ DataBlockModel     -- Grouped under "Data Blocks" menu (empty body, classification only)
       └─ CollectionBlockModel  -- Bound to a NocoBase collection, auto data fetching
            └─ TableBlockModel  -- Full table with columns, pagination, actions, sorting
```

**Quick decision:**
- Static content (HTML, markdown, custom widget) -> `BlockModel`
- Custom data rendering bound to a collection -> `CollectionBlockModel`
- Standard table with built-in column/action/pagination support -> `TableBlockModel`

## Template: BlockModel (Static UI)

```tsx
// models/SimpleBlockModel.tsx
import React from 'react';
import { BlockModel } from '@nocobase/client-v2';
import { tExpr } from '../locale';

export class SimpleBlockModel extends BlockModel {
  renderComponent() {
    return <div dangerouslySetInnerHTML={{ __html: this.props.html }} />;
  }
}

SimpleBlockModel.define({
  label: tExpr('Simple block'),
});

SimpleBlockModel.registerFlow({
  key: 'simpleBlockSettings',
  title: tExpr('Simple block settings'),
  on: 'beforeRender',
  steps: {
    editHtml: {
      title: tExpr('Edit HTML Content'),
      uiSchema: {
        html: {
          type: 'string',
          title: tExpr('HTML Content'),
          'x-decorator': 'FormItem',
          'x-component': 'Input.TextArea',
        },
      },
      defaultParams: {
        html: '<h3>Hello</h3><p>Edit this content.</p>',
      },
      handler(ctx, params) {
        ctx.model.props.html = params.html;
      },
    },
  },
});
```

## Template: CollectionBlockModel (Custom Data Rendering)

```tsx
// models/ManyRecordBlockModel.tsx
import React from 'react';
import { BlockSceneEnum, CollectionBlockModel } from '@nocobase/client-v2';
import { MultiRecordResource } from '@nocobase/flow-engine';
import { tExpr } from '../locale';

export class ManyRecordBlockModel extends CollectionBlockModel {
  static scene = BlockSceneEnum.many;

  createResource() {
    return this.context.makeResource(MultiRecordResource);
  }

  get resource() {
    return this.context.resource as MultiRecordResource;
  }

  renderComponent() {
    const data = this.resource.getData();
    const count = this.resource.getCount();

    return (
      <div>
        <h3>Total: {count} records (Page {this.resource.getPage()})</h3>
        <ul>
          {data.map((item: any) => (
            <li key={item.id}>{item.title}</li>
          ))}
        </ul>
      </div>
    );
  }
}

ManyRecordBlockModel.define({
  label: tExpr('Card list'),
});
```

## Template: TableBlockModel (Full Table)

```tsx
// models/TodoBlockModel.tsx
import { TableBlockModel } from '@nocobase/client-v2';
import { tExpr } from '../locale';

export class TodoBlockModel extends TableBlockModel {
  // Restrict to a specific collection
  static filterCollection(collection) {
    return collection.name === 'todoItems';
  }
}

TodoBlockModel.define({
  label: tExpr('Todo block'),
});
```

`TableBlockModel` inherits everything from `CollectionBlockModel` and adds: column rendering, action toolbar, pagination controls, sorting, row selection. Use `filterCollection` to restrict which data tables this block appears for.

## Template: SingleRecordResource Block (Detail/Form)

```tsx
// models/DetailBlockModel.tsx
import React from 'react';
import { BlockSceneEnum, CollectionBlockModel } from '@nocobase/client-v2';
import { SingleRecordResource } from '@nocobase/flow-engine';
import { tExpr } from '../locale';

export class DetailBlockModel extends CollectionBlockModel {
  static scene = BlockSceneEnum.one;

  createResource() {
    return this.context.makeResource(SingleRecordResource);
  }

  get resource() {
    return this.context.resource as SingleRecordResource;
  }

  renderComponent() {
    const data = this.resource.getData();
    if (!data) return <div>Loading...</div>;
    return (
      <div>
        <h3>{data.title}</h3>
        <p>{data.content}</p>
      </div>
    );
  }
}

DetailBlockModel.define({
  label: tExpr('Detail block'),
});
```

## Registration in Plugin

```ts
// plugin.tsx
this.flowEngine.registerModelLoaders({
  SimpleBlockModel: {
    loader: () => import('./models/SimpleBlockModel'),
  },
  ManyRecordBlockModel: {
    loader: () => import('./models/ManyRecordBlockModel'),
  },
  TodoBlockModel: {
    loader: () => import('./models/TodoBlockModel'),
  },
});
```

## define() Parameters

| Parameter | Type | Description |
|---|---|---|
| `label` | `string \| ReactNode` | Display name in "Add Block" menu. Use `tExpr()` for i18n |
| `icon` | `ReactNode` | Menu icon |
| `sort` | `number` | Sort order (lower = higher). Default `0` |
| `hide` | `boolean \| (ctx) => boolean` | Hide from menu. Supports dynamic condition |
| `group` | `string` | Group identifier for menu categorization |

## Key Points

- `renderComponent()` is the render method (like React's render). Access data via `this.props` (BlockModel) or `this.resource.getData()` (CollectionBlockModel).
- `createResource()` is required in CollectionBlockModel -- return `this.context.makeResource(MultiRecordResource)` or `SingleRecordResource`.
- `static scene` on CollectionBlockModel: `BlockSceneEnum.many` for lists, `BlockSceneEnum.one` for detail/form.
- `static filterCollection(collection)` limits which data tables the block appears for.
- Import `tExpr` from `../locale` (not from `@nocobase/flow-engine` directly).

## Deep Reference

- https://pr-8998.v2.docs.nocobase.com/cn/plugin-development/client/flow-engine/block.md

## Related

- [./flow.md](./flow.md) -- registerFlow for block configuration panels
- [./resource.md](./resource.md) -- MultiRecordResource / SingleRecordResource API
- [./action.md](./action.md) -- custom action buttons for blocks
- [./field.md](./field.md) -- custom field renderers in blocks
- [./plugin.md](./plugin.md) -- registering blocks in load()
- [./i18n.md](./i18n.md) -- tExpr for define() labels
