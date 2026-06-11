# `dueSoon` — Due soon

Records whose date falls within the next N days

**kind** `block` · alsoKinds: item · **scope** `collection` · **category** Data

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  |  |
| `dateField` | field | ✓ |  | accepts date, coll←collection |
| `titleField` | field |  |  | coll←collection |
| `days` | number |  | `30` |  |
| `label` | text |  |  |  |
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

const { Tag, Empty } = ctx.antd;
const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

function DueSoon() {
  const [rows, setRows] = useState(null);
  useEffect(function () {
    (async function () {
      try {
        ctx.initResource('MultiRecordResource');
        ctx.resource.setResourceName($p.collection);
        ctx.resource.setPageSize(500);
        await ctx.resource.refresh();
        const all = ctx.resource.getData() || [];
        const now = Date.now();
        const horizon = now + (Number($p.days) || 30) * 86400000;
        const hits = all
          .map(function (r) { const d = new Date(r[$p.dateField]); return { r: r, t: d.getTime() }; })
          .filter(function (x) { return !isNaN(x.t) && x.t >= now - 86400000 && x.t <= horizon; })
          .sort(function (a, b) { return a.t - b.t; })
          .slice(0, 20);
        setRows(hits);
      } catch (e) { setRows([]); }
    })();
  }, []);

  if (rows == null) return <div style={{ padding: 12, color: T.sub }}>Loading…</div>;
  if (!rows.length) return <Empty description={'Nothing due in ' + (Number($p.days) || 30) + ' days'} />;

  return (
    <div style={{ padding: '6px 0', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
      {$p.label ? <div style={{ fontWeight: 600, color: T.text, padding: '4px 14px 8px' }}>{$p.label}</div> : null}
      {rows.map(function (x, i) {
        const rec = x.r;
        const daysLeft = Math.ceil((x.t - Date.now()) / 86400000);
        const color = daysLeft <= 7 ? 'red' : daysLeft <= 15 ? 'orange' : 'blue';
        const title = $p.titleField ? rec[$p.titleField] : ('#' + (rec.id != null ? rec.id : i));
        return (
          <RowClick rec={rec} key={rec.id != null ? rec.id : i}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '7px 14px', borderBottom: i < rows.length - 1 ? '1px solid ' + T.border : 'none' }}>
            <span style={{ flex: 1, fontSize: 13, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title == null || title === '' ? '—' : String(title)}
            </span>
            <span style={{ fontSize: 12, color: T.sub, margin: '0 10px', whiteSpace: 'nowrap' }}>
              {new Date(x.t).toLocaleDateString()}
            </span>
            <Tag color={color} style={{ margin: 0 }}>{daysLeft <= 0 ? 'today' : daysLeft + 'd'}</Tag>
          </div>
          </RowClick>
        );
      })}
    </div>
  );
}

ctx.render(<DueSoon />);
```
