# `tagCloud` — Tag cloud

A field’s values sized by frequency — cloud / pills / bubbles

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Stats

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  |  |
| `field` | field | ✓ |  | coll←collection, Enum / text field — each distinct value becomes a tag |
| `limit` | number |  | `24` |  |
| `variant` | styleSelect |  | `cloud` | opts: cloud/pills/bubbles/rows |
| `title` | text |  |  |  |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { useState, useEffect } = ctx.React;

const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0', gradient: 'linear-gradient(135deg,#1677ff,#13c2c2)' };


function labelOf(enumList, v) {
  if (v === null || v === undefined || v === '') return '—';
  const hit = (enumList || []).find(function (o) { return String(o.value) === String(v); });
  return hit ? hit.label : String(v);
}

function TagCloud() {
  const [tags, setTags] = useState(null);
  useEffect(function () {
    (async function () {
      try {
        const res = await ctx.api.request({ url: $p.collection + ':list', params: { pageSize: 800, fields: [$p.field] } });
        const rows = (res && res.data && res.data.data) || [];
        const counts = {};
        rows.forEach(function (r) {
          const v = r[$p.field];
          if (v === null || v === undefined || v === '') return;
          (Array.isArray(v) ? v : [v]).forEach(function (one) {
            const k = String(one);
            counts[k] = (counts[k] || 0) + 1;
          });
        });
        const list = Object.keys(counts).map(function (k) { return { v: k, n: counts[k] }; });
        list.sort(function (a, b) { return b.n - a.n; });
        setTags(list.slice(0, $p.limit || 24));
      } catch (e) { setTags([]); }
    })();
  }, []);
  if (!tags) return <div style={{ padding: 16, color: T.sub }}>Loading…</div>;
  if (!tags.length) return <div style={{ padding: 16, color: T.sub }}>No values</div>;

  const max = tags[0].n, min = tags[tags.length - 1].n;
  const variant = $p.variant || 'cloud';
  function scale(n, lo, hi) { return lo + ((n - min) / ((max - min) || 1)) * (hi - lo); }

  let bodyEl = null;
  if (variant === 'rows') {
    bodyEl = (
      <div>
        {tags.slice(0, 10).map(function (t, i) {
          return (
            <div key={t.v} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <span style={{ width: 16, fontSize: 11, color: T.sub, textAlign: 'right' }}>{i + 1}</span>
              <span style={{ flex: '0 0 110px', fontSize: 12, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelOf($p.field__enum, t.v)}</span>
              <span style={{ flex: 1, height: 6, borderRadius: 3, background: T.card, overflow: 'hidden' }}>
                <span style={{ display: 'block', width: Math.max(4, (t.n / max) * 100) + '%', height: '100%', borderRadius: 3, background: T.primary, opacity: 0.4 + 0.6 * (t.n / max) }} />
              </span>
              <b style={{ fontSize: 12, color: T.text, width: 30, textAlign: 'right' }}>{t.n}</b>
            </div>
          );
        })}
      </div>
    );
  } else if (variant === 'bubbles') {
    bodyEl = (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
        {tags.map(function (t) {
          const d = Math.round(scale(t.n, 34, 74));
          return (
            <span key={t.v} title={t.n + ''} style={{ width: d, height: d, borderRadius: '50%', background: T.primary, opacity: 0.35 + 0.65 * (t.n / max), color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', textAlign: 'center', overflow: 'hidden' }}>
              <span style={{ fontSize: Math.max(9, d / 5.5), fontWeight: 600, lineHeight: 1.1, padding: '0 4px', maxWidth: d - 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelOf($p.field__enum, t.v)}</span>
              <span style={{ fontSize: Math.max(8, d / 7), opacity: 0.85 }}>{t.n}</span>
            </span>
          );
        })}
      </div>
    );
  } else if (variant === 'pills') {
    bodyEl = (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tags.map(function (t) {
          return (
            <span key={t.v} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 4px 2px 10px', borderRadius: 14, fontSize: 12, background: T.card, border: '1px solid ' + T.border, color: T.text }}>
              {labelOf($p.field__enum, t.v)}
              <span style={{ padding: '0 7px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: T.primary, color: '#fff', opacity: 0.45 + 0.55 * (t.n / max) }}>{t.n}</span>
            </span>
          );
        })}
      </div>
    );
  } else {
    bodyEl = (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'baseline', justifyContent: 'center' }}>
        {tags.map(function (t, i) {
          return (
            <span key={t.v} title={t.n + ''} style={{ fontSize: Math.round(scale(t.n, 12, 28)), fontWeight: t.n === max ? 800 : 600, color: i % 3 === 0 ? T.primary : T.text, opacity: 0.5 + 0.5 * (t.n / max), lineHeight: 1.4 }}>
              {labelOf($p.field__enum, t.v)}
            </span>
          );
        })}
      </div>
    );
  }
  return (
    <div style={{ padding: 14, background: T.bg }}>
      {$p.title ? <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 10 }}>{$p.title}</div> : null}
      {bodyEl}
    </div>
  );
}

ctx.render(<TagCloud />);
```
