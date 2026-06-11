# `progressBar` — Progress bar

Render a numeric field as a small bar, ring, stripes or labeled bar

**kind** `column` · **scope** `record` · **category** Style

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  | Auto-filled inside a table; pick one when used at page level |
| `recordId` | record |  |  | coll←collection, Only needed outside a record context (e.g. page level) — popups / rows re |
| `field` | field | ✓ |  | accepts numeric, coll←collection, The numeric value for this column. |
| `max` | number |  | `100` | Value treated as 100%. |
| `variant` | styleSelect |  | `bar` | opts: bar/ring/stripes/text/segments/dots |
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

const { Progress } = ctx.antd;
function Cell() {
  const rec = useRecord();
  const val = Number(rec ? rec[$p.field] : null);
  const n = isNaN(val) ? 0 : val;
  const max = Number($p.max) || 100;
  const pct = Math.min(100, Math.max(0, Math.round((n / max) * 100)));
  const v = $p.variant || 'bar';
  if (v === 'ring') {
    return <Click><span><Progress type="circle" percent={pct} size={36} strokeColor={T.primary} trailColor={T.card} /></span></Click>;
  }
  if (v === 'stripes') {
    return (
      <Click>
        <span style={{ display: 'inline-block', minWidth: 110, verticalAlign: 'middle' }}>
          <span style={{ display: 'block', height: 10, borderRadius: 5, background: T.card, overflow: 'hidden' }}>
            <span style={{ display: 'block', width: pct + '%', height: '100%', backgroundImage: 'repeating-linear-gradient(45deg,' + T.primary + ',' + T.primary + ' 6px,rgba(255,255,255,0.45) 6px,rgba(255,255,255,0.45) 12px)' }} />
          </span>
        </span>
      </Click>
    );
  }
  if (v === 'text') {
    return (
      <Click>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
          <b style={{ color: T.primary, fontVariantNumeric: 'tabular-nums', width: 38 }}>{pct + '%'}</b>
          <span style={{ flex: 1, height: 7, borderRadius: 4, background: T.card }}>
            <span style={{ display: 'block', width: pct + '%', height: '100%', borderRadius: 4, background: T.primary }} />
          </span>
        </span>
      </Click>
    );
  }
  if (v === 'segments') {
    const total = 10, on = Math.round((pct / 100) * total);
    return (
      <Click>
        <span style={{ display: 'inline-flex', gap: 2, minWidth: 100, verticalAlign: 'middle' }}>
          {Array.from({ length: total }).map(function (_, k) {
            return <span key={k} style={{ flex: 1, height: 9, borderRadius: 2, background: k < on ? T.primary : T.card }} />;
          })}
        </span>
      </Click>
    );
  }
  if (v === 'dots') {
    const total = 10, on = Math.round((pct / 100) * total);
    return (
      <Click>
        <span style={{ display: 'inline-flex', gap: 3, verticalAlign: 'middle' }}>
          {Array.from({ length: total }).map(function (_, k) {
            return <span key={k} style={{ width: 9, height: 9, borderRadius: '50%', background: k < on ? T.primary : T.border }} />;
          })}
        </span>
      </Click>
    );
  }
  // bar (default)
  return <Click><span style={{ display: 'inline-block', minWidth: 110 }}><Progress percent={pct} size="small" strokeColor={T.primary} trailColor={T.card} /></span></Click>;
}
ctx.render(<Cell />);
```
