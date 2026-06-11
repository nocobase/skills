# `noticeBanner` — Notice banner

A static styled callout — alert / outline / left-accent / icon tile

**kind** `block` · alsoKinds: item · **scope** `any` · **category** Style

## `$p` inputs

| `$p.` | type | req | default | notes |
|---|---|---|---|---|
| `title` | text |  |  |  |
| `text` | text |  |  |  |
| `type` | select |  | `info` | opts: info/success/warning/error |
| `variant` | styleSelect |  | `alert` | opts: alert/outline/leftAccent/iconTile/gradient/ribbon/minimal |
| `theme` | theme |  | `default` |  |


## body (write to the JS model `stepParams.jsSettings.runJs.code`, prefixed with `const $p = {...}`)

```js
const { Alert } = ctx.antd;
const T = $p.__theme || { primary: '#1677ff', bg: '#ffffff', card: '#fafafa', text: 'rgba(0,0,0,0.85)', sub: 'rgba(0,0,0,0.45)', border: '#f0f0f0' };

const SEV = {
  info: { color: '#1677ff', icon: 'ℹ️' },
  success: { color: '#52c41a', icon: '✅' },
  warning: { color: '#faad14', icon: '⚠️' },
  error: { color: '#ff4d4f', icon: '⛔' },
};

function hexToRgba(hex, a) {
  const h = String(hex).replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

function NoticeBanner() {
  const sev = SEV[$p.type || 'info'] || SEV.info;
  const v = $p.variant || 'alert';
  const title = $p.title || '';
  const text = $p.text || '';

  if (v === 'outline') {
    return (
      <div style={{ padding: '12px 14px', background: T.bg, borderRadius: 10, border: '1px solid ' + sev.color }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ fontSize: 16, lineHeight: 1.3 }}>{sev.icon}</span>
          <span style={{ minWidth: 0 }}>
            {title ? <div style={{ fontSize: 13, fontWeight: 600, color: sev.color }}>{title}</div> : null}
            {text ? <div style={{ fontSize: 12, color: T.sub, marginTop: title ? 2 : 0 }}>{text}</div> : null}
          </span>
        </div>
      </div>
    );
  }

  if (v === 'leftAccent') {
    return (
      <div style={{ padding: '12px 14px', background: hexToRgba(sev.color, 0.08), borderRadius: 10, borderLeft: '4px solid ' + sev.color }}>
        {title ? <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{title}</div> : null}
        {text ? <div style={{ fontSize: 12, color: T.sub, marginTop: title ? 2 : 0 }}>{text}</div> : null}
      </div>
    );
  }

  if (v === 'iconTile') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
        <span style={{ width: 46, height: 46, borderRadius: 12, background: hexToRgba(sev.color, 0.14), color: sev.color, display: 'grid', placeItems: 'center', fontSize: 22, flexShrink: 0 }}>{sev.icon}</span>
        <span style={{ minWidth: 0 }}>
          {title ? <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{title}</div> : null}
          {text ? <div style={{ fontSize: 12, color: T.sub, marginTop: title ? 2 : 0 }}>{text}</div> : null}
        </span>
      </div>
    );
  }

  if (v === 'gradient') {
    return (
      <div style={{ position: 'relative', overflow: 'hidden', padding: '14px 16px', borderRadius: 10, background: 'linear-gradient(135deg,' + sev.color + ',' + hexToRgba(sev.color, 0.7) + ')', color: '#fff' }}>
        <div style={{ position: 'absolute', right: -24, top: -24, width: 96, height: 96, borderRadius: '50%', background: 'rgba(255,255,255,0.14)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>{sev.icon}</span>
          <span style={{ minWidth: 0 }}>
            {title ? <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div> : null}
            {text ? <div style={{ fontSize: 12, opacity: 0.9, marginTop: title ? 2 : 0 }}>{text}</div> : null}
          </span>
        </div>
      </div>
    );
  }

  if (v === 'ribbon') {
    return (
      <div style={{ display: 'flex', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border, overflow: 'hidden' }}>
        <div style={{ width: 8, background: sev.color, flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', minWidth: 0 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{sev.icon}</span>
          <span style={{ minWidth: 0 }}>
            {title ? <div style={{ fontSize: 13, fontWeight: 700, color: T.text, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {title}
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: sev.color, background: hexToRgba(sev.color, 0.12), borderRadius: 4, padding: '1px 6px' }}>{$p.type || 'info'}</span>
            </div> : null}
            {text ? <div style={{ fontSize: 12, color: T.sub, marginTop: title ? 2 : 0 }}>{text}</div> : null}
          </span>
        </div>
      </div>
    );
  }

  if (v === 'minimal') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 13 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: sev.color, flexShrink: 0 }} />
        {title ? <b style={{ color: T.text, whiteSpace: 'nowrap' }}>{title}</b> : null}
        {text ? <span style={{ color: T.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span> : null}
      </div>
    );
  }

  // alert (default)
  return (
    <div style={{ padding: '8px 12px', background: T.bg, borderRadius: 10, border: '1px solid ' + T.border }}>
      <Alert showIcon type={$p.type || 'info'} message={title} description={text} />
    </div>
  );
}

ctx.render(<NoticeBanner />);
```
