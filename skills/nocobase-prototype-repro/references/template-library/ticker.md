# `ticker` — News ticker

Latest records scrolling like a stock ticker — marquee / vertical roll

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Style

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  |  |
| `textField` | field | ✓ |  | accepts text, coll←collection |
| `limit` | number |  | `12` |  |
| `prefix` | text |  | `📢` |  |
| `speed` | select |  | `normal` | opts: slow/normal/fast |
| `variant` | styleSelect |  | `marquee` | opts: marquee/vertical/accent |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { useState, useEffect } = ctx.React;

const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0', gradient: 'linear-gradient(135deg,#1677ff,#13c2c2)' };

const ANIM = 'jstpl-ticker-' + (ctx.model && ctx.model.uid);

function Ticker() {
  const [items, setItems] = useState(null);
  const [idx, setIdx] = useState(0);
  useEffect(function () {
    (async function () {
      try {
        const res = await ctx.api.request({ url: $p.collection + ':list', params: { pageSize: $p.limit || 12, fields: [$p.textField], sort: ['-createdAt'] } });
        setItems(((res && res.data && res.data.data) || []).map(function (r) { return String(r[$p.textField] || ''); }).filter(Boolean));
      } catch (e) { setItems([]); }
    })();
  }, []);
  const variant = $p.variant || 'marquee';
  useEffect(function () {
    if (variant !== 'vertical' || !items || items.length < 2) return;
    const t = setInterval(function () { setIdx(function (i) { return (i + 1) % items.length; }); }, 2800);
    return function () { clearInterval(t); };
  }, [items, variant]);
  if (!items) return <div style={{ padding: 10, color: T.sub }}>Loading…</div>;
  if (!items.length) return <div style={{ padding: 10, color: T.sub }}>Nothing to report</div>;

  const dur = ($p.speed === 'fast' ? 14 : $p.speed === 'slow' ? 45 : 26);

  if (variant === 'vertical') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: T.bg, border: '1px solid ' + T.border, borderRadius: 8, overflow: 'hidden' }}>
        <span style={{ flexShrink: 0 }}>{$p.prefix || '📢'}</span>
        <div style={{ position: 'relative', height: 20, flex: 1, overflow: 'hidden' }}>
          {items.map(function (txt, i) {
            return (
              <div key={i} style={{ position: 'absolute', inset: 0, fontSize: 13, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'all .45s', opacity: i === idx ? 1 : 0, transform: 'translateY(' + (i === idx ? 0 : 14) + 'px)' }}>
                {txt}
              </div>
            );
          })}
        </div>
        <span style={{ fontSize: 11, color: T.sub, flexShrink: 0 }}>{idx + 1}/{items.length}</span>
      </div>
    );
  }

  const row = items.map(function (txt, i) {
    return (
      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginRight: 36 }}>
        {variant === 'accent' ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.primary, flexShrink: 0 }} /> : null}
        <span style={{ fontSize: 13, color: variant === 'accent' ? T.text : T.text }}>{txt}</span>
      </span>
    );
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 8px 14px', background: variant === 'accent' ? T.card : T.bg, border: '1px solid ' + T.border, borderLeft: variant === 'accent' ? '3px solid ' + T.primary : '1px solid ' + T.border, borderRadius: 8, overflow: 'hidden' }}>
      <span style={{ flexShrink: 0 }}>{$p.prefix || '📢'}</span>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <style>{'@keyframes ' + ANIM + ' { from { transform: translateX(0); } to { transform: translateX(-50%); } }'}</style>
        <div style={{ display: 'inline-flex', whiteSpace: 'nowrap', animation: ANIM + ' ' + dur + 's linear infinite' }}>
          <span>{row}</span>
          <span>{row}</span>
        </div>
      </div>
    </div>
  );
}

ctx.render(<Ticker />);
```
