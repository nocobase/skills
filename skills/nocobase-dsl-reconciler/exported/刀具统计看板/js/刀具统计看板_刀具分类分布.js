// 刀具分类分布 — 使用 category_rel (m2o) 而非 category (select)
(async () => {
  const h = ctx.React.createElement;
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_tools:list', params: { pageSize: 500, appends: ['category_rel'] }
    });
    const data = r?.data?.data || [];
    const counts = {};
    data.forEach(d => { const c = d.category_rel?.name || '未分类'; counts[c] = (counts[c]||0) + 1; });
    const items = Object.entries(counts).sort((a,b) => b[1]-a[1]);
    const total = data.length;
    const colors = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#ef4444'];

    const bars = items.map(([cat, cnt], i) => {
      const pct = total ? Math.round(cnt/total*100) : 0;
      return h('div', {key:cat, style:{display:'flex', alignItems:'center', marginBottom:8}}, [
        h('div', {key:'l', style:{width:70, fontSize:13, color:'#666', textAlign:'right', marginRight:8}}, cat),
        h('div', {key:'b', style:{flex:1, height:24, background:'#f5f5f5', borderRadius:4, overflow:'hidden'}},
          h('div', {style:{width:Math.max(pct, 3)+'%', height:'100%', background:colors[i%colors.length], borderRadius:4,
            transition:'width 0.6s', display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:6}},
            h('span', {style:{color:'#fff', fontSize:11, fontWeight:500}}, cnt)
          )
        ),
        h('div', {key:'p', style:{width:40, fontSize:12, color:'#999', marginLeft:6}}, pct+'%'),
      ]);
    });

    ctx.render(h('div', {style:{padding:'12px 16px'}}, [
      h('div', {key:'h', style:{fontSize:14, fontWeight:500, marginBottom:12, color:'#333'}}, '刀具分类分布'),
      h('div', {key:'t', style:{fontSize:12, color:'#999', marginBottom:16}}, '共 '+total+' 把刀具'),
      ...bars
    ]));
  } catch(e) {
    ctx.render(h('div', {style:{color:'red',padding:16}}, '加载失败: '+e.message));
  }
})();
