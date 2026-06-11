# `conditionCards` — Condition stat cards

One card per condition set with a live record count — click to filter target blocks

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Filter

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `targets` | targetBlock | ✓ |  | The data blocks on this page that react to this component |
| `options` | filterOptions | ✓ |  | coll←target:targets, Each option = one card. Native Data Scope conditions / SQL / JS per o |
| `variant` | styleSelect |  | `stat` | opts: stat/tile/gradient/outline/chip/bars |
| `allLabel` | text |  | `All` |  |
| `showCounts` | boolean |  | `true` |  |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { useState } = ctx.React;

const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0', gradient: 'linear-gradient(135deg,#1677ff,#13c2c2)' };

const FILTER_KEY = 'jsTplCondCards:' + (ctx.model && ctx.model.uid);

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


function useOptionCounts(enabled) {
  const [counts, setCounts] = ctx.React.useState(ctx.model.__cfCounts || null);
  ctx.React.useEffect(function () {
    if (!enabled || ctx.model.__cfCounts) return;
    (async function () {
      const t = targetsOf()[0];
      const coll = t && t.collection && t.collection.name;
      if (!coll) return;
      const out = { all: null, byIdx: [] };
      try {
        const r0 = await ctx.api.request({ url: coll + ':list', params: { pageSize: 1 } });
        out.all = (r0.data && r0.data.meta && r0.data.meta.count) || 0;
      } catch (e) {}
      for (let i = 0; i < options.length; i++) {
        try {
          const f = await resolveFilter(options[i]);
          const r = await ctx.api.request({ url: coll + ':list', params: { filter: f || {}, pageSize: 1 } });
          out.byIdx[i] = (r.data && r.data.meta && r.data.meta.count) || 0;
        } catch (e) { out.byIdx[i] = null; }
      }
      ctx.model.__cfCounts = out;
      setCounts(out);
    })();
  }, []);
  return counts;
}

async function apply(idx, setSel) {
  setSel(idx);
  ctx.model.__ccSel = idx;
  await applyFilter(idx);
}

function ConditionCards() {
  const [sel, setSel] = useState(ctx.model.__ccSel != null ? ctx.model.__ccSel : -1);
  const variant = $p.variant || 'stat';
  const counts = useOptionCounts($p.showCounts !== false);
  const items = [{ label: $p.allLabel || 'All', idx: -1 }].concat(
    options.map(function (o, i) { return { label: o.label, idx: i }; })
  );
  const countOf = function (idx) {
    if (!counts) return null;
    return idx === -1 ? counts.all : counts.byIdx[idx];
  };

  if (variant === 'bars') {
    const max = items.reduce(function (m, o) { const c = countOf(o.idx); return c != null && c > m ? c : m; }, 1);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 4 }}>
        {items.map(function (o) {
          const active = sel === o.idx;
          const c = countOf(o.idx);
          const pct = c != null ? Math.max(4, Math.round((c / max) * 100)) : 0;
          return (
            <div key={o.idx} onClick={function () { apply(o.idx, setSel); }}
              style={{ cursor: 'pointer', padding: '5px 10px', borderRadius: 6, background: active ? T.primary + '14' : T.bg, border: '1px solid ' + (active ? T.primary : T.border) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: active ? T.primary : T.text, fontWeight: active ? 600 : 400 }}>{o.label}</span>
                <b style={{ color: active ? T.primary : T.sub }}>{c != null ? c : ''}</b>
              </div>
              {c != null ? <div style={{ height: 5, borderRadius: 3, background: T.card, overflow: 'hidden' }}>
                <div style={{ width: pct + '%', height: '100%', borderRadius: 3, background: active ? T.gradient : T.primary, opacity: active ? 1 : 0.55 }} />
              </div> : null}
            </div>
          );
        })}
      </div>
    );
  }

  function cardStyle(active) {
    const base = { cursor: 'pointer', transition: 'all .15s', userSelect: 'none' };
    if (variant === 'tile') return Object.assign(base, {
      padding: '8px 12px', borderRadius: 6, minWidth: 110,
      background: active ? T.primary + '10' : T.bg,
      border: '1px solid ' + (active ? T.primary : T.border),
      borderLeft: '3px solid ' + (active ? T.primary : T.border),
    });
    if (variant === 'gradient') return Object.assign(base, {
      padding: '10px 14px', borderRadius: 8, minWidth: 110,
      background: active ? T.gradient : T.bg,
      border: active ? 'none' : '1px solid ' + T.border,
      color: active ? '#fff' : T.text,
    });
    if (variant === 'outline') return Object.assign(base, {
      padding: '8px 12px', borderRadius: 8, minWidth: 100,
      background: 'transparent',
      border: '1.5px solid ' + (active ? T.primary : T.border),
    });
    if (variant === 'chip') return Object.assign(base, {
      padding: '3px 6px 3px 12px', borderRadius: 16, display: 'inline-flex', alignItems: 'center', gap: 8,
      background: active ? T.primary : T.card,
      border: '1px solid ' + (active ? T.primary : T.border),
    });
    // stat (default)
    return Object.assign(base, {
      padding: '10px 14px', borderRadius: 8, minWidth: 110,
      background: active ? T.card : T.bg,
      border: '1px solid ' + (active ? T.primary : T.border),
      boxShadow: active ? '0 0 0 2px ' + T.primary + '22' : 'none',
    });
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: 4 }}>
      {items.map(function (o) {
        const active = sel === o.idx;
        const c = countOf(o.idx);
        if (variant === 'chip') {
          return (
            <span key={o.idx} onClick={function () { apply(o.idx, setSel); }} style={cardStyle(active)}>
              <span style={{ fontSize: 12, color: active ? '#fff' : T.text }}>{o.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '0 7px', borderRadius: 10, background: active ? 'rgba(255,255,255,0.25)' : T.bg, color: active ? '#fff' : T.sub, border: active ? 'none' : '1px solid ' + T.border }}>
                {c != null ? c : '—'}
              </span>
            </span>
          );
        }
        const onGradient = variant === 'gradient' && active;
        return (
          <div key={o.idx} onClick={function () { apply(o.idx, setSel); }} style={cardStyle(active)}>
            <div style={{ fontSize: 11, color: onGradient ? 'rgba(255,255,255,0.85)' : T.sub }}>{o.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, color: onGradient ? '#fff' : active ? T.primary : T.text }}>
              {c != null ? c : '—'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

ctx.render(<ConditionCards />);
```
