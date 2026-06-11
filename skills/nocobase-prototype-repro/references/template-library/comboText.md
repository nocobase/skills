# `comboText` — Multi-field text

Combine several fields in one cell — title/subtitle, inline, badge or accent

**kind** `column` · **scope** `record` · **category** Data

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  | Auto-filled inside a table; pick one when used at page level |
| `recordId` | record |  |  | coll←collection, Only needed outside a record context (e.g. page level) — popups / rows re |
| `fields` | fields | ✓ |  | coll←collection |
| `variant` | styleSelect |  | `twoLine` | opts: twoLine/inline/badge/stacked/pillGroup/labelValue |
| `separator` | text |  | ` · ` | Used between joined/subtitle parts |
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

function Cell() {
  const rec = useRecord() || {};
  const vals = ($p.fields || []).map(function (f) { const v = rec[f]; return v == null ? '' : String(v); });
  if (!vals.filter(Boolean).length) return <span style={{ color: T.sub }}>—</span>;
  const sep = $p.separator || ' · ';
  const v = $p.variant || 'twoLine';
  if (v === 'inline') {
    return <Click><span style={{ color: T.text }}>{vals.filter(Boolean).join(sep)}</span></Click>;
  }
  const head = vals[0] || '—';
  const rest = vals.slice(1).filter(Boolean).join(sep);
  if (v === 'badge') {
    return (
      <Click>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, color: T.text }}>{head}</span>
          {rest ? <span style={{ fontSize: 12, color: T.sub, background: T.card, border: '1px solid ' + T.border, borderRadius: 10, padding: '1px 8px' }}>{rest}</span> : null}
        </span>
      </Click>
    );
  }
  if (v === 'stacked') {
    return (
      <Click>
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <span style={{ width: 3, borderRadius: 2, background: T.primary, alignSelf: 'stretch' }} />
          <span style={{ lineHeight: 1.35 }}>
            <span style={{ fontWeight: 600, display: 'block', color: T.text }}>{head}</span>
            {rest ? <span style={{ fontSize: 12, color: T.sub, display: 'block' }}>{rest}</span> : null}
          </span>
        </span>
      </Click>
    );
  }
  if (v === 'pillGroup') {
    const parts = vals.filter(Boolean);
    return (
      <Click>
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
          {parts.map(function (p, j) {
            return <span key={j} style={{ fontSize: 12, color: j === 0 ? T.primary : T.sub, background: T.card, border: '1px solid ' + T.border, borderRadius: 10, padding: '1px 9px' }}>{p}</span>;
          })}
        </span>
      </Click>
    );
  }
  if (v === 'labelValue') {
    const fields = $p.fields || [];
    return (
      <Click>
        <span style={{ display: 'inline-block', lineHeight: 1.45 }}>
          {vals.map(function (val, j) {
            if (!val) return null;
            return (
              <span key={j} style={{ display: 'flex', gap: 6 }}>
                <span style={{ color: T.sub, minWidth: 56 }}>{String(fields[j] || '')}</span>
                <span style={{ color: T.text, fontWeight: 600 }}>{val}</span>
              </span>
            );
          })}
        </span>
      </Click>
    );
  }
  // twoLine (default)
  return (
    <Click>
      <span style={{ lineHeight: 1.35 }}>
        <span style={{ fontWeight: 600, display: 'block', color: T.text }}>{head}</span>
        {rest ? <span style={{ fontSize: 12, color: T.sub, display: 'block' }}>{rest}</span> : null}
      </span>
    </Click>
  );
}
ctx.render(<Cell />);
```
