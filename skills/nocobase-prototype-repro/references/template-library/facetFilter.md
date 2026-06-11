# `facetFilter` — Facet checkbox filter

Sidebar checkbox groups (multi-select per field, live counts) filtering target blocks

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Filter

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `targets` | targetBlock | ✓ |  | The data blocks on this page that react to this component |
| `facetFields` | fields | ✓ |  | coll←target:targets, Each field becomes a checkbox section (select fields get native label |
| `showCounts` | boolean |  | `true` |  |
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

const ENUMS = $p.facetFields__enums || {};

function Comp() {
  const [counts, setCounts] = useState(null);
  const [sel, setSel] = useState(ctx.model.__fsel || {});

  useEffect(function () {
    (async function () {
      try {
        const t = __targets()[0];
        const coll = (t && t.collection && t.collection.name) || null;
        if (!coll || !$p.showCounts) { setCounts({}); return; }
        const res = await ctx.api.request({ url: coll + ':list', params: { pageSize: 500 } });
        const rows = (res && res.data && res.data.data) || [];
        const c = {};
        ($p.facetFields || []).forEach(function (f) {
          c[f] = {};
          rows.forEach(function (r) { const v = r[f]; if (v != null && v !== '') c[f][String(v)] = (c[f][String(v)] || 0) + 1; });
        });
        setCounts(c);
      } catch (e) { setCounts({}); }
    })();
  }, []);

  const toggle = function (field, value) {
    const v = String(value);
    const cur = sel[field] || [];
    const nextArr = cur.indexOf(v) >= 0 ? cur.filter(function (x) { return x !== v; }) : cur.concat([v]);
    const next = Object.assign({}, sel); next[field] = nextArr;
    setSel(next); ctx.model.__fsel = next;
    if (!nextArr.length) applyFilter(null, field);
    else { const f = {}; f[field] = { $in: nextArr }; applyFilter(f, field); }
  };
  const clearAll = function () {
    Object.keys(sel).forEach(function (f) { applyFilter(null, f); });
    setSel({}); ctx.model.__fsel = {};
  };
  const total = Object.keys(sel).reduce(function (a, f) { return a + (sel[f] || []).length; }, 0);

  if (counts == null) return <div style={{ padding: 12, color: T.sub }}>Loading…</div>;

  return (
    <div style={{ padding: '12px 14px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, color: T.text, flex: 1 }}>{$p.label || 'Filters'}</span>
        {total ? <a onClick={clearAll} style={{ fontSize: 12, color: T.primary }}>✕ Clear ({total})</a> : null}
      </div>
      {($p.facetFields || []).map(function (field) {
        const opts = Array.isArray(ENUMS[field]) && ENUMS[field].length
          ? ENUMS[field]
          : Object.keys((counts[field] || {})).map(function (k) { return { value: k, label: k }; });
        const cur = sel[field] || [];
        return (
          <div key={field} style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>{field}</div>
            {opts.map(function (o, i) {
              const v = String(o.value);
              const active = cur.indexOf(v) >= 0;
              const n = (counts[field] && counts[field][v]) || 0;
              return (
                <div key={i} onClick={function () { toggle(field, o.value); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', cursor: 'pointer', userSelect: 'none' }}>
                  <span style={{
                    width: 15, height: 15, borderRadius: 4, flexShrink: 0, display: 'grid', placeItems: 'center',
                    border: '1.5px solid ' + (active ? T.primary : T.border),
                    background: active ? T.primary : T.bg, color: '#fff', fontSize: 10, fontWeight: 800,
                  }}>{active ? '✓' : ''}</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: active ? T.text : T.sub, fontWeight: active ? 600 : 400 }}>{o.label || v}</span>
                  {$p.showCounts ? <span style={{ fontSize: 11, color: T.sub }}>{n}</span> : null}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

ctx.render(<Comp />);
```
