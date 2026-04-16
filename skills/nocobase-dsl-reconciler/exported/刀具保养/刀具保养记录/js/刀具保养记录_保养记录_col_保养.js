
const h = ctx.React.createElement;
const r = ctx.record || {};
const qual = r.is_qualified;
const qTag = qual == null ? null : h(ctx.antd.Tag, {key:'q', color: qual ? 'green' : 'red', style:{fontSize:11}}, qual ? '合格' : '不合格');
ctx.render(h('div', {style:{lineHeight:'20px'}}, [
  h('div', {key:'m', style:{fontWeight:500, color:'#1890ff', fontSize:13}}, r.operator || '-'),
  h('div', {key:'s', style:{fontSize:11, color:'#999', display:'flex', alignItems:'center', gap:4}}, [
    h('span', {key:'st'}, r.status || '-'),
    qTag,
  ]),
]));
