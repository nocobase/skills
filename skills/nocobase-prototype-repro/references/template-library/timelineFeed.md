# `timelineFeed` — Activity timeline

Icon-dot timeline of related records (or latest of a collection)

**kind** `block` · alsoKinds: item · **scope** `record` · **category** Data

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  |  |
| `relation` | association |  |  | coll←collection, Set → timeline of the current record’s relation; empty → latest of the co |
| `recordId` | record |  |  | coll←collection, Only needed outside a record context (e.g. page level) — popups / rows re |
| `kindField` | field |  |  | coll←relation|collection, Enum field — its options drive dot colors; empty = uniform dots |
| `textField` | field | ✓ |  | coll←relation|collection |
| `timeField` | field |  |  | coll←relation|collection, Defaults to createdAt |
| `limit` | number |  | `10` |  |
| `variant` | styleSelect |  | `default` | opts: default/compact/card/left-line/alternating/icon-left/minimal-dots |
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

const kindOpts = Array.isArray($p.kindField__enum) ? $p.kindField__enum : [];
const COLOR = { blue: '#1677ff', green: '#52c41a', gold: '#faad14', volcano: '#fa541c', purple: '#722ed1', magenta: '#eb2f96', cyan: '#13c2c2', geekblue: '#2f54eb', orange: '#fa8c16', lime: '#a0d911', red: '#f5222d' };

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
        const limit = Number($p.limit) > 0 ? Number($p.limit) : 10;
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
  if (!rows.length) return <Empty description="No activity" />;

  const variant = $p.variant || 'default';
  const wrap = { padding: '10px 14px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border };

  function info(r) {
    const kindRaw = $p.kindField ? r[$p.kindField] : null;
    const opt = kindOpts.find(function (o) { return String(o.value) === String(kindRaw); });
    const color = (opt && opt.color && COLOR[opt.color]) || T.primary;
    const glyph = (opt && opt.label ? String(opt.label) : (kindRaw ? String(kindRaw) : '•')).slice(0, 1).toUpperCase();
    const text = r[$p.textField];
    const time = rel(r[$p.timeField || 'createdAt']);
    const label = opt && opt.label ? opt.label : '';
    return { color: color, glyph: glyph, text: (text == null || text === '' ? '—' : String(text)), time: time, label: label };
  }

  if (variant === 'compact') {
    return (
      <div style={wrap}>
        {rows.map(function (r, i) {
          const d = info(r);
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < rows.length - 1 ? '1px solid ' + T.border : 'none' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
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
            <div style={{ display: 'flex', gap: 10, background: T.card, borderRadius: 8, borderLeft: '3px solid ' + d.color, padding: '9px 12px' }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: d.color, color: '#fff', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{d.glyph}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, color: T.sub }}>{d.label ? d.label + ' · ' : ''}{d.time}</div>
                <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.45, marginTop: 2, overflowWrap: 'break-word' }}>{d.text}</div>
              </div>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  if (variant === 'left-line') {
    return (
      <div style={{ ...wrap, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 21, top: 16, bottom: 16, width: 2, background: T.border }} />
        {rows.map(function (r, i) {
          const d = info(r);
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: 14 }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: T.bg, border: '2px solid ' + d.color, marginLeft: 2, marginTop: 3, zIndex: 1, boxSizing: 'border-box', flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, color: T.sub }}>{d.label ? d.label + ' · ' : ''}{d.time}</div>
                <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.45, marginTop: 2, overflowWrap: 'break-word' }}>{d.text}</div>
              </div>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  if (variant === 'alternating') {
    return (
      <div style={{ ...wrap, position: 'relative' }}>
        <div style={{ position: 'absolute', left: '50%', top: 12, bottom: 12, width: 2, background: T.border, transform: 'translateX(-1px)' }} />
        {rows.map(function (r, i) {
          const d = info(r);
          const left = i % 2 === 0;
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ display: 'flex', justifyContent: left ? 'flex-start' : 'flex-end', position: 'relative', marginBottom: 12 }}>
              <span style={{ position: 'absolute', left: '50%', top: 6, width: 12, height: 12, borderRadius: '50%', background: T.bg, border: '2px solid ' + d.color, transform: 'translateX(-50%)', zIndex: 1, boxSizing: 'border-box' }} />
              <div style={{ width: '46%', background: T.card, borderRadius: 8, padding: '8px 11px', textAlign: left ? 'right' : 'left' }}>
                <div style={{ fontSize: 11, color: T.sub }}>{d.label ? d.label + ' · ' : ''}{d.time}</div>
                <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.45, marginTop: 2, overflowWrap: 'break-word' }}>{d.text}</div>
              </div>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  if (variant === 'icon-left') {
    return (
      <div style={{ ...wrap, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map(function (r, i) {
          const d = info(r);
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ display: 'flex', gap: 11, alignItems: 'center', padding: '8px 6px', borderRadius: 8, background: i % 2 === 1 ? T.card : 'transparent' }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: d.color + '1f', color: d.color, fontSize: 14, fontWeight: 800, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{d.glyph}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.4, overflowWrap: 'break-word' }}>{d.text}</div>
                <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{d.label ? d.label + ' · ' : ''}{d.time}</div>
              </div>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  if (variant === 'minimal-dots') {
    return (
      <div style={{ ...wrap, position: 'relative', paddingLeft: 22 }}>
        <div style={{ position: 'absolute', left: 8, top: 16, bottom: 16, width: 1, background: T.border }} />
        {rows.map(function (r, i) {
          const d = info(r);
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ position: 'relative', paddingBottom: 13 }}>
              <span style={{ position: 'absolute', left: -18, top: 4, width: 7, height: 7, borderRadius: '50%', background: d.color, boxShadow: '0 0 0 3px ' + T.bg, zIndex: 1 }} />
              <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.45, overflowWrap: 'break-word' }}>{d.text}</div>
              <div style={{ fontSize: 11, color: T.sub, marginTop: 1 }}>{d.label ? d.label + ' · ' : ''}{d.time}</div>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  // default — dot + connecting line
  return (
    <div style={wrap}>
      {rows.map(function (r, i) {
        const d = info(r);
        return (
          <RowClick rec={r} key={r.id != null ? r.id : i}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: d.color, color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                {d.glyph}
              </span>
              {i < rows.length - 1 ? <span style={{ flex: 1, width: 2, background: T.border, marginTop: 2, minHeight: 10 }} /> : null}
            </div>
            <div style={{ paddingBottom: 14, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: T.sub }}>
                {d.label ? d.label + ' · ' : ''}{d.time}
              </div>
              <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.45, marginTop: 2, overflowWrap: 'break-word' }}>
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
