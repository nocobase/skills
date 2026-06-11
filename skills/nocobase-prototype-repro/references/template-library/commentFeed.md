# `commentFeed` — Comment feed

Avatar + bubble feed of related records (or latest of a collection)

**kind** `block` · alsoKinds: item · **scope** `record` · **category** Data

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  |  |
| `relation` | association |  |  | coll←collection, Set → feed of the current record’s relation; empty → latest of the collec |
| `recordId` | record |  |  | coll←collection, Only needed outside a record context (e.g. page level) — popups / rows re |
| `authorField` | field |  |  | coll←relation|collection, Name shown above the bubble |
| `textField` | field | ✓ |  | coll←relation|collection |
| `timeField` | field |  |  | coll←relation|collection, Defaults to createdAt |
| `limit` | number |  | `8` |  |
| `variant` | styleSelect |  | `default` | opts: default/card/compact/threaded/chat-bubbles/minimal/boxed |
| `enablePopup` | boolean |  | `false` |  |
| `popupMode` | select |  | `detail` | opts: detail/view |
| `popupViewUid` | popupView |  |  | A “View” action already configured on a table of this page |
| `theme` | theme |  | `default` |  |


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

function __openRecordPopup(rec) {
  rec = rec || {};
  if ($p.popupMode === 'view' && $p.popupViewUid) {
    ctx.openView($p.popupViewUid, { mode: 'drawer', filterByTk: rec.id, params: { filterByTk: rec.id } });
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
function RowClick(props) {
  if (!$p.enablePopup) return props.children;
  return <a onClick={function () { __openRecordPopup(props.rec); }} style={{ display: 'block', color: 'inherit', cursor: 'pointer' }}>{props.children}</a>;
}

const { Empty, Spin } = ctx.antd;
const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

const PALETTE = ['#1677ff', '#52c41a', '#faad14', '#fa541c', '#722ed1', '#eb2f96', '#13c2c2', '#2f54eb'];

function rel(v) {
  const d = new Date(v); if (isNaN(d.getTime())) return '';
  const a = Date.now() - d.getTime();
  const m = Math.floor(a / 60000), h = Math.floor(a / 3600000), dd = Math.floor(a / 86400000);
  if (a < 60000) return 'just now';
  if (m < 60) return m + 'm ago';
  if (h < 24) return h + 'h ago';
  if (dd < 30) return dd + 'd ago';
  return d.toLocaleDateString();
}

function Comp() {
  const [rows, setRows] = useState(null);
  useEffect(function () {
    (async function () {
      try {
        const timeField = $p.timeField || 'createdAt';
        const limit = Number($p.limit) > 0 ? Number($p.limit) : 8;
        let url = null;
        if ($p.relation) {
          const rec = await __resolveRecord();
          if (rec && rec.id != null) url = $p.relation.source + '/' + rec.id + '/' + $p.relation.name + ':list';
        }
        if (!url) url = ($p.relation ? $p.relation.target : $p.collection) + ':list';
        const res = await ctx.api.request({ url: url, params: { pageSize: limit, sort: ['-' + timeField] } });
        setRows((res && res.data && res.data.data) || []);
      } catch (e) { setRows([]); }
    })();
  }, []);

  if (rows == null) return <Spin />;
  if (!rows.length) return <Empty description="No comments" />;

  const variant = $p.variant || 'default';
  const wrap = { padding: '10px 14px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border };

  function info(r) {
    const author = $p.authorField ? String(r[$p.authorField] || '?') : '?';
    let sum = 0; for (let k = 0; k < author.length; k++) sum += author.charCodeAt(k);
    const color = PALETTE[sum % PALETTE.length];
    const text = r[$p.textField];
    const time = rel(r[$p.timeField || 'createdAt']);
    return { author: author, color: color, text: (text == null || text === '' ? '—' : String(text)), time: time };
  }

  if (variant === 'compact') {
    return (
      <div style={wrap}>
        {rows.map(function (r, i) {
          const d = info(r);
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '5px 0', borderBottom: i < rows.length - 1 ? '1px solid ' + T.border : 'none' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0, transform: 'translateY(1px)' }} />
              <b style={{ fontSize: 12, color: T.text, flexShrink: 0 }}>{d.author === '?' ? '—' : d.author}</b>
              <span style={{ flex: 1, fontSize: 12.5, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.text}</span>
              <span style={{ fontSize: 11, color: T.sub, flexShrink: 0 }}>{d.time}</span>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div style={{ ...wrap, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(function (r, i) {
          const d = info(r);
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ background: T.card, border: '1px solid ' + T.border, borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: d.color, color: '#fff', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{d.author.slice(0, 1).toUpperCase()}</span>
                <b style={{ fontSize: 12.5, color: T.text, flex: 1 }}>{d.author === '?' ? '—' : d.author}</b>
                <span style={{ fontSize: 11, color: T.sub }}>{d.time}</span>
              </div>
              <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.5, overflowWrap: 'break-word' }}>{d.text}</div>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  if (variant === 'threaded') {
    return (
      <div style={{ ...wrap, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 28, top: 16, bottom: 16, width: 2, background: T.border }} />
        {rows.map(function (r, i) {
          const d = info(r);
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, position: 'relative' }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: d.color, color: '#fff', fontSize: 13, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0, zIndex: 1, border: '2px solid ' + T.bg, boxSizing: 'border-box' }}>{d.author.slice(0, 1).toUpperCase()}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12 }}>
                  <b style={{ color: T.text }}>{d.author === '?' ? '—' : d.author}</b>
                  <span style={{ color: T.sub, marginLeft: 8, fontSize: 11 }}>{d.time}</span>
                </div>
                <div style={{ marginTop: 4, fontSize: 12.5, color: T.text, lineHeight: 1.5, overflowWrap: 'break-word' }}>{d.text}</div>
              </div>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  if (variant === 'chat-bubbles') {
    // alternate sides like a messaging thread (right = even rows / "me")
    return (
      <div style={{ ...wrap, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(function (r, i) {
          const d = info(r);
          const right = i % 2 === 0;
          const av = <span style={{ width: 28, height: 28, borderRadius: '50%', background: d.color, color: '#fff', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{d.author.slice(0, 1).toUpperCase()}</span>;
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ display: 'flex', gap: 8, flexDirection: right ? 'row-reverse' : 'row', alignItems: 'flex-end' }}>
              {av}
              <div style={{ maxWidth: '74%', minWidth: 0 }}>
                <div style={{ fontSize: 11, color: T.sub, marginBottom: 3, textAlign: right ? 'right' : 'left' }}>{d.author === '?' ? '—' : d.author}<span style={{ marginLeft: 6 }}>{d.time}</span></div>
                <div style={{ background: right ? d.color : T.card, color: right ? '#fff' : T.text, borderRadius: right ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '8px 12px', fontSize: 12.5, lineHeight: 1.5, overflowWrap: 'break-word' }}>{d.text}</div>
              </div>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  if (variant === 'minimal') {
    return (
      <div style={{ ...wrap, display: 'flex', flexDirection: 'column' }}>
        {rows.map(function (r, i) {
          const d = info(r);
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ padding: '9px 0', borderBottom: i < rows.length - 1 ? '1px solid ' + T.border : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <b style={{ fontSize: 12.5, color: d.color }}>{d.author === '?' ? '—' : d.author}</b>
                <span style={{ fontSize: 11, color: T.sub }}>{d.time}</span>
              </div>
              <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.5, marginTop: 3, overflowWrap: 'break-word' }}>{d.text}</div>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  if (variant === 'boxed') {
    return (
      <div style={{ ...wrap, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {rows.map(function (r, i) {
          const d = info(r);
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ display: 'flex', gap: 11, background: T.card, border: '1px solid ' + T.border, borderRadius: 10, padding: '11px 13px', borderLeft: '3px solid ' + d.color }}>
              <span style={{ width: 32, height: 32, borderRadius: 9, background: d.color, color: '#fff', fontSize: 13, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{d.author.slice(0, 1).toUpperCase()}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <b style={{ fontSize: 12.5, color: T.text }}>{d.author === '?' ? '—' : d.author}</b>
                  <span style={{ fontSize: 11, color: T.sub, flexShrink: 0 }}>{d.time}</span>
                </div>
                <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.5, marginTop: 4, overflowWrap: 'break-word' }}>{d.text}</div>
              </div>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  // default — bubble
  return (
    <div style={wrap}>
      {rows.map(function (r, i) {
        const d = info(r);
        return (
          <RowClick rec={r} key={r.id != null ? r.id : i}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <span style={{ width: 30, height: 30, borderRadius: '50%', background: d.color, color: '#fff', fontSize: 13, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              {d.author.slice(0, 1).toUpperCase()}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12 }}>
                <b style={{ color: T.text }}>{d.author === '?' ? '—' : d.author}</b>
                <span style={{ color: T.sub, marginLeft: 8, fontSize: 11 }}>{d.time}</span>
              </div>
              <div style={{ marginTop: 4, background: T.card, borderRadius: '2px 10px 10px 10px', padding: '8px 11px', fontSize: 12.5, color: T.text, lineHeight: 1.5, overflowWrap: 'break-word' }}>
                {d.text}
              </div>
            </div>
          </div>
          </RowClick>
        );
      })}
    </div>
  );
}

ctx.render(<Comp />);
```
