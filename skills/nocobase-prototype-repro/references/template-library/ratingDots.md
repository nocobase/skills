# `ratingDots` — Rating

Render a 0..N number as a readonly rating — stars, dots, bar or number

**kind** `column` · **scope** `record` · **category** Style

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  | Auto-filled inside a table; pick one when used at page level |
| `recordId` | record |  |  | coll←collection, Only needed outside a record context (e.g. page level) — popups / rows re |
| `field` | field | ✓ |  | accepts numeric, coll←collection |
| `outOf` | number |  | `5` |  |
| `variant` | styleSelect |  | `stars` | opts: stars/dots/bar/number/hearts/faces |
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

const { Rate } = ctx.antd;
function Cell() {
  const rec = useRecord();
  const raw = rec ? rec[$p.field] : null;
  const val = Number(raw);
  const count = Number($p.outOf) || 5;
  const score = isNaN(val) ? 0 : Math.max(0, Math.min(count, val));
  const v = $p.variant || 'stars';
  if (v === 'dots') {
    const rounded = Math.round(score);
    return (
      <Click>
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {Array.from({ length: count }).map(function (_, j) {
            return <span key={j} style={{ width: 10, height: 10, borderRadius: '50%', background: j < rounded ? T.primary : T.border }} />;
          })}
        </span>
      </Click>
    );
  }
  if (v === 'bar') {
    const pct = Math.round((score / count) * 100);
    return (
      <Click>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 80, height: 7, borderRadius: 4, background: T.card }}>
            <span style={{ display: 'block', width: pct + '%', height: '100%', borderRadius: 4, background: T.primary }} />
          </span>
          <span style={{ fontSize: 12, color: T.sub, fontVariantNumeric: 'tabular-nums' }}>{score + '/' + count}</span>
        </span>
      </Click>
    );
  }
  if (v === 'number') {
    return (
      <Click>
        <span style={{ color: T.text, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: T.primary }}>★ </span><b>{score.toFixed(1)}</b>
          <span style={{ color: T.sub }}>{' / ' + count}</span>
        </span>
      </Click>
    );
  }
  if (v === 'hearts') {
    const r = Math.round(score);
    let str = '';
    for (let k = 0; k < count; k++) str += k < r ? '❤️' : '🤍';
    return <Click><span style={{ fontSize: 14, letterSpacing: 1 }}>{str}</span></Click>;
  }
  if (v === 'faces') {
    const faces = ['😡', '🙁', '😐', '🙂', '😄'];
    const ratio = count > 0 ? score / count : 0;
    const idx = Math.min(faces.length - 1, Math.max(0, Math.round(ratio * (faces.length - 1))));
    return (
      <Click>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 18 }}>{faces[idx]}</span>
          <span style={{ fontSize: 12, color: T.sub, fontVariantNumeric: 'tabular-nums' }}>{score + '/' + count}</span>
        </span>
      </Click>
    );
  }
  // stars (default)
  return <Click><span><Rate disabled allowHalf value={score} count={count} style={{ fontSize: 13, color: T.primary }} /></span></Click>;
}
ctx.render(<Cell />);
```
