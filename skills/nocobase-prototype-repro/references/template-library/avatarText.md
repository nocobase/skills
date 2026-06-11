# `avatarText` — Avatar + text

A colored initial avatar with the value — left, stacked, initials box or chip

**kind** `column` · **scope** `record` · **category** Style

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  | Auto-filled inside a table; pick one when used at page level |
| `recordId` | record |  |  | coll←collection, Only needed outside a record context (e.g. page level) — popups / rows re |
| `field` | field | ✓ |  | coll←collection |
| `variant` | styleSelect |  | `left` | opts: left/stacked/initials/chip/avatarOnly/statusDot |
| `theme` | theme |  | `default` |  |
| `enablePopup` | boolean |  | `false` |  |
| `popupMode` | select |  | `detail` | opts: detail/view |
| `popupViewUid` | popupView |  |  | A “View” action already configured on this table |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
async function __resolveRecord() {
  let r = null;
  try { const p = await ctx.getVar('ctx.popup'); r = (p && p.record) || null; } catch (e) {}
  if (!r) { try { r = await ctx.getVar('ctx.record'); } catch (e) {} }
  if (!r) r = ctx.record || null;
  if (!r && $p.collection && $p.recordId != null && $p.recordId !== '') {
    try {
      const res = await ctx.api.request({ url: $p.collection + ':get', params: { filterByTk: $p.recordId } });
      r = (res && res.data && res.data.data) || null;
    } catch (e) {}
  }
  return r;
}

const { useState: __useState, useEffect: __useEffect } = ctx.React;
function useRecord() {
  const [rec, setRec] = __useState(ctx.record || ctx.model.__rec || null);
  __useEffect(function () {
    if (ctx.record) { ctx.model.__rec = ctx.record; return; }
    (async function () {
      const r = await __resolveRecord();
      if (r) { ctx.model.__rec = r; setRec(r); }
    })();
  }, []);
  return rec;
}

function openRowPopup() {
  const rec = ctx.record || ctx.model.__rec || {};
  if ($p.popupMode === 'view' && $p.popupViewUid) {
    ctx.openView($p.popupViewUid, {
      mode: 'drawer',
      collectionName: (ctx.collection && ctx.collection.name) || $p.collection,
      filterByTk: rec.id,
      params: { filterByTk: rec.id },
    });
    return;
  }
  const { Descriptions } = ctx.antd;
  const keys = Object.keys(rec).filter(function (k) { const v = rec[k]; return v == null || typeof v !== 'object'; });
  ctx.viewer.drawer({
    width: '40%',
    title: 'Detail',
    content: (
      <Descriptions column={1} size="small" bordered>
        {keys.map(function (k) {
          const v = rec[k];
          return <Descriptions.Item key={k} label={k}>{v == null || v === '' ? '—' : String(v)}</Descriptions.Item>;
        })}
      </Descriptions>
    ),
  });
}
function Click(props) {
  if (!$p.enablePopup) return props.children;
  return <a onClick={openRowPopup} style={{ display: 'inline-block', color: 'inherit' }}>{props.children}</a>;
}
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

const PALETTE = ['#1677ff', '#52c41a', '#faad14', '#fa541c', '#722ed1', '#eb2f96', '#13c2c2', '#2f54eb'];
function Cell() {
  const rec = useRecord();
  const raw = rec ? rec[$p.field] : null;
  if (raw == null || raw === '') return <span style={{ color: T.sub }}>—</span>;
  const s = String(raw);
  let sum = 0; for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
  const color = PALETTE[sum % PALETTE.length];
  const ini = s.slice(0, 1).toUpperCase();
  const v = $p.variant || 'left';
  if (v === 'stacked') {
    return (
      <Click>
        <span style={{ display: 'inline-block', textAlign: 'center' }}>
          <span style={{ width: 26, height: 26, borderRadius: '50%', background: color, color: '#fff', fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{ini}</span>
          <span style={{ display: 'block', fontSize: 12, color: T.text, marginTop: 2 }}>{s}</span>
        </span>
      </Click>
    );
  }
  if (v === 'initials') {
    const two = s.replace(/\s+/g, ' ').trim().split(' ').map(function (w) { return w.slice(0, 1); }).join('').slice(0, 2).toUpperCase() || ini;
    return (
      <Click>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 24, height: 24, borderRadius: 6, background: T.card, border: '1px solid ' + T.border, color: color, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{two}</span>
          <span style={{ color: T.text }}>{s}</span>
        </span>
      </Click>
    );
  }
  if (v === 'chip') {
    return (
      <Click>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: T.card, border: '1px solid ' + T.border, borderRadius: 14, padding: '2px 10px 2px 3px' }}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: color, color: '#fff', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{ini}</span>
          <span style={{ color: T.text }}>{s}</span>
        </span>
      </Click>
    );
  }
  if (v === 'avatarOnly') {
    const Tip = ctx.antd.Tooltip;
    return (
      <Click>
        <Tip title={s}>
          <span style={{ width: 24, height: 24, borderRadius: '50%', background: color, color: '#fff', fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{ini}</span>
        </Tip>
      </Click>
    );
  }
  if (v === 'statusDot') {
    return (
      <Click>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ color: T.text }}>{s}</span>
        </span>
      </Click>
    );
  }
  // left (default)
  return (
    <Click>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 22, height: 22, borderRadius: '50%', background: color, color: '#fff', fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{ini}</span>
        <span style={{ color: T.text }}>{s}</span>
      </span>
    </Click>
  );
}
ctx.render(<Cell />);
```
