---
title: ctx.openView Popups & Parameter Passing
description: Complete guide to opening drawer/dialog popups via ctx.openView in JS Block, passing parameters with defineProperties, and page navigation with parameters
tags: [nocobase, js-sandbox, popup, openView, defineProperties, flow-engine, ctx]
type: guide
status: active
updated: "2026-03-26"
---

# ctx.openView Popups & Parameter Passing

## Overview

`ctx.openView` is used to programmatically open popups (drawer/dialog) from JS Block or chart events, and inject custom variables into the popup via `defineProperties`. This differs from the "passive" popups described in [Popup Context](./popup-context/) — here we are **actively** creating popups and passing parameters.

---

## Function Signature

```ts
ctx.openView(uid: string, options?: {
  mode?: 'drawer' | 'dialog' | 'embed',   // default: drawer
  size?: 'small' | 'medium' | 'large',     // default: medium
  title?: string,
  filterByTk?: any,                         // record primary key
  collectionName?: string,
  dataSourceKey?: string,
  associationName?: string,
  sourceId?: string,
  navigation?: boolean,                     // auto-set to false when defineProperties is present
  preventClose?: boolean,
  defineProperties?: Record<string, PropertyOptions>,
  defineMethods?: Record<string, Function>,
}): Promise<void>
```

**Source locations**:
- `packages/core/flow-engine/src/flowContext.ts` L3611-3690 — openView method definition
- `packages/core/client/src/flow/actions/openView.tsx` L201-459 — popup rendering + parameter injection

---

## Popup UID Naming

The UID must be stable (same across renders). Recommended: bind to `ctx.model.uid`:

```js
// ✅ Good: stable and semantically clear
const popupUid = ctx.model.uid + '-revenue-detail';

// ✅ Good: simple suffix
const popupUid = ctx.model.uid + '-1';

// ❌ Bad: hardcoded (not portable across environments)
const popupUid = 'abc123fixed';

// ❌ Bad: random value (creates a new popup each time)
const popupUid = Math.random().toString();
```

---

## defineProperties for Parameter Passing

### Method 1: Static value (recommended for simple cases)

```js
await ctx.openView(popupUid, {
  mode: 'drawer',
  title: 'Detail',
  defineProperties: {
    selectedStage: {
      value: 'Win',              // direct value
      meta: {                     // type metadata (makes the variable recognizable in the popup's variable selector)
        title: 'Selected Stage',
        type: 'string',
      },
    },
  },
});
// Access inside the popup via ctx.selectedStage → 'Win'
```

### Method 2: Getter function (dynamic values)

```js
await ctx.openView(popupUid, {
  mode: 'drawer',
  defineProperties: {
    onSaved: {
      get: () => () => ctx.resource?.refresh?.(),
      cache: false,              // false = get fresh value each time; default true caches it
    },
  },
});
```

### Method 3: Complex objects + meta structure definition

```js
await ctx.openView(popupUid, {
  mode: 'drawer',
  title: 'Opportunity - ' + stage,
  defineProperties: {
    filterContext: {
      value: { stage, owner: 'admin', dateRange: ['2026-01', '2026-03'] },
      meta: {
        title: 'Filter Context',
        type: 'object',
        properties: {
          stage: { title: 'Stage', type: 'string' },
          owner: { title: 'Owner', type: 'string' },
          dateRange: { title: 'Date Range', type: 'array' },
        },
      },
    },
  },
});
// Inside popup: ctx.filterContext.stage, ctx.filterContext.owner
```

### Full PropertyOptions Definition

```ts
interface PropertyOptions {
  value?: any;                      // static value
  get?: (ctx: FlowContext) => T;    // getter function
  cache?: boolean;                  // whether to cache getter result (default true)
  once?: boolean;                   // whether to define only once
  observable?: boolean;             // whether observable
  meta?: PropertyMetaOrFactory;     // type metadata
}
```

---

## Important Behaviors

### navigation Is Auto-Disabled

When `defineProperties` or `defineMethods` is provided, `navigation` is forced to `false`. This means:
- The popup is not reflected in the URL route
- **Refreshing the page will lose the popup state and passed parameters**
- This is expected behavior — custom parameters cannot be serialized into the URL

### Accessing Passed Parameters Inside the Popup

```js
// Inside a JS Block in the popup
const stage = ctx.selectedStage;         // direct access
const data = ctx.filterContext;          // objects are also directly accessible
const callback = ctx.onSaved;           // functions can be passed too
```

---

## Practical Scenarios

### Scenario 1: Chart click opens a popup (ECharts event)

```js
// Chart events (chartSettings.configure.chart.events.raw)
chart.off('click');
chart.on('click', 'series', function(params) {
    const stage = params.name || params.axisValue;
    const popupUid = ctx.model.uid + '-opp-by-stage';
    ctx.openView(popupUid, {
      mode: 'drawer',
      title: 'Opportunities - ' + stage,
      size: 'large',
      defineProperties: {
        selectedStage: {
          value: stage,
          meta: { title: 'Selected Stage', type: 'string' },
        },
      },
    });
});
```

### Scenario 2: KPI card click opens a popup

```js
const handleClick = async () => {
    const popupUid = ctx.model.uid + '-revenue-detail';
    await ctx.openView(popupUid, {
      mode: 'drawer',
      title: ctx.t('Revenue Detail'),
      size: 'large',
    });
};

// Bind onClick when rendering
ctx.React.createElement('div', { style: cardStyle, onClick: handleClick }, ...);
```

### Scenario 3: Page navigation with parameters (no popup)

When the target is a standalone page rather than a popup, use `ctx.router.navigate` + URL parameters:

```js
chart.off('click');
chart.on('click', 'series', function(params) {
    const stage = params.name;
    let url = '';
    switch(stage) {
        case '1-Lead': url = '/admin/e9478uhrdve'; break;
        case '2-Opportunity': url = '/admin/vga8g2pgnnu'; break;
        case '3-Quotation': url = '/admin/x9u01x7l8wj'; break;
        case '4-Order': url = '/admin/x9u01x7l8wj'; break;
    }
    if(url) {
        ctx.router.navigate(url + '?stage=' + encodeURIComponent(stage));
    }
});
```

Reading parameters on the target page:
```js
const params = new URLSearchParams(window.location.search);
const stage = params.get('stage');
```

---

## Popup vs Navigation Decision Guide

| Scenario | Recommended Approach | Reason |
|----------|---------------------|--------|
| View associated details, quick return | drawer popup | Stays on current page, smooth UX |
| Need to pass complex parameters/callbacks | drawer + defineProperties | Supports objects, functions |
| Navigate to a full list page | router.navigate | Standalone page, supports refresh |
| URL needs to be shareable | router.navigate + query | URL persistence |
| Navigate + simple filtering | router.navigate + query | Single values like stage/industry |

---

## Related Documents

- [Popup Context (passive popups)](/200000-guides/nocobase-js-sandbox/popup-context/) — How to access the current record inside a popup
- [JS Sandbox Home](/200000-guides/nocobase-js-sandbox/) — Full documentation index
- [Programming Pitfalls Guide](/200000-guides/nocobase-js-sandbox/pitfalls/) — Common errors
- [Dashboard Build Guide](/200000-guides/nocobase-dashboard-build/) — Charts + filters + KPI full build guide
