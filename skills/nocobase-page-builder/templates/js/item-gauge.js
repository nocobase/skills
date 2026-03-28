// Item: Gauge/Progress — shows a progress circle or bar with label
// Tool: nb_inject_js(uid, code)
// Placeholders: {VALUE_FIELD}, {TOTAL_FIELD}, {LABEL}
// If {TOTAL_FIELD} = a number literal (e.g. "100"), uses that as fixed max
// Otherwise reads from record field
(async()=>{const h=ctx.React.createElement;const{Progress,Card}=ctx.antd;const r=ctx.record||{};const used=Number(r.{VALUE_FIELD})||0;const totalRaw='{TOTAL_FIELD}';const total=Number(r[totalRaw])||Number(totalRaw)||1;const pct=Math.round(used/total*100);const color=pct>95?'#ff4d4f':pct>80?'#faad14':'#52c41a';ctx.render(h(Card,{size:'small'},h('div',{style:{display:'flex',alignItems:'center',gap:16}},h(Progress,{type:'circle',percent:Math.min(pct,100),strokeColor:color,width:64,format:function(){return pct+'%';}}),h('div',null,h('div',{style:{fontSize:14,fontWeight:500}},'{LABEL}'),h('div',{style:{fontSize:12,color:'#8c8c8c',marginTop:2}},used+' / '+total)))));})();
