
const h = ctx.React.createElement;
const r = ctx.record || {};
const remain = (r.life_total||0) - (r.life_used||0);
const color = remain <= 0 ? '#ff4d4f' : remain < 500 ? '#faad14' : '#52c41a';
ctx.render(h('span', {style:{color, fontWeight:'bold', fontSize:13}}, remain));
