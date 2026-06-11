# `searchFilter` — Search box

A standalone search box — keyword $or-matches chosen fields of target blocks

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Filter

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `targets` | targetBlock | ✓ |  | The data blocks on this page that react to this component |
| `searchFields` | fields | ✓ |  | coll←target:targets |
| `placeholder` | text |  | `Search…` |  |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const __FKEY = 'jsTpl:' + (ctx.model && ctx.model.uid);
function __targets() {
  const v = $p.targets;
  return (Array.isArray(v) ? v : v ? [v] : [])
    .map(function (uid) { return ctx.getModel(uid); })
    .filter(function (t) { return t && t.resource; });
}
function applyFilter(filter, keySuffix) {
  const key = __FKEY + (keySuffix ? ':' + keySuffix : '');
  __targets().forEach(function (t) {
    try {
      if (filter) t.resource.addFilterGroup(key, filter);
      else if (t.resource.removeFilterGroup) t.resource.removeFilterGroup(key);
      t.resource.setPage && t.resource.setPage(1);
      t.resource.refresh && t.resource.refresh();
    } catch (e) {}
  });
}

const { Input } = ctx.antd;
const { useState } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

function Comp() {
  const [q, setQ] = useState(ctx.model.__q || '');
  const run = function (value) {
    setQ(value); ctx.model.__q = value;
    if (ctx.model.__t) clearTimeout(ctx.model.__t);
    ctx.model.__t = setTimeout(function () {
      const v = String(value || '').trim();
      if (!v) { applyFilter(null); return; }
      const or = ($p.searchFields || []).map(function (f) { const c = {}; c[f] = { $includes: v }; return c; });
      applyFilter(or.length === 1 ? or[0] : { $or: or });
    }, 350);
  };
  return (
    <Input
      allowClear
      value={q}
      onChange={function (e) { run(e.target.value); }}
      placeholder={$p.placeholder || 'Search…'}
      prefix={<span style={{ color: T.sub }}>🔍</span>}
      style={{ maxWidth: 360 }}
    />
  );
}

ctx.render(<Comp />);
```
