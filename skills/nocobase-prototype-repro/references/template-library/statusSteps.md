# `statusSteps` — Status steps

Show a record’s status as a step progress bar

**kind** `block` · alsoKinds: item · **scope** `record` · **category** Style

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `collection` | collection | ✓ |  |  |
| `field` | field | ✓ |  | accepts enum, coll←collection, Steps follow the field’s option order |
| `recordId` | record |  |  | coll←collection, Only needed outside a record context (e.g. page level) — popups / rows re |
| `variant` | styleSelect |  | `default` | opts: default/dots/arrow/vertical/numbered/progress-bar/chevron |
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

const { Steps, Spin, Empty } = ctx.antd;
const { useState, useEffect } = ctx.React;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

const enumOpts = Array.isArray($p.field__enum) ? $p.field__enum : [];

function Comp() {
  const [rec, setRec] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(function () {
    (async function () {
      const r = await __resolveRecord();
      setRec(r); setReady(true);
    })();
  }, []);

  if (!ready) return <Spin />;
  if (!enumOpts.length) return <Empty description="Status field has no options" />;
  const cur = rec ? rec[$p.field] : null;
  let idx = enumOpts.findIndex(function (o) { return String(o.value) === String(cur); });
  if (idx < 0) idx = 0;
  const labels = enumOpts.map(function (o) { return o.label || String(o.value); });
  const variant = $p.variant || 'default';
  const wrap = { padding: '14px 16px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border };

  if (variant === 'dots') {
    return (
      <div style={wrap}>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          {labels.map(function (lab, i) {
            const done = i <= idx;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                {i < labels.length - 1 ? <span style={{ position: 'absolute', top: 6, left: '50%', width: '100%', height: 2, background: i < idx ? T.primary : T.border }} /> : null}
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: done ? T.primary : T.bg, border: '2px solid ' + (done ? T.primary : T.border), zIndex: 1, boxSizing: 'border-box' }} />
                <span style={{ fontSize: 12, marginTop: 8, color: i === idx ? T.text : T.sub, fontWeight: i === idx ? 600 : 400, textAlign: 'center' }}>{lab}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (variant === 'arrow') {
    return (
      <div style={{ ...wrap, padding: '14px 16px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {labels.map(function (lab, i) {
            const done = i <= idx;
            return (
              <span key={i} style={{ position: 'relative', flex: '1 1 0', minWidth: 70, padding: '7px 14px 7px 18px', fontSize: 12.5, fontWeight: i === idx ? 700 : 500, color: done ? '#fff' : T.sub, background: done ? T.primary : T.card, clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                {lab}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  if (variant === 'vertical') {
    return (
      <div style={wrap}>
        {labels.map(function (lab, i) {
          const done = i < idx, active = i === idx;
          const dot = done ? T.primary : (active ? T.primary : T.border);
          return (
            <div key={i} style={{ display: 'flex', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: done || active ? dot : T.bg, border: '2px solid ' + dot, color: done || active ? '#fff' : T.sub, fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', boxSizing: 'border-box' }}>{done ? '✓' : i + 1}</span>
                {i < labels.length - 1 ? <span style={{ flex: 1, width: 2, background: i < idx ? T.primary : T.border, minHeight: 16, margin: '2px 0' }} /> : null}
              </div>
              <div style={{ paddingBottom: 14, fontSize: 13, color: active ? T.text : T.sub, fontWeight: active ? 600 : 400, lineHeight: '22px' }}>{lab}</div>
            </div>
          );
        })}
      </div>
    );
  }

  if (variant === 'numbered') {
    return (
      <div style={{ ...wrap, display: 'flex', alignItems: 'center' }}>
        {labels.map(function (lab, i) {
          const done = i <= idx;
          return (
            <React.Fragment key={i}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: done ? T.primary : T.card, border: '1px solid ' + (done ? T.primary : T.border), color: done ? '#fff' : T.sub, fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{i + 1}</span>
                <span style={{ fontSize: 13, color: i === idx ? T.text : T.sub, fontWeight: i === idx ? 600 : 400 }}>{lab}</span>
              </span>
              {i < labels.length - 1 ? <span style={{ flex: 1, height: 1, background: i < idx ? T.primary : T.border, minWidth: 16, margin: '0 10px' }} /> : null}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  if (variant === 'progress-bar') {
    const pct = labels.length > 1 ? Math.round((idx / (labels.length - 1)) * 100) : 100;
    return (
      <div style={wrap}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{labels[idx]}</span>
          <span style={{ fontSize: 12, color: T.sub }}>{'Step ' + (idx + 1) + ' / ' + labels.length + ' · ' + pct + '%'}</span>
        </div>
        <div style={{ position: 'relative', height: 8, background: T.card, borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, width: pct + '%', background: 'linear-gradient(90deg,' + T.primary + ',' + T.primary + ')', borderRadius: 6, transition: 'width .3s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7 }}>
          {labels.map(function (lab, i) {
            return <span key={i} style={{ fontSize: 11, color: i === idx ? T.primary : T.sub, fontWeight: i === idx ? 600 : 400, flex: 1, textAlign: i === 0 ? 'left' : (i === labels.length - 1 ? 'right' : 'center') }}>{lab}</span>;
          })}
        </div>
      </div>
    );
  }

  if (variant === 'chevron') {
    return (
      <div style={{ ...wrap, padding: 0, overflow: 'hidden', display: 'flex' }}>
        {labels.map(function (lab, i) {
          const done = i < idx, active = i === idx;
          const bg = done ? T.primary : (active ? T.primary : T.card);
          const fg = done || active ? '#fff' : T.sub;
          const first = i === 0, last = i === labels.length - 1;
          const clip = first
            ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
            : (last ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)' : 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)');
          return (
            <span key={i} style={{ flex: '1 1 0', minWidth: 64, marginLeft: first ? 0 : -10, padding: '10px 8px 10px ' + (first ? '14px' : '22px'), fontSize: 12.5, fontWeight: active ? 700 : 500, color: fg, background: bg, clipPath: clip, textAlign: 'center', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              {done ? <span style={{ fontSize: 11 }}>✓</span> : <span style={{ width: 16, height: 16, borderRadius: '50%', background: active ? 'rgba(255,255,255,0.25)' : 'transparent', border: active ? 'none' : '1px solid ' + T.border, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700 }}>{i + 1}</span>}
              {lab}
            </span>
          );
        })}
      </div>
    );
  }

  // default — antd Steps
  return (
    <div style={wrap}>
      <Steps
        size="small"
        current={idx}
        items={enumOpts.map(function (o) { return { title: o.label || String(o.value) }; })}
      />
    </div>
  );
}

ctx.render(<Comp />);
```
