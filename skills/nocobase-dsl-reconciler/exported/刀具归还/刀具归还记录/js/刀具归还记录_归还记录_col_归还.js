
const h = ctx.React.createElement;
const r = ctx.record || {};
ctx.render(h('div', {style:{lineHeight:'20px'}}, [
  h('div', {key:'m', style:{fontWeight:500, color:'#1890ff', fontSize:13}}, r.borrow_code || '-'),
  h('div', {key:'s', style:{fontSize:11, color:'#999'}},  + ' ·(r.status||'-') ' + (r.returner||'-')),
]));
