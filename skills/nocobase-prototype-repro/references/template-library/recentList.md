# `recentList` — Recent records feed

Most recent N records as list / timeline / cards / compact

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Data

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  |  |
| `titleField` | field |  |  | coll←collection |
| `subtitleField` | field |  |  | coll←collection |
| `timeField` | field |  |  | coll←collection, Sort newest-first by this field. Defaults to createdAt. |
| `limit` | number |  | `8` |  |
| `variant` | styleSelect |  | `list` | opts: list/timeline/cards/compact/avatar/numbered/feed |
| `enablePopup` | boolean |  | `false` |  |
| `popupMode` | select |  | `detail` | opts: detail/view |
| `popupViewUid` | popupView |  |  | A “View” action already configured on a table of this page |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
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

const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

function RecentList() {
  const [rows, setRows] = useState(null);
  useEffect(function () {
    (async function () {
      try {
        const timeField = $p.timeField || 'createdAt';
        const limit = Number($p.limit) > 0 ? Number($p.limit) : 8;
        ctx.initResource('MultiRecordResource');
        ctx.resource.setResourceName($p.collection);
        ctx.resource.setPageSize(limit);
        if (ctx.resource.setSort) ctx.resource.setSort(['-' + timeField]);
        await ctx.resource.refresh();
        setRows(ctx.resource.getData() || []);
      } catch (e) { setRows([]); }
    })();
  }, []);

  const fmtTime = function (v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (rows == null) return <div style={{ padding: '12px', color: T.sub, background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>Loading…</div>;
  if (!rows.length) return <div style={{ padding: '12px', color: T.sub, background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>No records.</div>;

  const v = $p.variant || 'list';
  const rowOf = function (r, i) {
    const title = $p.titleField ? r[$p.titleField] : (r.title || r.name || ('#' + (r.id != null ? r.id : i)));
    const subtitle = $p.subtitleField ? r[$p.subtitleField] : '';
    const time = fmtTime(r[$p.timeField || 'createdAt']);
    return { title: title, subtitle: subtitle, time: time };
  };
  const initials = function (s) {
    const t = (s == null ? '' : String(s)).trim();
    return t ? t.slice(0, 1).toUpperCase() : '·';
  };

  if (v === 'timeline') {
    return (
      <div style={{ padding: '10px 14px 2px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {rows.map(function (r, i) {
          const d = rowOf(r, i);
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: T.primary, marginTop: 4, flexShrink: 0 }} />
                {i < rows.length - 1 ? <span style={{ flex: 1, width: 2, background: T.border, minHeight: 14 }} /> : null}
              </div>
              <div style={{ paddingBottom: 12, minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, color: T.sub }}>{d.time}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.title == null || d.title === '' ? '—' : String(d.title)}
                </div>
                {d.subtitle ? <div style={{ fontSize: 12, color: T.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(d.subtitle)}</div> : null}
              </div>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  if (v === 'cards') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {rows.map(function (r, i) {
          const d = rowOf(r, i);
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ background: T.bg, borderRadius: 10, border: '1px solid ' + T.border, borderTop: '3px solid ' + T.primary, padding: '10px 12px', height: '100%' }}>
              <div style={{ fontSize: 11, color: T.sub, marginBottom: 4 }}>{d.time}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.title == null || d.title === '' ? '—' : String(d.title)}
              </div>
              {d.subtitle ? <div style={{ fontSize: 12, color: T.sub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(d.subtitle)}</div> : null}
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  if (v === 'compact') {
    return (
      <div style={{ padding: '2px 0', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {rows.map(function (r, i) {
          const d = rowOf(r, i);
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderBottom: i < rows.length - 1 ? '1px solid ' + T.border : 'none' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: T.card, color: T.primary, fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{initials(d.title)}</span>
              <span style={{ flex: 1, fontSize: 12, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.title == null || d.title === '' ? '—' : String(d.title)}
              </span>
              <span style={{ fontSize: 11, color: T.sub, whiteSpace: 'nowrap', flexShrink: 0 }}>{d.time}</span>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  const AV_COLORS = ['#1677ff', '#52c41a', '#faad14', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];
  const avColor = function (s) {
    const t = (s == null ? '' : String(s));
    let n = 0;
    for (let k = 0; k < t.length; k++) n = (n + t.charCodeAt(k)) % AV_COLORS.length;
    return AV_COLORS[n];
  };

  if (v === 'avatar') {
    return (
      <div style={{ padding: '2px 0', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {rows.map(function (r, i) {
          const d = rowOf(r, i);
          const c = avColor(d.title);
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: i < rows.length - 1 ? '1px solid ' + T.border : 'none' }}>
              <span style={{ width: 32, height: 32, borderRadius: '50%', background: c, color: '#fff', fontSize: 13, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{initials(d.title)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.title == null || d.title === '' ? '—' : String(d.title)}
                </div>
                {d.subtitle ? <div style={{ fontSize: 12, color: T.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(d.subtitle)}</div> : null}
              </div>
              <span style={{ fontSize: 11, color: T.sub, whiteSpace: 'nowrap', flexShrink: 0 }}>{d.time}</span>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  if (v === 'numbered') {
    return (
      <div style={{ padding: '2px 0', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {rows.map(function (r, i) {
          const d = rowOf(r, i);
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: i < rows.length - 1 ? '1px solid ' + T.border : 'none' }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: T.primary, opacity: 0.5, width: 26, textAlign: 'center', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.title == null || d.title === '' ? '—' : String(d.title)}
                </div>
                {d.subtitle ? <div style={{ fontSize: 12, color: T.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(d.subtitle)}</div> : null}
              </div>
              <span style={{ fontSize: 11, color: T.sub, whiteSpace: 'nowrap', flexShrink: 0 }}>{d.time}</span>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  if (v === 'feed') {
    return (
      <div style={{ padding: '10px 12px 2px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        {rows.map(function (r, i) {
          const d = rowOf(r, i);
          const c = avColor(d.title);
          return (
            <RowClick rec={r} key={r.id != null ? r.id : i}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: c, color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{initials(d.title)}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, color: T.sub, marginBottom: 2 }}>{d.time}</div>
                <div style={{ background: T.card, borderRadius: '2px 10px 10px 10px', padding: '7px 10px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.title == null || d.title === '' ? '—' : String(d.title)}
                  </div>
                  {d.subtitle ? <div style={{ fontSize: 12, color: T.sub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(d.subtitle)}</div> : null}
                </div>
              </div>
            </div>
            </RowClick>
          );
        })}
      </div>
    );
  }

  // list (default)
  return (
    <div style={{ padding: '4px 0', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
      {rows.map(function (r, i) {
        const d = rowOf(r, i);
        return (
          <RowClick rec={r} key={r.id != null ? r.id : i}>
          <div style={{ padding: '8px 14px', borderBottom: i < rows.length - 1 ? '1px solid ' + T.border : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                {d.title == null || d.title === '' ? '—' : String(d.title)}
              </span>
              <span style={{ fontSize: 11, color: T.sub, whiteSpace: 'nowrap', marginLeft: 8 }}>{d.time}</span>
            </div>
            {d.subtitle ? (
              <div style={{ fontSize: 12, color: T.sub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {String(d.subtitle)}
              </div>
            ) : null}
          </div>
          </RowClick>
        );
      })}
    </div>
  );
}

ctx.render(<RecentList />);
```
