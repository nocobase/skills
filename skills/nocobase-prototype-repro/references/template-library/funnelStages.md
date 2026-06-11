# `funnelStages` — Sales funnel

Stage funnel with counts and step conversion rates

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Stats

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  |  |
| `stageField` | field | ✓ |  | accepts enum, coll←collection, A select field — funnel steps follow its option order |
| `label` | text |  |  |  |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

const enumOpts = Array.isArray($p.stageField__enum) ? $p.stageField__enum : [];
const COLOR = { blue: '#1677ff', green: '#52c41a', gold: '#faad14', volcano: '#fa541c', purple: '#722ed1', magenta: '#eb2f96', cyan: '#13c2c2', geekblue: '#2f54eb', orange: '#fa8c16', lime: '#a0d911', red: '#f5222d' };

function Funnel() {
  const [counts, setCounts] = useState(null);
  useEffect(function () {
    (async function () {
      try {
        ctx.initResource('MultiRecordResource');
        ctx.resource.setResourceName($p.collection);
        ctx.resource.setPageSize(500);
        await ctx.resource.refresh();
        const rows = ctx.resource.getData() || [];
        const c = {};
        rows.forEach(function (r) { const v = r[$p.stageField]; if (v != null) c[String(v)] = (c[String(v)] || 0) + 1; });
        setCounts(c);
      } catch (e) { setCounts({}); }
    })();
  }, []);

  if (counts == null) return <div style={{ padding: 12, color: T.sub }}>Loading…</div>;

  // funnel steps follow the field's native option order
  const steps = enumOpts.map(function (o) {
    return { label: o.label || String(o.value), count: counts[String(o.value)] || 0, color: (o.color && COLOR[o.color]) || T.primary };
  });
  if (!steps.length) return <div style={{ padding: 12, color: T.sub }}>Stage field has no options.</div>;
  const max = steps.reduce(function (m, s) { return Math.max(m, s.count); }, 0) || 1;

  return (
    <div style={{ padding: '12px 16px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
      {$p.label ? <div style={{ fontWeight: 600, color: T.text, marginBottom: 10 }}>{$p.label}</div> : null}
      {steps.map(function (s, i) {
        const prev = i > 0 ? steps[i - 1].count : null;
        const conv = prev ? Math.round((s.count / prev) * 100) : null;
        const w = Math.max(8, Math.round((s.count / max) * 100));
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: T.sub }}>{s.label}</span>
              <span>
                <b style={{ color: T.text }}>{s.count}</b>
                {conv != null ? <span style={{ color: conv >= 50 ? '#52c41a' : '#faad14', marginLeft: 8, fontSize: 11 }}>{'↳ ' + conv + '%'}</span> : null}
              </span>
            </div>
            <div style={{ height: 14, borderRadius: 7, width: w + '%', background: s.color, opacity: 0.85, margin: '0 auto', transition: 'width .3s' }} />
          </div>
        );
      })}
    </div>
  );
}

ctx.render(<Funnel />);
```
