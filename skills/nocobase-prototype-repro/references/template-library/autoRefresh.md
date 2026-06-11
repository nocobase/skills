# `autoRefresh` — Auto-refresh toggle

A switch that periodically refreshes a table block

**kind** `action` · **scope** `collection` · **category** Action

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `targetUid` | targetBlock |  |  |  |
| `intervalSeconds` | number |  | `10` |  |
| `label` | text |  | `Auto refresh` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { Switch } = ctx.antd;
const { useState } = ctx.React;
const KEY = '__jsTplAutoRefresh_' + (ctx.model && ctx.model.uid);

function targetResource() {
  const t = $p.targetUid ? ctx.getModel($p.targetUid) : null;
  return (t && t.resource) || ctx.resource;
}

function Toggle() {
  const [on, setOn] = useState(!!(ctx.engine && ctx.engine[KEY]));
  const flip = function (checked) {
    if (ctx.engine && ctx.engine[KEY]) { clearInterval(ctx.engine[KEY]); ctx.engine[KEY] = null; }
    if (checked) {
      const ms = Math.max(2, Number($p.intervalSeconds) || 10) * 1000;
      ctx.engine[KEY] = setInterval(function () {
        const r = targetResource();
        if (r && r.refresh) r.refresh();
      }, ms);
    }
    setOn(checked);
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Switch size="small" checked={on} onChange={flip} />
      <span>{$p.label || 'Auto refresh'}</span>
    </span>
  );
}

ctx.render(<Toggle />);
```
