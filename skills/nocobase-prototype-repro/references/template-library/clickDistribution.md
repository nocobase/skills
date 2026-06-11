# `clickDistribution` — Click-to-filter distribution

Value counts as bars / pills — clicking filters target blocks ($in multi-select)

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Filter

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  | Usually the same collection as the targets |
| `field` | field | ✓ |  | coll←collection, Select fields get native colors/order; plain text fields work too (observ |
| `targets` | targetBlock | ✓ |  | The data blocks on this page that react to this component |
| `display` | select |  | `bars` | opts: bars/pills |
| `label` | text |  |  |  |
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

const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

const enumOpts = Array.isArray($p.field__enum) ? $p.field__enum : [];
const COLOR = { blue: '#1677ff', green: '#52c41a', gold: '#faad14', volcano: '#fa541c', purple: '#722ed1', magenta: '#eb2f96', cyan: '#13c2c2', geekblue: '#2f54eb', orange: '#fa8c16', lime: '#a0d911', red: '#f5222d' };

function Comp() {
  const [counts, setCounts] = useState(null);
  const [sel, setSel] = useState(Array.isArray(ctx.model.__sel) ? ctx.model.__sel : []);

  useEffect(function () {
    (async function () {
      try {
        const res = await ctx.api.request({ url: $p.collection + ':list', params: { pageSize: 500 } });
        const rows = (res && res.data && res.data.data) || [];
        const c = {};
        rows.forEach(function (r) { const v = r[$p.field]; if (v != null && v !== '') c[String(v)] = (c[String(v)] || 0) + 1; });
        setCounts(c);
      } catch (e) { setCounts({}); }
    })();
  }, []);

  const toggle = function (value) {
    const v = String(value);
    const next = sel.indexOf(v) >= 0 ? sel.filter(function (x) { return x !== v; }) : sel.concat([v]);
    setSel(next);
    ctx.model.__sel = next;
    if (!next.length) applyFilter(null);
    else { const f = {}; f[$p.field] = { $in: next }; applyFilter(f); }
  };
  const clearAll = function () { setSel([]); ctx.model.__sel = []; applyFilter(null); };

  if (counts == null) return <div style={{ padding: 12, color: T.sub }}>Loading…</div>;

  const opts = enumOpts.length
    ? enumOpts
    : Object.keys(counts).map(function (k) { return { value: k, label: k }; });
  const max = opts.reduce(function (m, o) { return Math.max(m, counts[String(o.value)] || 0); }, 0) || 1;

  return (
    <div style={{ padding: '12px 14px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, color: T.text, flex: 1 }}>{$p.label || ''}</span>
        {sel.length ? <a onClick={clearAll} style={{ fontSize: 12, color: T.primary }}>✕ Clear ({sel.length})</a> : <span style={{ fontSize: 11, color: T.sub }}>click to filter</span>}
      </div>
      {$p.display === 'pills' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {opts.map(function (o, i) {
            const v = String(o.value);
            const active = sel.indexOf(v) >= 0;
            const color = (o.color && COLOR[o.color]) || T.primary;
            return (
              <span
                key={i}
                onClick={function () { toggle(o.value); }}
                style={{
                  cursor: 'pointer', fontSize: 12.5, padding: '4px 12px', borderRadius: 16, userSelect: 'none',
                  border: '1px solid ' + (active ? color : T.border),
                  background: active ? color : T.card, color: active ? '#fff' : T.text, fontWeight: active ? 600 : 400,
                }}
              >
                {(o.label || v) + ' · ' + (counts[v] || 0)}
              </span>
            );
          })}
        </div>
      ) : (
        opts.map(function (o, i) {
          const v = String(o.value);
          const n = counts[v] || 0;
          const active = sel.indexOf(v) >= 0;
          const color = (o.color && COLOR[o.color]) || T.primary;
          return (
            <div key={i} onClick={function () { toggle(o.value); }} style={{ marginBottom: 7, cursor: 'pointer', opacity: sel.length && !active ? 0.45 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                <span style={{ color: active ? color : T.sub, fontWeight: active ? 700 : 400 }}>
                  {(o.label || v)}{active ? ' ✓' : ''}
                </span>
                <b style={{ color: T.text }}>{n}</b>
              </div>
              <div style={{ background: T.card, borderRadius: 4, height: 8 }}>
                <div style={{ width: Math.max(4, (n / max) * 100) + '%', height: '100%', background: color, borderRadius: 4, transition: 'width .3s' }} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

ctx.render(<Comp />);
```
