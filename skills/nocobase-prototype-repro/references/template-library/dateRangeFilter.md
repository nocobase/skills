# `dateRangeFilter` — Date quick filter

Today / 7 days / 30 days / This month pills filtering target blocks by a date field

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Filter

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `targets` | targetBlock | ✓ |  | The data blocks on this page that react to this component |
| `dateField` | field | ✓ |  | accepts date, coll←target:targets, Defaults to createdAt if the targets have it |
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

const { useState } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

const PRESETS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'month', label: 'This month' },
];

function rangeOf(key) {
  const now = new Date();
  const end = new Date(now.getTime() + 86400000); // include today
  let start = null;
  if (key === 'today') { start = new Date(now); start.setHours(0, 0, 0, 0); }
  else if (key === '7d') start = new Date(now.getTime() - 7 * 86400000);
  else if (key === '30d') start = new Date(now.getTime() - 30 * 86400000);
  else if (key === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
  return start ? [start.toISOString(), end.toISOString()] : null;
}

function Comp() {
  const [sel, setSel] = useState(ctx.model.__sel || 'all');
  const choose = function (key) {
    setSel(key); ctx.model.__sel = key;
    const r = rangeOf(key);
    if (!r) applyFilter(null);
    else { const f = {}; f[$p.dateField] = { $dateBetween: r }; applyFilter(f); }
  };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {PRESETS.map(function (p2) {
        const active = sel === p2.key;
        return (
          <span key={p2.key} onClick={function () { choose(p2.key); }}
            style={{
              cursor: 'pointer', fontSize: 12.5, padding: '4px 14px', borderRadius: 16, userSelect: 'none',
              border: '1px solid ' + (active ? T.primary : T.border),
              background: active ? T.primary : T.bg, color: active ? '#fff' : T.sub, fontWeight: active ? 600 : 400,
            }}>
            {p2.label}
          </span>
        );
      })}
    </div>
  );
}

ctx.render(<Comp />);
```
