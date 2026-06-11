# `trendKpi` — Trend KPI (vs last period)

Current vs previous period with delta % and a sparkline — day / week / month over period

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Stats

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  |  |
| `dateField` | field | ✓ |  | accepts date, coll←collection |
| `period` | select |  | `month` | opts: day/week/month |
| `valueMode` | select |  | `count` | opts: count/sum |
| `numField` | field |  |  | accepts numeric, coll←collection |
| `label` | text |  | `This period` |  |
| `variant` | styleSelect |  | `spark` | opts: spark/arrow/bars/compact |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { useState, useEffect } = ctx.React;

const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0', gradient: 'linear-gradient(135deg,#1677ff,#13c2c2)' };

function startOf(period, d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  if (period === 'week') { const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); }
  if (period === 'month') x.setDate(1);
  return x;
}
function prevStart(period, cur) {
  const x = new Date(cur);
  if (period === 'day') x.setDate(x.getDate() - 1);
  if (period === 'week') x.setDate(x.getDate() - 7);
  if (period === 'month') x.setMonth(x.getMonth() - 1);
  return x;
}
function fmt(n) {
  if (Math.abs(n) >= 10000) return (n / 1000).toFixed(1) + 'k';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function TrendKpi() {
  const [st, setSt] = useState(null);
  useEffect(function () {
    (async function () {
      try {
        const period = $p.period || 'month';
        const curS = startOf(period, new Date());
        const prevS = prevStart(period, curS);
        const fields = [$p.dateField].concat($p.valueMode === 'sum' && $p.numField ? [$p.numField] : []);
        const flt = {}; flt[$p.dateField] = { $dateAfter: prevS.toISOString() };
        const res = await ctx.api.request({ url: $p.collection + ':list', params: { pageSize: 1000, fields: fields, filter: flt } });
        const rows = (res && res.data && res.data.data) || [];
        let cur = 0, prev = 0;
        const SLICES = 12;
        const span = Date.now() - prevS.getTime();
        const buckets = new Array(SLICES).fill(0);
        rows.forEach(function (r) {
          const t = new Date(r[$p.dateField]).getTime();
          if (isNaN(t)) return;
          const v = $p.valueMode === 'sum' ? (Number(r[$p.numField]) || 0) : 1;
          if (t >= curS.getTime()) cur += v; else prev += v;
          const idx = Math.min(SLICES - 1, Math.max(0, Math.floor(((t - prevS.getTime()) / span) * SLICES)));
          buckets[idx] += v;
        });
        setSt({ cur: cur, prev: prev, buckets: buckets });
      } catch (e) { setSt({ cur: 0, prev: 0, buckets: [] }); }
    })();
  }, []);
  if (!st) return <div style={{ padding: 16, color: T.sub }}>Loading…</div>;

  const delta = st.prev > 0 ? ((st.cur - st.prev) / st.prev) * 100 : (st.cur > 0 ? 100 : 0);
  const up = delta >= 0;
  const dColor = up ? '#52c41a' : '#f5222d';
  const variant = $p.variant || 'spark';
  const max = Math.max.apply(null, [1].concat(st.buckets));
  const W = 120, H = 36;
  const pts = st.buckets.map(function (v, i) {
    return (i / (st.buckets.length - 1 || 1)) * W + ',' + (H - (v / max) * (H - 4) - 2);
  }).join(' ');

  if (variant === 'compact') {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, padding: '8px 14px', background: T.bg, border: '1px solid ' + T.border, borderRadius: 8 }}>
        <span style={{ fontSize: 12, color: T.sub }}>{$p.label || 'This period'}</span>
        <b style={{ fontSize: 18, color: T.text }}>{fmt(st.cur)}</b>
        <span style={{ fontSize: 12, fontWeight: 700, color: dColor }}>{up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%</span>
        <span style={{ fontSize: 11, color: T.sub }}>prev {fmt(st.prev)}</span>
      </div>
    );
  }

  return (
    <div style={{ padding: 14, background: T.bg, border: '1px solid ' + T.border, borderRadius: 10, display: 'inline-block', minWidth: 200 }}>
      <div style={{ fontSize: 12, color: T.sub }}>{$p.label || 'This period'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: T.text, lineHeight: 1 }}>{fmt(st.cur)}</span>
        {variant === 'arrow' ? (
          <span style={{ fontSize: 22, fontWeight: 800, color: dColor }}>{up ? '↗' : '↘'}</span>
        ) : null}
        <span style={{ fontSize: 12, fontWeight: 700, color: dColor, background: dColor + '1a', padding: '1px 8px', borderRadius: 10 }}>
          {up ? '+' : ''}{delta.toFixed(1)}%
        </span>
      </div>
      <div style={{ marginTop: 8 }}>
        {variant === 'bars' ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: H }}>
            {st.buckets.map(function (v, i) {
              return <span key={i} style={{ width: 7, height: Math.max(3, (v / max) * H), borderRadius: 2, background: i >= st.buckets.length / 2 ? T.primary : T.border }} />;
            })}
          </div>
        ) : (
          <svg width={W} height={H} style={{ display: 'block' }}>
            <polyline points={pts} fill="none" stroke={T.primary} strokeWidth="2" strokeLinejoin="round" />
            <polygon points={'0,' + H + ' ' + pts + ' ' + W + ',' + H} fill={T.primary + '22'} stroke="none" />
          </svg>
        )}
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: T.sub }}>previous: {fmt(st.prev)}</div>
    </div>
  );
}

ctx.render(<TrendKpi />);
```
