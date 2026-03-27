---
title: Clickable relation columns
description: How to display relation title fields in tables, open popup views from them, and decide when JS workarounds are forbidden by default.
---

# Clickable relation columns

## Target scenarios

- show relation titles such as `publisher.name` or `customer.name`
- let the user click that title to open a details popup, dialog, or drawer
- combine table-column rendering with popup/openView

## Default priority

1. If the request only needs relation-title display without click-to-open:
   - a parent-collection dotted path such as `customer.name` is allowed
   - `associationPathName=customer` must be explicit
2. If the request needs "click title to open relation details":
   - do not let a dotted path such as `customer.name` own click-to-open directly
   - prefer the native relation-column pattern: bind the relation field itself, let runtime or title display render the name, and attach `clickToOpen + popupSettings.openView` to that native relation column
3. Only allow `JSFieldModel` or `JSColumnModel` when the user explicitly asks for a JS or RunJS solution

## Default behavior

When the request contains all of these signals:

- table column
- relation title field
- click-to-open or popup

Default flow:

1. do not generate `dotted path + click-to-open`
2. do not jump straight to `JSFieldModel` or `JSColumnModel`
3. first converge to the native relation-column solution
4. if references cannot yet prove that native solution is stable, report it as `partial` or `unverified` instead of silently switching to JS

## Explicit JS exception

Only preserve the JS route when the user explicitly says to use JS.

In guard terms, that means:

```json
{
  "intentTags": ["js.explicit"]
}
```

Without that tag, the guard should treat a JS workaround for clickable relation titles as high-risk.

## Common traps

- treating `customer.name` as a stable display path and then also hanging click-to-open from it
- switching to `JSFieldModel` or `JSColumnModel` only to avoid dotted-path risk
- interpreting "click the column to open a popup" as "build a custom JS cell" without being asked

## Related docs

- [table-column-rendering.md](table-column-rendering.md)
- [popup-openview.md](popup-openview.md)
- [payload-guard.md](payload-guard.md)
- [../js-models/js-column.md](../js-models/js-column.md)
