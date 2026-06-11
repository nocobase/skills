# `formDrivenFilter` — Form value → filter block

Form input live-filters a target block (search-box pattern)

**kind** `item` · **scope** `collection` · **category** Filter

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `watchField` | field | ✓ |  | The form field whose value drives the filter |
| `targetUid` | targetBlock | ✓ |  |  |
| `targetFields` | fields | ✓ |  | coll←target:targetUid, Fields of the target block’s collection to match against |
| `operator` | select |  | `$includes` | opts: $includes/$eq |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const FILTER_KEY = 'jsTplFormFilter:' + (ctx.model && ctx.model.uid);

function apply() {
  let v = null;
  try { v = (ctx.form && ctx.form.getFieldsValue) ? ctx.form.getFieldsValue()[$p.watchField] : null; } catch (e) {}
  if (v && typeof v === 'object' && v.id != null) v = v.id;
  // GATE: only act when the watched value actually changed (prevents loops)
  if (v === ctx.model.__last) return;
  ctx.model.__last = v;

  const t = $p.targetUid ? ctx.getModel($p.targetUid) : null;
  if (!t || !t.resource) return;
  // debounce keystrokes
  if (ctx.model.__t) clearTimeout(ctx.model.__t);
  ctx.model.__t = setTimeout(function () {
    if (v == null || String(v).trim() === '') {
      t.resource.removeFilterGroup && t.resource.removeFilterGroup(FILTER_KEY);
    } else {
      const or = ($p.targetFields || []).map(function (f) {
        var c = {}; c[f] = {}; c[f][$p.operator || '$includes'] = v; return c;
      });
      t.resource.addFilterGroup && t.resource.addFilterGroup(FILTER_KEY, or.length === 1 ? or[0] : { $or: or });
    }
    t.resource.setPage && t.resource.setPage(1);
    t.resource.refresh && t.resource.refresh();
  }, 350);
}

function render() {
  apply();
  ctx.render(
    <span style={{ fontSize: 11, color: '#bbb' }}>{'🔎 filtering → ' + (($p.targetFields || []).join(', ') || '—')}</span>
  );
}

render();
const bm = ctx.blockModel;
if (bm && bm.on) { if (bm.__h && bm.off) bm.off('formValuesChange', bm.__h); bm.__h = render; bm.on('formValuesChange', render); }
```
