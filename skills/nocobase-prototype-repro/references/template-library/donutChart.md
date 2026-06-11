# `donutChart` — Donut chart

Share-of-total donut with legend, colored by the field’s options

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Stats

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  |  |
| `field` | field | ✓ |  | coll←collection |
| `label` | text |  |  |  |
| `variant` | styleSelect |  | `default` | opts: default/pie/half-donut/bars/progress-ring/stacked-bar/gauge |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

const enumOpts = Array.isArray($p.field__enum) ? $p.field__enum : [];
const COLOR = { blue: '#1677ff', green: '#52c41a', gold: '#faad14', volcano: '#fa541c', purple: '#722ed1', magenta: '#eb2f96', cyan: '#13c2c2', geekblue: '#2f54eb', orange: '#fa8c16', lime: '#a0d911', red: '#f5222d' };
const FALLBACK = ['#1677ff', '#52c41a', '#faad14', '#fa541c', '#722ed1', '#13c2c2', '#eb2f96', '#a0d911'];

function Donut() {
  const [parts, setParts] = useState(null);
  useEffect(function () {
    (async function () {
      try {
        ctx.initResource('MultiRecordResource');
        ctx.resource.setResourceName($p.collection);
        ctx.resource.setPageSize(500);
        await ctx.resource.refresh();
        const rows = ctx.resource.getData() || [];
        const counts = {};
        rows.forEach(function (r) { const v = r[$p.field]; if (v != null && v !== '') counts[String(v)] = (counts[String(v)] || 0) + 1; });
        let arr = Object.keys(counts).map(function (k, i) {
          const o = enumOpts.find(function (e) { return String(e.value) === k; });
          return { label: (o && o.label) || k, count: counts[k], color: (o && o.color && COLOR[o.color]) || FALLBACK[i % FALLBACK.length] };
        });
        arr.sort(function (a, b) { return b.count - a.count; });
        setParts(arr.slice(0, 8));
      } catch (e) { setParts([]); }
    })();
  }, []);

  if (parts == null) return <div style={{ padding: 12, color: T.sub }}>Loading…</div>;
  if (!parts.length) return <div style={{ padding: 12, color: T.sub }}>No data.</div>;

  const total = parts.reduce(function (a, p2) { return a + p2.count; }, 0) || 1;
  const variant = $p.variant || 'default';
  const wrap = { padding: '14px 16px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border };

  const legend = (
    <div style={{ minWidth: 150 }}>
      {parts.map(function (p2, i) {
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12.5 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: p2.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: T.sub }}>{p2.label}</span>
            <b style={{ color: T.text }}>{Math.round((p2.count / total) * 100)}%</b>
          </div>
        );
      })}
    </div>
  );

  if (variant === 'bars') {
    const maxC = parts.reduce(function (m, p2) { return Math.max(m, p2.count); }, 0) || 1;
    return (
      <div style={wrap}>
        {$p.label ? <div style={{ fontWeight: 600, marginBottom: 10, color: T.text }}>{$p.label}</div> : null}
        {parts.map(function (p2, i) {
          return (
            <div key={i} style={{ marginBottom: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                <span style={{ color: T.sub }}>{p2.label}</span>
                <span><b style={{ color: T.text }}>{p2.count}</b> <span style={{ color: T.sub }}>· {Math.round((p2.count / total) * 100)}%</span></span>
              </div>
              <div style={{ background: T.card, borderRadius: 5, height: 9 }}>
                <div style={{ width: (p2.count / maxC) * 100 + '%', height: '100%', background: p2.color, borderRadius: 5 }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (variant === 'progress-ring') {
    return (
      <div style={wrap}>
        {$p.label ? <div style={{ fontWeight: 600, marginBottom: 10, color: T.text }}>{$p.label}</div> : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {parts.map(function (p2, i) {
            const frac = p2.count / total;
            const R = 24, CIRC = 2 * Math.PI * R;
            return (
              <div key={i} style={{ textAlign: 'center', width: 72 }}>
                <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto' }}>
                  <svg width="64" height="64">
                    <circle cx="32" cy="32" r={R} fill="none" stroke={T.card} strokeWidth="7" />
                    <circle cx="32" cy="32" r={R} fill="none" stroke={p2.color} strokeWidth="7" strokeLinecap="round"
                      strokeDasharray={(frac * CIRC) + ' ' + CIRC} transform="rotate(-90 32 32)" />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, color: T.text }}>{Math.round(frac * 100)}%</div>
                </div>
                <div style={{ fontSize: 11.5, color: T.sub, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p2.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (variant === 'stacked-bar') {
    return (
      <div style={wrap}>
        {$p.label ? <div style={{ fontWeight: 600, marginBottom: 10, color: T.text }}>{$p.label}</div> : null}
        <div style={{ display: 'flex', height: 26, borderRadius: 7, overflow: 'hidden', border: '1px solid ' + T.border }}>
          {parts.map(function (p2, i) {
            const pct = (p2.count / total) * 100;
            return <div key={i} title={p2.label} style={{ width: pct + '%', background: p2.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>{pct >= 12 ? Math.round(pct) + '%' : ''}</div>;
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 12 }}>
          {parts.map(function (p2, i) {
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: p2.color }} />
                <span style={{ color: T.sub }}>{p2.label}</span>
                <b style={{ color: T.text }}>{Math.round((p2.count / total) * 100)}%</b>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (variant === 'gauge') {
    // a 270° gauge: the largest segment's share against the whole
    const top = parts[0];
    const frac = top.count / total;
    const R = 54, CIRC = 2 * Math.PI * R, sweep = 0.75; // 270°
    return (
      <div style={wrap}>
        {$p.label ? <div style={{ fontWeight: 600, marginBottom: 6, color: T.text }}>{$p.label}</div> : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 140, height: 124, flexShrink: 0 }}>
            <svg width="140" height="124">
              <circle cx="70" cy="70" r={R} fill="none" stroke={T.card} strokeWidth="14" strokeLinecap="round"
                strokeDasharray={(sweep * CIRC) + ' ' + CIRC} transform="rotate(135 70 70)" />
              <circle cx="70" cy="70" r={R} fill="none" stroke={top.color} strokeWidth="14" strokeLinecap="round"
                strokeDasharray={(frac * sweep * CIRC) + ' ' + CIRC} transform="rotate(135 70 70)" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: top.color }}>{Math.round(frac * 100) + '%'}</div>
                <div style={{ fontSize: 11, color: T.sub, marginTop: 3, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{top.label}</div>
              </div>
            </div>
          </div>
          {legend}
        </div>
      </div>
    );
  }

  // svg arc charts (default donut / pie / half-donut)
  const half = variant === 'half-donut';
  const R = 52, CIRC = 2 * Math.PI * R;
  const span = half ? 0.5 : 1; // half-donut only sweeps the top semicircle
  const stroke = variant === 'pie' ? 52 : 22; // pie = solid (stroke == radius)
  let offset = 0;
  const arcs = parts.map(function (p2, i) {
    const frac = (p2.count / total) * span;
    const seg = (
      <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={p2.color} strokeWidth={stroke}
        strokeDasharray={(frac * CIRC) + ' ' + CIRC} strokeDashoffset={-offset * CIRC}
        transform="rotate(-90 70 70)" />
    );
    offset += frac;
    return seg;
  });

  const svgH = half ? 78 : 140;
  return (
    <div style={wrap}>
      {$p.label ? <div style={{ fontWeight: 600, marginBottom: 10, color: T.text }}>{$p.label}</div> : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 140, height: svgH, flexShrink: 0 }}>
          <svg width="140" height={svgH}>{arcs}</svg>
          {variant === 'default' ? (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: T.text }}>{total}</div>
                <div style={{ fontSize: 10, color: T.sub, marginTop: 2 }}>total</div>
              </div>
            </div>
          ) : null}
          {half ? (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, textAlign: 'center' }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{total}</span>
              <span style={{ fontSize: 10, color: T.sub, marginLeft: 4 }}>total</span>
            </div>
          ) : null}
        </div>
        {legend}
      </div>
    </div>
  );
}

ctx.render(<Donut />);
```
