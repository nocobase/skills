
const h = ctx.React.createElement;
const r = ctx.record || {};
const hours = r.repair_hours;
if (hours == null) { ctx.render(h('span', {style:{color:'#999'}}, '-')); return; }
const color = hours > 24 ? '#ff4d4f' : hours > 8 ? '#faad14' : '#52c41a';
ctx.render(h('span', {style:{color, fontWeight:'bold'}}, hours.toFixed(1) + 'h'));
