# `segmentedFilter` — Segmented filter

A segmented single-select (All / options) filtering target blocks

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Filter

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `targets` | targetBlock | ✓ |  | The data blocks on this page that react to this component |
| `field` | field | ✓ |  | coll←target:targets, Select fields use native options; plain fields use observed values |
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

const enumOpts = Array.isArray($p.field__enum) ? $p.field__enum : [];
const { useEffect } = ctx.React;

function Comp() {
  const [sel, setSel] = useState(ctx.model.__sel != null ? ctx.model.__sel : null);
  const [opts, setOpts] = useState(enumOpts);
  useEffect(function () {
    if (enumOpts.length) return;
    (async function () {
      try {
        const t = __targets()[0];
        const coll = t && t.collection && t.collection.name;
        if (!coll) return;
        const res = await ctx.api.request({ url: coll + ':list', params: { pageSize: 500 } });
        const rows = (res && res.data && res.data.data) || [];
        const seen = [];
        rows.forEach(function (r) { const v = r[$p.field]; if (v != null && v !== '' && seen.indexOf(String(v)) < 0) seen.push(String(v)); });
        setOpts(seen.slice(0, 12).map(function (v) { return { value: v, label: v }; }));
      } catch (e) {}
    })();
  }, []);
  const choose = function (value) {
    const next = value != null && sel === String(value) ? null : (value == null ? null : String(value));
    setSel(next); ctx.model.__sel = next;
    if (next == null) applyFilter(null);
    else { const f = {}; f[$p.field] = { $eq: next }; applyFilter(f); }
  };
  const all = [{ value: null, label: 'All' }].concat(opts);
  return (
    <div style={{ display: 'inline-flex', padding: 3, background: T.card, borderRadius: 9, border: '1px solid ' + T.border, gap: 2, flexWrap: 'wrap' }}>
      {all.map(function (o, i) {
        const active = o.value == null ? sel == null : sel === String(o.value);
        return (
          <span key={i} onClick={function () { choose(o.value); }}
            style={{
              cursor: 'pointer', fontSize: 12.5, padding: '4px 14px', borderRadius: 7, userSelect: 'none',
              background: active ? T.bg : 'transparent', color: active ? T.primary : T.sub,
              fontWeight: active ? 700 : 400, boxShadow: active ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
            }}>
            {o.label || String(o.value)}
          </span>
        );
      })}
    </div>
  );
}

ctx.render(<Comp />);
```
