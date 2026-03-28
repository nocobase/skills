---
title: JS Field Two-Way Form Value Binding
description: How JS Editable Field syncs with form values — ctx.getValue issues and the js-field:value-change event workaround
tags: [nocobase, js-sandbox, js-field, form-binding, pitfall]
type: guide
status: active
updated: "2026-03-18"
---

# JS Field Two-Way Form Value Binding

## Problem

JS Editable Field needs two-way synchronization with NocoBase form values:
- **Write**: User inputs in JS Field → sync to form → `ctx.setValue(value)`
- **Read**: Form value changes (e.g., from linkage/defaults/edit backfill) → JS Field detects and updates

## Old Pattern (problematic)

```js
// ❌ Old pattern: polling ctx.getValue
useEffect(() => {
  const externalValue = ctx.getValue?.();
  if (externalValue !== undefined && externalValue !== value) {
    setValue(externalValue);
    checkDuplicates(externalValue);
  }
}, [ctx.getValue?.()]);
```

### Issues

- `ctx.getValue?.()` as a useEffect dependency is unreliable — React cannot track changes in an external function's return value
- In some versions `ctx.getValue` may be undefined, preventing useEffect from firing
- The polling pattern has poor performance and may miss rapid consecutive changes

## New Pattern (recommended)

```js
// ✅ New pattern: listen for js-field:value-change event
useEffect(() => {
  const handler = (ev) => {
    const next = ev?.detail ?? '';
    setValue(next);
    checkDuplicates(next);  // if duplicate checking is needed
  };
  ctx.element?.addEventListener('js-field:value-change', handler);
  return () => ctx.element?.removeEventListener('js-field:value-change', handler);
}, [checkDuplicates]);
```

### How It Works

NocoBase's flow-engine dispatches a `js-field:value-change` custom event on the JS Field's `ctx.element` when the form value changes. `event.detail` carries the new value. This is the framework's native notification mechanism and is more reliable than polling `ctx.getValue()`.

## Complete Two-Way Binding Pattern

```js
const { useState, useEffect } = ctx.React;

const MyField = () => {
  const [value, setValue] = useState('');

  // Write: JS → form
  useEffect(() => {
    ctx.setValue?.(value);
  }, [value]);

  // Read: form → JS (event-driven)
  useEffect(() => {
    const handler = (ev) => {
      const next = ev?.detail ?? '';
      setValue(next);
    };
    ctx.element?.addEventListener('js-field:value-change', handler);
    return () => ctx.element?.removeEventListener('js-field:value-change', handler);
  }, []);

  return ctx.React.createElement('input', {
    value: value,
    onChange: (e) => setValue(e.target.value),
  });
};

ctx.render(ctx.React.createElement(MyField));
```

## Typical Scenario: Input Field + Duplicate Checking

```js
const DuplicateCheckField = () => {
  const [value, setValue] = useState('');
  const [matches, setMatches] = useState([]);

  const checkDuplicates = useCallback(async (val) => {
    if (!val || val.length < 2) { setMatches([]); return; }
    const res = await ctx.api.request({
      url: 'customers:list',
      params: { filter: { name: { $includes: val } }, pageSize: 5 }
    });
    setMatches(res?.data?.data || []);
  }, []);

  // Write
  useEffect(() => { ctx.setValue?.(value); }, [value]);

  // Read (event-driven)
  useEffect(() => {
    const handler = (ev) => {
      const next = ev?.detail ?? '';
      setValue(next);
      checkDuplicates(next);
    };
    ctx.element?.addEventListener('js-field:value-change', handler);
    return () => ctx.element?.removeEventListener('js-field:value-change', handler);
  }, [checkDuplicates]);

  // ... render input + matches warning
};
```

## Migration Guide

Batch-replace the old pattern across your project:

**Search for**:
```
ctx.getValue?.()
```

**Replace the entire useEffect block** (from `useEffect(() => {` to `}, [ctx.getValue?.()]);`) with the event listener version.

Note: check the callback function name — some use `checkDuplicates` (with s), others use `checkDuplicate` (without s). Match accordingly when replacing.

---

## Related Documents

- [JS Sandbox Home](/200000-guides/nocobase-js-sandbox/) — Full documentation index
- [Popup Context](/200000-guides/nocobase-js-sandbox/popup-context/) — ctx.popup API
- [Programming Pitfalls Guide](/200000-guides/nocobase-js-sandbox/pitfalls/) — Other common errors
