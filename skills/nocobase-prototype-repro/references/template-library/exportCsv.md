# `exportCsv` — Export CSV

Export selected rows (or all current rows) to a CSV file

**kind** `action` · **scope** `collection` · **category** Action

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `filename` | text |  | `export` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { Button } = ctx.antd;

function csvCell(v) {
  if (v == null) return '';
  if (typeof v === 'object') v = JSON.stringify(v);
  v = String(v);
  if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

function doExport() {
  const selected = (ctx.resource && ctx.resource.selectedRows) || [];
  const all = (ctx.resource && ctx.resource.getData && ctx.resource.getData()) || [];
  const rows = selected.length ? selected : all;
  if (!rows.length) { ctx.message && ctx.message.warning('No rows to export'); return; }

  const cols = Object.keys(rows[0]).filter(function (k) { return k !== '__index'; });
  const lines = [cols.map(csvCell).join(',')];
  rows.forEach(function (r) { lines.push(cols.map(function (c) { return csvCell(r[c]); }).join(',')); });
  const csv = '\uFEFF' + lines.join('\r\n');

  const realDoc = ctx.element && ctx.element.ownerDocument;
  if (!realDoc) { ctx.message && ctx.message.error('Download not available here'); return; }
  const realWin = realDoc.defaultView;
  const blob = new realWin.Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = realWin.URL.createObjectURL(blob);
  const a = realDoc.createElement('a');
  a.href = url; a.download = ($p.filename || 'export') + '.csv';
  realDoc.body.appendChild(a); a.click(); a.remove();
  realWin.URL.revokeObjectURL(url);
  ctx.message && ctx.message.success('Exported ' + rows.length + ' row(s)');
}

ctx.render(<Button type="link" onClick={doExport}>{'⬇ Export CSV'}</Button>);
```
