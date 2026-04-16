// 库存按库位分布 — 横向条形图
(async () => {
  const h = ctx.React.createElement;
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_tools:list', params: { pageSize: 500, appends: ['location'] }
    });
    const data = r?.data?.data || [];
    const counts = {};
    data.forEach(d => {
      const loc = d.location?.name || '未分配';
      counts[loc] = (counts[loc]||0) + 1;
    });
    const items = Object.entries(counts).sort((a,b) => b[1]-a[1]);
    const total = data.length;
    const colors = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899'];

    const bars = items.map(([loc, cnt], i) => {
      const pct = total ? Math.round(cnt/total*100) : 0;
      return h('div', {key:loc, style:{display:'flex', alignItems:'center', marginBottom:8}}, [
        h('div', {key:'l', style:{width:80, fontSize:13, color:'#666', textAlign:'right', marginRight:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}, loc),
        h('div', {key:'b', style:{flex:1, height:24, background:'#f5f5f5', borderRadius:4, overflow:'hidden'}},
          h('div', {style:{width:Math.max(pct, 3)+'%', height:'100%', background:colors[i%colors.length], borderRadius:4, transition:'width 0.6s', display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:6}},
            h('span', {style:{color:'#fff', fontSize:11, fontWeight:500}}, cnt)
          )
        ),
        h('div', {key:'p', style:{width:40, fontSize:12, color:'#999', marginLeft:6}}, pct+'%'),
      ]);
    });

    ctx.render(h('div', {style:{padding:'12px 16px'}}, [
      h('div', {key:'h', style:{fontSize:14, fontWeight:500, marginBottom:12, color:'#333'}}, '库存按库位分布'),
      h('div', {key:'t', style:{fontSize:12, color:'#999', marginBottom:16}}, `共 ${total} 把刀具，${items.length} 个库位`),
      ...bars
    ]));
  } catch(e) {
    ctx.render(h('div', {style:{color:'red',padding:16}}, '加载失败: '+e.message));
  }
})();
