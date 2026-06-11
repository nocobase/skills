# `conditionMenu` — Condition side menu

A vertical menu of condition sets with count badges — click to filter target blocks

**kind** `block` · **scope** `collection` · **category** Filter

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `targets` | targetBlock | ✓ |  | The data blocks on this page that react to this component |
| `options` | filterOptions | ✓ |  | coll←target:targets, Each option = one menu entry. Native Data Scope conditions / SQL / JS |
| `variant` | styleSelect |  | `list` | opts: list/rail/pills/boxed/numbered/dots |
| `title` | text |  |  |  |
| `allLabel` | text |  | `All` |  |
| `showCounts` | boolean |  | `true` |  |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { useState } = ctx.React;

const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0', gradient: 'linear-gradient(135deg,#1677ff,#13c2c2)' };

const FILTER_KEY = 'jsTplCondMenu:' + (ctx.model && ctx.model.uid);

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
  ctx.model.__cmSel = idx;
  await applyFilter(idx);
}

function ConditionMenu() {
  const [sel, setSel] = useState(ctx.model.__cmSel != null ? ctx.model.__cmSel : -1);
  const variant = $p.variant || 'list';
  const counts = useOptionCounts($p.showCounts !== false);
  const items = [{ label: $p.allLabel || 'All', idx: -1 }].concat(
    options.map(function (o, i) { return { label: o.label, idx: i }; })
  );
  const countOf = function (idx) {
    if (!counts) return null;
    return idx === -1 ? counts.all : counts.byIdx[idx];
  };

  function rowStyle(active) {
    const base = {
      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 10px', fontSize: 13, userSelect: 'none', transition: 'all .15s',
      color: active ? T.primary : T.text, fontWeight: active ? 600 : 400,
    };
    if (variant === 'rail') return Object.assign(base, {
      borderLeft: '3px solid ' + (active ? T.primary : 'transparent'),
      background: active ? T.primary + '0d' : 'transparent',
    });
    if (variant === 'pills') return Object.assign(base, {
      borderRadius: 16, margin: '2px 0',
      background: active ? T.primary : 'transparent',
      color: active ? '#fff' : T.text,
    });
    if (variant === 'boxed') return Object.assign(base, {
      borderRadius: 6, margin: '3px 0',
      border: '1px solid ' + (active ? T.primary : T.border),
      background: active ? T.primary + '10' : T.bg,
    });
    // list / numbered / dots
    return Object.assign(base, {
      borderRadius: 6,
      background: active ? T.card : 'transparent',
    });
  }

  return (
    <div style={{ padding: '8px 6px', background: variant === 'boxed' ? 'transparent' : T.bg }}>
      {$p.title ? <div style={{ fontSize: 13, fontWeight: 700, color: T.text, padding: '0 10px 8px' }}>{$p.title}</div> : null}
      {items.map(function (o, pos) {
        const active = sel === o.idx;
        const c = countOf(o.idx);
        const pillActive = variant === 'pills' && active;
        return (
          <div key={o.idx} onClick={function () { apply(o.idx, setSel); }} style={rowStyle(active)}>
            {variant === 'numbered' ? (
              <span style={{ width: 18, height: 18, borderRadius: '50%', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center', background: active ? T.primary : T.card, color: active ? '#fff' : T.sub, border: active ? 'none' : '1px solid ' + T.border, flexShrink: 0 }}>{pos}</span>
            ) : variant === 'dots' ? (
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? T.primary : T.border, flexShrink: 0 }} />
            ) : null}
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
            {c != null ? (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '0 7px', borderRadius: 10, background: pillActive ? 'rgba(255,255,255,0.25)' : active ? T.primary + '1a' : T.card, color: pillActive ? '#fff' : active ? T.primary : T.sub, border: pillActive || active ? 'none' : '1px solid ' + T.border }}>
                {c}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

ctx.render(<ConditionMenu />);
```
