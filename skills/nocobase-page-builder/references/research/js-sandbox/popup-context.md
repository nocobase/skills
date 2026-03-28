---
title: JS Sandbox Popup Context
description: How JS Block accesses current record data inside a detail popup — ctx.getVar deep path API explained
tags: [nocobase, js-sandbox, popup, flow-engine, ctx]
type: guide
status: active
updated: "2026-03-25"
---

# JS Sandbox Popup Context

## Core Problem

Inside a detail popup (ChildPageModel), a JS Block's `ctx.record` cannot access the current record data.

## Root Cause

The tree structure inside the popup:

```
ChildPageModel (popup)
  └─ ChildPageTabModel (tab)
      └─ BlockGridModel (layout container)
          ├─ DetailsBlockModel   ← defines ctx.record
          └─ JSBlockModel        ← ctx.record is undefined!
```

- `DetailsBlockModel` calls `ctx.defineProperty('record', {get: () => this.getCurrentRecord()})` in its `onInit()`
- This property propagates to its **child nodes** (e.g., JSItemModel) via the **delegate chain**
- However, `JSBlockModel` and `DetailsBlockModel` are **siblings**, not parent-child
- The delegate chain only propagates downward to children, not across siblings

**Source locations**:
- `packages/core/flow-engine/src/flowContext.ts` L410-461 — proxy delegate chain implementation
- `packages/core/client/src/flow/models/blocks/details/DetailsBlockModel.tsx` L66-75 — record property definition
- `packages/core/flow-engine/src/views/createViewMeta.ts` L475-485 — popup property definition

---

## Correct Approach: await ctx.getVar() (must await!)

**`ctx.getVar()` returns a Promise — you must call it with `await`!** Without await, you get a Promise object, not the actual data.

### Option A: ctx.getVar with deep path to access fields directly (most recommended)

`ctx.getVar` supports **deep paths** with dot notation, traversing all the way to fields on associated records. When the path contains `.record`, it automatically triggers record loading and appends resolution.

```js
// ✅ Recommended: access association field directly — one line, no extra request
const phone = await ctx.getVar('ctx.popup.record.customer_name.phone_number');
// customer_name is an association field, phone_number is a field on the associated record

// ✅ Access current record field
const name = await ctx.getVar('ctx.popup.record.name');

// ✅ Get the full record object
const record = await ctx.getVar('ctx.popup.record');
// record.name, record.customer_name.phone_number, etc. are all populated

// ✅ Get resource info (without record data)
const popup = await ctx.getVar('ctx.popup');
// popup.resource.filterByTk, popup.resource.collectionName
```

### Option B: ctx.popup + ctx.request (fallback, requires an extra API call)

Use this only when `ctx.getVar` is unavailable or you need custom query parameters.

```js
// ⚠️ ctx.popup's record is undefined — only resource is available
const popup = await ctx.popup;
const recordId = popup?.resource?.filterByTk;
const collName = popup?.resource?.collectionName;

// Must make an extra request to fetch the record
const res = await ctx.request({
  url: collName + ':get',
  params: { filterByTk: recordId, appends: ['customer_name'] }
});
const record = res?.data?.data || {};
```

### Comparison

| Method | record available | Association fields | Extra request | Recommended |
|--------|:----------------:|:------------------:|:-------------:|:-----------:|
| `await ctx.getVar('ctx.popup.record.xxx')` | ✅ | ✅ automatic | None | **⭐ Preferred** |
| `await ctx.getVar('ctx.popup.record')` | ✅ | ✅ automatic | None | ⭐ |
| `await ctx.getVar('ctx.popup')` | ❌ | — | — | Only for resource |
| `await ctx.popup` + `ctx.request` | Manual fetch | Manual appends | 1 call | Fallback |
| `ctx.record` | ❌ | — | — | ❌ Not available in popups |

> **2026-03-25 key findings from testing**:
>
> The path resolution behavior of `ctx.getVar` depends on path depth:
> - `ctx.getVar('ctx.popup')` → returns `{ uid, resource, parent }`, **no record**
> - `ctx.getVar('ctx.popup.record')` → triggers record loading, returns the **full record object** (including association fields)
> - `ctx.getVar('ctx.popup.record.customer_name.phone_number')` → returns the association record's field value directly
>
> **Conclusion: the path must include `.record` to trigger record data loading.**

---

## ctx.popup Property Reference

| Property | Type | Description |
|----------|------|-------------|
| `popup.record` | object | ⚠️ Access via `ctx.getVar('ctx.popup.record')`; not available through `ctx.popup` directly |
| `popup.resource.filterByTk` | string/number | Record primary key ID |
| `popup.resource.collectionName` | string | Collection name |
| `popup.resource.dataSourceKey` | string | Data source (usually `"main"`) |
| `popup.resource.associationName` | string? | Association name (when opened from an association field) |
| `popup.resource.sourceId` | any? | Source record ID (association scenario) |
| `popup.uid` | string | Popup view UID |
| `popup.parent` | object? | Parent popup (nested popup scenario) |

---

## Record Access Methods by Scenario

| Scenario | Correct API | Notes |
|----------|-------------|-------|
| **JSColumn** (table column) | `ctx.record` | Directly available; contains the current row data |
| **JSItem** (DetailsBlock child node) | `ctx.record` | Inherited from DetailsBlockModel via delegate chain |
| **JSBlock** (page-level, not in popup) | `ctx.request()` to query manually | No built-in record context |
| **JSBlock** (inside popup) | `await ctx.getVar('ctx.popup.record')` | **ctx.record is not available! Must use getVar** |
| **FormJSFieldItem** (inside form) | `ctx.record` + `ctx.form` | Form record + form values |

---

## Practical Examples

### Access association fields inside a popup (recommended pattern)

```js
(async () => {
  // One line to get the phone number from an associated record
  const phone = await ctx.getVar('ctx.popup.record.customer_name.phone_number');
  const name = await ctx.getVar('ctx.popup.record.customer_name.customer_name');

  if (!phone) {
    ctx.render(<div style={{ color: '#999', padding: 16 }}>No phone number</div>);
    return;
  }

  const { Card } = ctx.antd;
  ctx.render(
    <Card size="small">
      <div>{name}</div>
      <a href={'tel:' + phone}>{phone}</a>
    </Card>
  );
})();
```

### Get the full record inside a popup (when multiple fields are needed)

```js
(async () => {
  const record = await ctx.getVar('ctx.popup.record');
  if (!record) {
    ctx.render(<div style={{ padding: 16, color: '#999' }}>No record data</div>);
    return;
  }

  const { Card, Tag, Space } = ctx.antd;
  const dept = record.department;

  ctx.render(
    <Card size="small" style={{ borderRadius: 8 }}>
      <Space>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{record.name || '-'}</span>
        <Tag color="green">{dept?.name || '-'}</Tag>
      </Space>
    </Card>
  );
})();
```

---

## Nested Popups

Popups can be nested (e.g., Employee Detail → Department Detail). Access the parent popup via deep paths in `ctx.getVar`:

```js
// Current popup record
const currentRecord = await ctx.getVar('ctx.popup.record');

// Parent popup record
const parentRecord = await ctx.getVar('ctx.popup.parent.record');
```

---

## Toolchain Support

The MCP tool `inject_js` has built-in validation: when it detects a JSBlockModel inside a popup whose code uses `ctx.record`, it issues a warning to switch to `ctx.getVar`.

The `auto_js` tool automatically adds comments to generated popup JS stubs:
```js
// Context: detail popup (record-aware)
// const record = await ctx.getVar('ctx.popup.record');
```

---

## Related Documents

- [JS Sandbox Home](/200000-guides/nocobase-js-sandbox/) — Full documentation index
- [Source Code Investigation Guide](/200000-guides/nocobase-js-sandbox/source-guide/) — How to verify API availability in source code
- [Programming Pitfalls Guide](/200000-guides/nocobase-js-sandbox/pitfalls/) — Other common errors
- [JS Block Reference](/300000-projects/300008-nocobase-builder/02-page-building/js-blocks-reference/) — JS patterns at the MCP tool level
