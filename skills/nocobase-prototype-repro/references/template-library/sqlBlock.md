# `sqlBlock` — SQL block

Write SQL, render the result as a table or a single value

**kind** `block` · alsoKinds: item · **scope** `any` · **category** Custom

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `sql` | code | ✓ | `SELECT 1 AS hello` | e.g. SELECT status, count(*) AS total FROM orders GROUP BY status |
| `display` | select |  | `table` | opts: table/value |
| `label` | text |  |  |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { Statistic, Empty, Spin } = ctx.antd;
const { useState, useEffect } = ctx.React;

function SqlBlock() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(function () {
    (async function () {
      try {
        // configurators keep the registered SQL in sync after manual edits
        if (ctx.flowSettingsEnabled && ctx.sql && ctx.sql.save) {
          try { await ctx.sql.save({ uid: $p.sqlUid, sql: $p.sql, dataSourceKey: 'main' }); } catch (e) {}
        }
        const data = await ctx.sql.runById($p.sqlUid, { type: 'selectRows' });
        setRows(Array.isArray(data) ? data : (data ? [data] : []));
      } catch (e) {
        setErr((e && e.message) || 'SQL failed');
      }
    })();
  }, []);

  if (err) return <div style={{ padding: 12, color: '#cf1322', fontSize: 12 }}>{err}</div>;
  if (rows == null) return <div style={{ padding: 12 }}><Spin /></div>;
  if (!rows.length) return <Empty description="No rows" />;

  if ($p.display === 'value') {
    const first = rows[0] || {};
    const k = Object.keys(first)[0];
    return (
      <div style={{ padding: '8px 12px' }}>
        <Statistic title={$p.label || k} value={first[k]} valueStyle={{ fontSize: 26 }} />
      </div>
    );
  }

  const cols = Object.keys(rows[0]);
  return (
    <div style={{ padding: '8px 12px', overflowX: 'auto' }}>
      {$p.label ? <div style={{ fontWeight: 600, marginBottom: 8 }}>{$p.label}</div> : null}
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            {cols.map(function (c) {
              return <th key={c} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '2px solid #f0f0f0', color: '#888', fontWeight: 500 }}>{c}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(function (r, i) {
            return (
              <tr key={i}>
                {cols.map(function (c) {
                  const v = r[c];
                  return <td key={c} style={{ padding: '6px 10px', borderBottom: '1px solid #f5f5f5' }}>{v == null ? '—' : String(v)}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

ctx.render(<SqlBlock />);
```
