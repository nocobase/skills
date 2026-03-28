---
title: NocoBase JS Sandbox Programming Pitfalls & Troubleshooting Guide
description: API availability, common misconceptions, and workaround reference for JS Block / JS Field sandbox environments
tags: [nocobase, js-sandbox, js-block, troubleshooting, flow-engine]
type: guide
status: active
updated: "2026-03-12"
---

# NocoBase JS Sandbox Programming Pitfalls

## Key Takeaway

The NocoBase JS sandbox is based on SES Compartment, but **`lockdown()` is never called** (commented out in the source code), so built-in objects like `Date` and `Math` are **not frozen** and fully functional. Most "API unavailable" issues stem from the **allowlist mechanism**, not SES lockdown.

## API Availability Quick Reference

### Available in All Sandbox Contexts

| API | Notes |
|-----|-------|
| `Date.now()` / `new Date()` | Fully functional, not locked by SES |
| `Math.*` | Fully functional |
| `setTimeout` / `clearTimeout` | On the allowlist, bound to the real window |
| `setInterval` / `clearInterval` | On the allowlist |
| `console` | Fully functional |
| `FormData` | On the allowlist |
| `Blob` | On the allowlist (newly added) |
| `URL` | On the allowlist (newly added) |
| `ctx.dayjs()` | Injected via context, available in all scenarios |
| `ctx.themeToken` | Observable, updates reactively |
| `ctx.antdConfig` | Contains theme.algorithm and other config |
| `ctx.t()` | i18n translation function |
| `await ctx.getVar('ctx.user.id')` | Current logged-in user ID (must await) |

> **Note**: To get the current user ID, you must use `await ctx.getVar('ctx.user.id')`. **Do not use** `ctx.currentUser` (it is a proxy object; passing it directly to filters produces `[object Object]`, causing SQL errors).
>
> ```js
> // ✅ Correct
> const userId = await ctx.getVar('ctx.user.id');
>
> // ❌ Wrong — ctx.currentUser.id is a proxy, not a plain number
> const userId = ctx.currentUser?.id;
> ```

### Available Only in JSBlockModel / JSFieldModel

These two contexts inject the **real `window` and `document`** (see `runjs-context/helpers.ts`):

| API | Notes |
|-----|-------|
| `window.requestAnimationFrame` | Must be called with the `window.` prefix |
| `window.cancelAnimationFrame` | Same as above |
| `window.matchMedia` | Available, but detects the OS theme, not the app theme |
| `window.getComputedStyle` | Available |
| `window.fetch` | Available (but `ctx.api.request` is recommended) |

### Unavailable in Safe Proxy Contexts (Other Contexts)

| API | Workaround |
|-----|------------|
| `requestAnimationFrame` | `setTimeout(fn, 16)` |
| `matchMedia` | Use `ctx.antdConfig.theme.algorithm` to detect theme |
| `localStorage` / `sessionStorage` | No direct workaround; use `ctx.api.request` to store data server-side |
| `fetch` | `ctx.api.request()` |
| `location.href` (read) | `window.location.pathname` (on the allowlist) |
| `location.search` (read) | `ctx.router.state.location.search` (note: `.state.location`, not `.location`) |
| `URLSearchParams` | Not on the allowlist; use regex: `search.match(/[?&]key=([^&]*)/)` |
| Arrow functions `=>` in Chart option | Arrow functions in Chart `raw` may not be supported; use `function(){}` instead |
| `$dateBetween` in `flowSql:run` | The `list` API accepts a string like `"2026-02"`, but `flowSql:run` requires an array `["2026-02-01","2026-02-28"]`; sanitization needed |

## Common Pitfalls

### 1. Bare `requestAnimationFrame` Call Throws an Error

**Symptom**: Calling `requestAnimationFrame(tick)` directly throws `Access to global property "requestAnimationFrame" is not allowed`.

**Cause**: `requestAnimationFrame` is not in the `allowedGlobals` allowlist in `safeGlobals.ts`. Even in JS Block (which has the real window), the SES Compartment's global scope does not include it — it must be accessed via the `window.` prefix.

**Solution**:

```js
// Option 1: Use the window prefix (JS Block / JS Field only)
window.requestAnimationFrame(tick);
window.cancelAnimationFrame(id);

// Option 2: Use setTimeout instead (works in all contexts, recommended)
setTimeout(tick, 16);  // ~60fps
clearTimeout(id);
```

### 2. AI Incorrectly Assumes Date.now() Is Locked by SES

**Symptom**: An AI agent assumes `Date.now()` returns `NaN` in the sandbox and works around it using frame counting.

**Fact**: `lockdown()` is **never called** in NocoBase (`plugin-flow-engine/src/server/template/resolver.ts` — commented out). `Date` is explicitly passed into the sandbox via `allowedGlobals` and works perfectly.

**Verification**:

```js
ctx.render(
  <div style={{ padding: 16 }}>
    <p>Date.now(): {Date.now()}</p>
    <p>new Date(): {new Date().toLocaleString()}</p>
  </div>
);
```

### 3. Correct Pattern for an Animation Hook

```js
// useAnimatedValue — works in all sandbox contexts
function useAnimatedValue(target, duration = 1200) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    setCurrent(0);
    const start = Date.now();
    let timer;
    const tick = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);  // easeOutCubic
      setCurrent(target * ease);
      if (t < 1) timer = setTimeout(tick, 16);
    };
    timer = setTimeout(tick, 16);
    return () => clearTimeout(timer);
  }, [target, duration]);
  return current;
}
```

### 4. Use antdConfig for Theme Detection, Not matchMedia

```js
// Correct: detect the app theme
const algorithm = ctx.antdConfig?.theme?.algorithm;
const isDark = Array.isArray(algorithm)
  ? algorithm.some(fn => fn === ctx.antd.theme.darkAlgorithm)
  : algorithm === ctx.antd.theme.darkAlgorithm;

// Not recommended: detects the OS theme, and only available in JS Block
// window.matchMedia('(prefers-color-scheme: dark)').matches
```

### 5. Periodic Table Refresh — Cannot Auto-Stop (Known Limitation)

**Requirement**: Use `setInterval` in an event flow's `onInit` to periodically refresh table data.

**Problem**: After navigating to another page, the timer keeps running in the background, continuously sending requests.

**Attempted solutions (all failed)**:

| Approach | Failure Reason |
|----------|---------------|
| `return () => clearInterval(timer)` | Event flows are not React components; cleanup functions are never called |
| `ctx.engine.emitter.on('model:unmounted', ...)` | Event never fires (model may not be unmounted during SPA route transitions) |
| `document.body.contains(el)` | `Access to document property "body" is not allowed` — blocked by sandbox |
| `el.isConnected` | DOM elements are not available in the event flow context |
| `ctx.model.mounted` | Property does not exist; code silently fails |
| `window.__timerKey` global variable | `Access to global property "xxx" is not allowed` — blocked by sandbox |

**Currently viable solutions** (with trade-offs):

```js
// Option A: DOM detection (requires hardcoded UID, JS Block only)
const INTERVAL = 5000;
const UID = 'xxx'; // table UID

if (ctx.model._refreshTimer) clearInterval(ctx.model._refreshTimer);

ctx.model._refreshTimer = setInterval(() => {
  const el = document.querySelector(`[data-uid="${UID}"]`);
  if (!el) {
    clearInterval(ctx.model._refreshTimer);
    ctx.model._refreshTimer = null;
    return;
  }
  ctx.model.resource?.refresh();
}, INTERVAL);
```

```js
// Option B: Silent failure (simplest; stale requests occur after leaving the page)
const INTERVAL = 5000;

if (ctx.model._refreshTimer) clearInterval(ctx.model._refreshTimer);

ctx.model._refreshTimer = setInterval(() => {
  try { ctx.model.resource.refresh(); } catch(e) {
    clearInterval(ctx.model._refreshTimer);
  }
}, INTERVAL);
```

**Notes**:
- You can attach custom properties to `ctx.model._refreshTimer` (does not trigger sandbox restrictions)
- The event flow's `onInit` re-executes when returning to the page; the `clearInterval` at the top clears the old timer, preventing accumulation
- `document.querySelector` in Option A is only available in JS Block context (which injects the real document)
- Event flow contexts use a safe proxy; `document.querySelector` / `document.body` are both unavailable

**Root cause**: NocoBase event flows only have `onInit` — there is no `onDestroy` / `onUnmount` lifecycle hook. A framework-level fix is needed to fully resolve this.

### 6. Dynamic Allowlist Extension

If you genuinely need a window/document API in a safe proxy context, you can extend the allowlist via registration functions:

```ts
import { registerRunJSSafeWindowGlobals, registerRunJSSafeDocumentGlobals } from '@nocobase/flow-engine';

// Register additional allowed window properties
registerRunJSSafeWindowGlobals(['requestAnimationFrame', 'cancelAnimationFrame']);

// Register additional allowed document properties
registerRunJSSafeDocumentGlobals(['getElementById', 'body']);
```

Note: This takes effect globally — use with caution.

## Related Documents

- [JS Sandbox Source Code Investigation Guide](./source-guide)
- [JS Block Theme Detection Methods](./theme-detection)
- [JS Sandbox Theme Internals](./theme-internals)
- [JS Block Code Sync Workflow](./block-sync)
