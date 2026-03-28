// Item: Lifecycle Status — shows current position in a status pipeline + optional depreciation
// Tool: nb_inject_js(uid, code)
// Placeholders: {STATUS_FIELD}, {STAGES}, {STATUS_COLORS}
// {STAGES} = ordered stage array: ["Procurement","Stocked","In Use","Scrapped"]
// {STATUS_COLORS} = color map: {"In Use":"#52c41a","Idle":"#faad14","Scrapped":"#999"}
(async()=>{const h=ctx.React.createElement;const{Card,Tag}=ctx.antd;const r=ctx.record||{};const status=r.{STATUS_FIELD}||'';const stages={STAGES};const colors={STATUS_COLORS};const idx=stages.findIndex(s=>s===status);ctx.render(h(Card,{size:'small',style:{marginBottom:8}},h(Tag,{color:colors[status]||'#999',style:{fontSize:14,padding:'4px 16px',borderRadius:12,marginBottom:12}},status||'Unknown'),h('div',{style:{display:'flex',gap:4}},...stages.map((stage,i)=>{const isActive=i<=idx;return h('div',{key:i,style:{flex:1}},h('div',{style:{height:6,borderRadius:3,background:isActive?(colors[status]||'#1890ff'):'#f0f0f0'}}),h('div',{style:{textAlign:'center',fontSize:11,marginTop:4,color:isActive?'#333':'#999'}},stage));}))));})();
