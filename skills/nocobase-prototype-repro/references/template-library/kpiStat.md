# `kpiStat` — KPI stat card

A big-number card — aggregate / SQL / JS value, 10 styles

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Stats

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `valueSource` | select |  | `aggregate` | opts: aggregate/sql/js |
| `collection` | collection |  |  |  |
| `fn` | select |  | `count` | opts: count/sum/avg/max/min |
| `field` | field |  |  | accepts numeric, coll←collection, The numeric field to aggregate. |
| `sql` | code |  | `SELECT count(*) AS value FROM users` | First cell of the first row is the value |
| `jsExpr` | code |  | `const res = await ctx.api.request({ url: 'users:list', params: { pageSize: 1 } });
return res.data.meta.count;` | Async JS with ctx available (ctx.api / ctx.sql …) — return the number |
| `label` | text |  |  |  |
| `prefix` | text |  |  |  |
| `suffix` | text |  |  |  |
| `variant` | styleSelect |  | `minimal` | opts: minimal/gradient/icon/outline/bigNumber/sparkline/ring/badge/splitAccent/glass |
| `icon` | text |  | `📊` |  |
| `enablePopup` | boolean |  | `false` |  |
| `popupMode` | select |  | `records` | opts: records/view |
| `popupViewUid` | popupView |  |  | A “View” action already configured on a table of this page |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
async function __resolveValue() {
  const src = $p.valueSource || 'aggregate';
  if (src === 'none') return null;
  if (src === 'sql') {
    if (!$p.sqlUid) return null;
    // configurators keep the registered SQL in sync after manual edits
    if (ctx.flowSettingsEnabled && ctx.sql && ctx.sql.save) {
      try { await ctx.sql.save({ uid: $p.sqlUid, sql: $p.sql, dataSourceKey: 'main' }); } catch (e) {}
    }
    const data = await ctx.sql.runById($p.sqlUid, { type: 'selectRows' });
    const row = Array.isArray(data) ? data[0] : data;
    if (row && typeof row === 'object') { const k = Object.keys(row)[0]; return Number(row[k]); }
    return row == null ? null : Number(row);
  }
  if (src === 'js') {
    const fn = new Function('ctx', 'return (async function () {\n' + ($p.jsExpr || 'return null;') + '\n})()');
    const v = await fn(ctx);
    return v == null ? null : Number(v);
  }
  // aggregate
  if (!$p.collection) return null;
  ctx.initResource('MultiRecordResource');
  ctx.resource.setResourceName($p.collection);
  ctx.resource.setPageSize(!$p.fn || $p.fn === 'count' ? 1 : 500); // sum/avg over up to 500 rows
  await ctx.resource.refresh();
  const meta = ctx.resource.getMeta ? ctx.resource.getMeta() : {};
  const rows = ctx.resource.getData() || [];
  if (!$p.fn || $p.fn === 'count') return meta && meta.count != null ? meta.count : rows.length;
  const nums = rows.map(function (r) { return Number(r[$p.field]); }).filter(function (n) { return !isNaN(n); });
  if (!nums.length) return 0;
  if ($p.fn === 'sum') return nums.reduce(function (a, b) { return a + b; }, 0);
  if ($p.fn === 'avg') return nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
  if ($p.fn === 'max') return Math.max.apply(null, nums);
  if ($p.fn === 'min') return Math.min.apply(null, nums);
  return null;
}

async function __openListPopup() {
  if ($p.popupMode === 'view' && $p.popupViewUid) {
    let tk = null;
    try { const r = typeof __resolveRecord === 'function' ? await __resolveRecord() : null; tk = r && r.id; } catch (e) {}
    ctx.openView($p.popupViewUid, tk != null ? { mode: 'drawer', filterByTk: tk, params: { filterByTk: tk } } : { mode: 'drawer' });
    return;
  }
  let url = null;
  try { if (typeof __popupListUrl === 'function') url = await __popupListUrl(); } catch (e) {}
  if (!url && $p.collection) url = $p.collection + ':list';
  if (!url) return;
  try {
    const res = await ctx.api.request({ url: url, params: { pageSize: 20, sort: ['-id'] } });
    const rows = (res && res.data && res.data.data) || [];
    const count = res && res.data && res.data.meta && res.data.meta.count;
    const { Empty } = ctx.antd;
    const cols = rows.length
      ? Object.keys(rows[0]).filter(function (k) { const v = rows[0][k]; return v == null || typeof v !== 'object'; }).slice(0, 5)
      : [];
    ctx.viewer.drawer({
      width: '50%',
      title: ($p.label || $p.collection || 'Records') + (count != null ? ' · ' + count : ''),
      content: rows.length ? (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>{cols.map(function (c) { return <th key={c} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '2px solid #f0f0f0', color: '#888', fontWeight: 500 }}>{c}</th>; })}</tr>
          </thead>
          <tbody>
            {rows.map(function (r, i) {
              return <tr key={i}>{cols.map(function (c) { const v = r[c]; return <td key={c} style={{ padding: '6px 10px', borderBottom: '1px solid #f5f5f5' }}>{v == null || v === '' ? '—' : String(v)}</td>; })}</tr>;
            })}
          </tbody>
        </table>
      ) : <Empty />,
    });
  } catch (e) { ctx.message && ctx.message.error('Load failed: ' + ((e && e.message) || e)); }
}
function ClickWrap(props) {
  if (!$p.enablePopup) return props.children;
  return <a onClick={__openListPopup} style={{ display: 'block', color: 'inherit', cursor: 'pointer' }}>{props.children}</a>;
}

const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0', gradient: 'linear-gradient(135deg,#1677ff,#13c2c2)' };

function Kpi() {
  const [val, setVal] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(function () {
    (async function () {
      try { setVal(await __resolveValue()); }
      catch (e) { setErr((e && e.message) || 'failed'); setVal(null); }
    })();
  }, []);

  const fmt = function (v) {
    if (v == null) return '—';
    const n = Number(v);
    if (isNaN(n)) return String(v);
    return n.toLocaleString('en-US', { maximumFractionDigits: $p.fn === 'avg' ? 2 : 0 });
  };
  const title = $p.label || $p.collection || '';
  const num = ($p.prefix || '') + fmt(val) + ($p.suffix ? ' ' + $p.suffix : '');
  const icon = $p.icon || '📊';
  if (err) return <div style={{ padding: 12, color: '#cf1322', fontSize: 12 }}>{err}</div>;

  const v = $p.variant || 'minimal';

  if (v === 'gradient') {
    return (
      <div style={{ padding: '16px 18px', background: T.gradient, borderRadius: 10, color: '#fff', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -24, top: -24, width: 110, height: 110, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{num}</div>
      </div>
    );
  }
  if (v === 'icon') {
    return (
      <div style={{ padding: '14px 16px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: T.card, border: '1px solid ' + T.border, display: 'grid', placeItems: 'center', fontSize: 22, flexShrink: 0 }}>
          {icon}
        </span>
        <span>
          <span style={{ display: 'block', fontSize: 12, color: T.sub }}>{title}</span>
          <span style={{ display: 'block', fontSize: 24, fontWeight: 700, color: T.text, lineHeight: 1.15 }}>{num}</span>
        </span>
      </div>
    );
  }
  if (v === 'outline') {
    return (
      <div style={{ padding: '14px 18px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border, borderLeft: '4px solid ' + T.primary }}>
        <div style={{ fontSize: 13, color: T.sub, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: T.primary, lineHeight: 1 }}>{num}</div>
      </div>
    );
  }
  if (v === 'bigNumber') {
    return (
      <div style={{ padding: '14px 18px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border, textAlign: 'center' }}>
        <div style={{ fontSize: 40, fontWeight: 800, color: T.text, lineHeight: 1, letterSpacing: '-0.02em' }}>{num}</div>
        <div style={{ fontSize: 12, color: T.sub, marginTop: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</div>
      </div>
    );
  }
  if (v === 'sparkline') {
    const pts = [0.45, 0.3, 0.55, 0.4, 0.7, 0.6, 0.92];
    const W = 120, H = 34, n = pts.length;
    const path = pts.map(function (p, i) { return (i === 0 ? 'M' : 'L') + (i / (n - 1) * W).toFixed(1) + ' ' + ((1 - p) * H).toFixed(1); }).join(' ');
    const area = path + ' L' + W + ' ' + H + ' L0 ' + H + ' Z';
    return (
      <div style={{ padding: '14px 18px 10px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border, overflow: 'hidden' }}>
        <div style={{ fontSize: 13, color: T.sub, marginBottom: 4 }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: T.text, lineHeight: 1 }}>{num}</div>
          <svg width={W} height={H} viewBox={'0 0 ' + W + ' ' + H} style={{ flexShrink: 0 }}>
            <path d={area} fill={T.primary} opacity={0.12} />
            <path d={path} fill="none" stroke={T.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={W} cy={(1 - pts[n - 1]) * H} r={3} fill={T.primary} />
          </svg>
        </div>
      </div>
    );
  }
  if (v === 'ring') {
    const pct = 0.72, R = 26, C = 2 * Math.PI * R;
    return (
      <div style={{ padding: '14px 16px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
          <svg width={64} height={64}>
            <circle cx={32} cy={32} r={R} fill="none" stroke={T.card} strokeWidth={7} />
            <circle cx={32} cy={32} r={R} fill="none" stroke={T.primary} strokeWidth={7} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 32 32)" />
          </svg>
          <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, color: T.primary }}>72%</span>
        </div>
        <span>
          <span style={{ display: 'block', fontSize: 12, color: T.sub }}>{title}</span>
          <span style={{ display: 'block', fontSize: 24, fontWeight: 700, color: T.text, lineHeight: 1.15 }}>{num}</span>
        </span>
      </div>
    );
  }
  if (v === 'badge') {
    return (
      <div style={{ padding: '16px 18px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border, position: 'relative', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', right: 12, top: 12, width: 32, height: 32, borderRadius: 10, background: T.gradient, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 17 }}>{icon}</span>
        <div style={{ fontSize: 13, color: T.sub, marginBottom: 6, paddingRight: 40 }}>{title}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: T.text, lineHeight: 1 }}>{num}</div>
      </div>
    );
  }
  if (v === 'splitAccent') {
    return (
      <div style={{ display: 'flex', alignItems: 'stretch', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border, overflow: 'hidden' }}>
        <div style={{ width: 56, background: T.gradient, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 24, flexShrink: 0 }}>{icon}</div>
        <div style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 12, color: T.sub, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: T.text, lineHeight: 1 }}>{num}</div>
        </div>
      </div>
    );
  }
  if (v === 'glass') {
    return (
      <div style={{ padding: 2, borderRadius: 14, background: T.gradient }}>
        <div style={{ padding: '16px 18px', borderRadius: 12, background: T.dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.62)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid ' + (T.dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.6)') }}>
          <div style={{ fontSize: 13, color: T.sub, marginBottom: 6 }}>{title}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: T.text, lineHeight: 1 }}>{num}</div>
        </div>
      </div>
    );
  }
  // minimal (default)
  return (
    <div style={{ padding: '16px 18px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
      <div style={{ fontSize: 13, color: T.sub, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: T.text, lineHeight: 1 }}>{num}</div>
      <div style={{ marginTop: 10, height: 3, width: 44, borderRadius: 2, background: T.primary }} />
    </div>
  );
}

ctx.render(<ClickWrap><Kpi /></ClickWrap>);
```
