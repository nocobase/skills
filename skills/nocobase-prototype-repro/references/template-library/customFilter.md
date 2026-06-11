# `customFilter` — Custom filter group

Pills / buttons / segmented / tabs / chips / dropdown — each option a condition set (or SQL / JS) filtering target blocks

**kind** `item` · alsoKinds: block · **scope** `collection` · **category** Filter

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `targets` | targetBlock | ✓ |  | The data blocks on this page that react to this component |
| `options` | filterOptions | ✓ |  | coll←target:targets, Each option = one entry. Mode per option: native Data Scope condition |
| `variant` | styleSelect |  | `pills` | opts: pills/buttons/segmented/underline/chips/dropdown |
| `allLabel` | text |  | `All` |  |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { Select } = ctx.antd;
const { useState } = ctx.React;

const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0', gradient: 'linear-gradient(135deg,#1677ff,#13c2c2)' };

const FILTER_KEY = 'jsTplCustomFilter:' + (ctx.model && ctx.model.uid);

const options = (Array.isArray($p.options) ? $p.options : []).filter(function (o) { return o && o.label; });

function targetsOf() {
  return (Array.isArray($p.targets) ? $p.targets : [])
    .map(function (u) { return ctx.getModel(u); })
    .filter(function (m) { return m && m.resource; });
}

// resolve an option to a native filter JSON, honoring its mode:
//   builder → precompiled o.filter (runtime-resolve {{ ctx.* }} variables)
//   sql     → runById ids → id $in ; js → eval, filter JSON or id array
async function resolveFilter(o) {
  const mode = o.mode || 'builder';
  if (mode === 'sql') {
    if (!o.sqlUid) return null;
    const idf = o.idField || 'id';
    const rows = await ctx.sql.runById(o.sqlUid, { type: 'selectRows' });
    const arr = Array.isArray(rows) ? rows : [];
    const ids = arr.map(function (r) {
      if (r && typeof r === 'object') return r[idf] != null ? r[idf] : Object.values(r)[0];
      return r;
    }).filter(function (v) { return v != null; });
    const f = {}; f[idf] = { $in: ids.length ? ids : [null] }; return f;
  }
  if (mode === 'js') {
    const fn = new Function('ctx', 'return (async function(){\n' + (o.js || 'return null;') + '\n})()');
    let f = await fn(ctx);
    if (Array.isArray(f)) { const idf = o.idField || 'id'; const w = {}; w[idf] = { $in: f }; return w; }
    return f || null;
  }
  let f = o.filter || null;
  if (f && ctx.resolveJsonTemplate) {
    try { f = await ctx.resolveJsonTemplate(f); } catch (e) { /* keep literal */ }
  }
  return f;
}

async function applyFilter(idx) {
  let filter = null;
  if (idx !== -1) {
    try { filter = await resolveFilter(options[idx]); }
    catch (e) { ctx.message && ctx.message.error('Filter failed: ' + ((e && e.message) || e)); return; }
  }
  targetsOf().forEach(function (t) {
    if (filter) { t.resource.addFilterGroup && t.resource.addFilterGroup(FILTER_KEY, filter); }
    else { t.resource.removeFilterGroup && t.resource.removeFilterGroup(FILTER_KEY); }
    t.resource.setPage && t.resource.setPage(1);
    t.resource.refresh && t.resource.refresh();
  });
}

async function apply(idx, setSel) {
  setSel(idx);
  ctx.model.__cfSel = idx;
  await applyFilter(idx);
}

function CustomFilter() {
  const [sel, setSel] = useState(ctx.model.__cfSel != null ? ctx.model.__cfSel : -1);
  // legacy configs saved before the style param carried display: buttons|dropdown
  const variant = $p.variant || ($p.display === 'dropdown' ? 'dropdown' : 'pills');
  const items = [{ label: $p.allLabel || 'All', idx: -1 }].concat(
    options.map(function (o, i) { return { label: o.label, idx: i }; })
  );

  if (variant === 'dropdown') {
    const selectOpts = items.map(function (o) { return { value: o.idx, label: o.label }; });
    return <Select size="small" style={{ minWidth: 160 }} value={sel} onChange={function (v) { apply(v, setSel); }} options={selectOpts} />;
  }

  function itemStyle(active) {
    const base = { cursor: 'pointer', fontSize: 12, userSelect: 'none', transition: 'all .15s' };
    if (variant === 'buttons') return Object.assign(base, {
      padding: '3px 14px', borderRadius: 6,
      border: '1px solid ' + (active ? T.primary : T.border),
      background: active ? T.primary : T.bg,
      color: active ? '#fff' : T.text,
    });
    if (variant === 'segmented') return Object.assign(base, {
      padding: '3px 14px', borderRadius: 6,
      background: active ? T.bg : 'transparent',
      color: active ? T.primary : T.sub,
      fontWeight: active ? 600 : 400,
      boxShadow: active ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
    });
    if (variant === 'underline') return Object.assign(base, {
      padding: '4px 2px 6px', margin: '0 10px 0 0',
      borderBottom: '2px solid ' + (active ? T.primary : 'transparent'),
      color: active ? T.primary : T.sub,
      fontWeight: active ? 600 : 400,
    });
    if (variant === 'chips') return Object.assign(base, {
      padding: '2px 12px', borderRadius: 5,
      border: '1px solid ' + (active ? T.primary : T.border),
      background: active ? T.primary + '1a' : T.card,
      color: active ? T.primary : T.text,
      fontWeight: active ? 600 : 400,
    });
    // pills (default)
    return Object.assign(base, {
      padding: '2px 12px', borderRadius: 14,
      border: '1px solid ' + (active ? T.primary : T.border),
      background: active ? T.primary : T.bg,
      color: active ? '#fff' : T.text,
    });
  }

  const wrapStyle =
    variant === 'segmented'
      ? { display: 'inline-flex', gap: 2, padding: 3, borderRadius: 8, background: T.card, border: '1px solid ' + T.border, alignItems: 'center' }
      : variant === 'underline'
        ? { display: 'inline-flex', gap: 4, borderBottom: '1px solid ' + T.border, alignItems: 'center' }
        : { display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' };

  return (
    <span style={wrapStyle}>
      {items.map(function (o) {
        return (
          <span key={o.idx} onClick={function () { apply(o.idx, setSel); }} style={itemStyle(sel === o.idx)}>
            {o.label}
          </span>
        );
      })}
    </span>
  );
}

ctx.render(<CustomFilter />);
```
