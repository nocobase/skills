# Resource API

> Read when performing data operations (CRUD, pagination, filtering) on NocoBase collections.

Both classes are imported from `@nocobase/flow-engine`.

## MultiRecordResource

For lists, tables, kanban boards -- any multi-record scenario.

### Data Operations

```ts
const resource = ctx.blockModel?.resource as MultiRecordResource;

// READ
const items = resource.getData();          // TDataItem[] (default [])
const hasData = resource.hasData();        // boolean
const item = await resource.get(1);        // get by primary key

// CREATE
await resource.create({ title: 'New', completed: false });
await resource.create(data, { refresh: false }); // skip auto-refresh

// UPDATE
await resource.update(1, { title: 'Updated' });

// DELETE
await resource.destroy(1);                // single
await resource.destroy([1, 2, 3]);        // batch
await resource.destroySelectedRows();     // delete all selected rows

// REFRESH
await resource.refresh();                 // re-fetch data (calls list action)
```

### Pagination

```ts
resource.getPage();          // current page number
resource.setPage(2);         // set page
resource.getPageSize();      // items per page (default 20)
resource.setPageSize(50);    // set page size
resource.getCount();         // total record count
resource.getTotalPage();     // total page count

await resource.next();       // next page + refresh
await resource.previous();   // previous page + refresh
await resource.goto(3);      // jump to page + refresh
```

### Row Selection

```ts
resource.setSelectedRows(rows);   // set selected rows
resource.getSelectedRows();       // get selected rows
```

### Usage in CollectionBlockModel

```tsx
import { BlockSceneEnum, CollectionBlockModel } from '@nocobase/client-v2';
import { MultiRecordResource } from '@nocobase/flow-engine';

export class MyListBlock extends CollectionBlockModel {
  static scene = BlockSceneEnum.many;

  createResource() {
    return this.context.makeResource(MultiRecordResource);
  }

  get resource() {
    return this.context.resource as MultiRecordResource;
  }

  renderComponent() {
    const data = this.resource.getData();
    return <ul>{data.map((item: any) => <li key={item.id}>{item.title}</li>)}</ul>;
  }
}
```

## SingleRecordResource

For forms, detail pages -- any single-record scenario.

### Data Operations

```ts
const resource = ctx.model.context.resource as SingleRecordResource;

// READ
const data = resource.getData();     // TData (single object, default null)

// SMART SAVE (create if new, update if existing)
resource.isNewRecord = true;
await resource.save({ name: 'John', age: 30 });   // calls create action

resource.setFilterByTk(1);           // auto-sets isNewRecord = false
await resource.refresh();            // load existing data (calls get action)
await resource.save({ name: 'Jane' });  // calls update action

// DELETE
await resource.destroy();            // uses current filterByTk

// REFRESH
await resource.refresh();            // re-fetch (skipped if isNewRecord)
```

### Key Properties

| Property | Description |
|---|---|
| `isNewRecord` | `true` = save() calls create; `false` = save() calls update |
| `setFilterByTk(id)` | Sets primary key filter AND sets `isNewRecord = false` |

### Usage in CollectionBlockModel

```tsx
import { BlockSceneEnum, CollectionBlockModel } from '@nocobase/client-v2';
import { SingleRecordResource } from '@nocobase/flow-engine';

export class MyDetailBlock extends CollectionBlockModel {
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
    return <div><h3>{data.title}</h3><p>{data.content}</p></div>;
  }
}
```

## Common Methods (Both Resources)

### Filtering

```ts
// Direct filter
resource.setFilter({ status: { $eq: 'active' } });

// Named filter groups (recommended -- composable and removable)
resource.addFilterGroup('status', { status: { $eq: 'active' } });
resource.addFilterGroup('age', { age: { $gt: 18 } });
// getFilter() auto-aggregates: { $and: [...] }

resource.removeFilterGroup('status');
await resource.refresh();  // apply filter changes
```

### Filter Syntax

```ts
{ status: { $eq: 'active' } }       // equals
{ status: { $ne: 'deleted' } }      // not equals
{ age: { $gt: 18 } }                // greater than
{ age: { $gte: 18 } }               // greater than or equal
{ age: { $lt: 65 } }                // less than
{ name: { $includes: 'test' } }     // contains (fuzzy match)
{ $and: [{ ... }, { ... }] }        // AND
{ $or: [{ ... }, { ... }] }         // OR
```

### Field & Sort Control

```ts
resource.setFields(['id', 'title', 'status']);         // select fields
resource.setAppends(['author', 'tags']);                // include relations
resource.addAppends(['comments']);                      // append more relations (deduplicated)
resource.setSort(['-createdAt', 'name']);               // sort (- prefix = descending)
resource.setFilterByTk(1);                             // filter by primary key
```

### Resource Configuration

```ts
resource.setResourceName('users');            // resource name
resource.setResourceName('users.tags');       // association resource
resource.setSourceId(1);                      // parent record ID for associations
resource.setDataSourceKey('secondary');       // data source (adds X-Data-Source header)
```

### Metadata & State

```ts
resource.loading;              // boolean -- is loading
resource.getMeta();            // full metadata object
resource.getMeta('totalCount');// specific meta key
resource.getError();           // error info
resource.clearError();         // clear error
```

### Events

```ts
resource.on('refresh', (data) => {
  console.log('Data refreshed:', data);
});

resource.on('saved', (data) => {
  console.log('Record saved:', data);
});
```

## Comparison

| Feature | MultiRecordResource | SingleRecordResource |
|---|---|---|
| `getData()` returns | `TDataItem[]` (array) | `TData` (object or null) |
| Default refresh action | `list` | `get` |
| Pagination | Yes | No |
| Row selection | Yes | No |
| Create | `create(data)` | `save(data)` + `isNewRecord=true` |
| Update | `update(filterByTk, data)` | `save(data)` + `setFilterByTk(id)` |
| Delete | `destroy(filterByTk)` | `destroy()` |

## Deep Reference

- https://pr-8998.v2.docs.nocobase.com/cn/api/flow-engine/resource.md

## Related

- [./block.md](./block.md) -- createResource() in CollectionBlockModel
- [./action.md](./action.md) -- using resource in action handlers
- [./ctx.md](./ctx.md) -- ctx.makeResource(), ctx.blockModel.resource
- [../server/resource-manager.md](../server/resource-manager.md) -- server-side resource definitions
