
(async () => {
  const h = ctx.React.createElement;
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_tools:list', params: { pageSize: 500, filter: { status: { '$ne': '已报废' } } }
    });
    const data = (r?.data?.data || [])
      .filter(d => d.life_used > 0)
      .sort((a,b) => b.life_used - a.life_used)
      .slice(0, 8);
    const maxVal = Math.max(...data.map(d => d.life_total || 1), 1);

    const bars = data.map((d, i) => {
      const usedPct = Math.round((d.life_used||0)/maxVal*100);
      const totalPct = Math.round((d.life_total||0)/maxVal*100);
      const ratio = d.life_total ? Math.round(d.life_used/d.life_total*100) : 0;
      const barColor = ratio >= 90 ? '#ff4d4f' : ratio >= 70 ? '#faad14' : '#1890ff';
      return h('div', {key:i, style:{marginBottom:10}}, [
        h('div', {key:'n', style:{fontSize:12, color:'#333', marginBottom:2, display:'flex', justifyContent:'space-between'}}, [
          h('span', {key:'l'}, d.name || d.code),
          h('span', {key:'r', style:{color: barColor, fontWeight:500}}, d.life_used+'/'+d.life_total+' ('+ratio+'%)'),
        ]),
        h('div', {key:'b', style:{height:16, background:'#f0f0f0', borderRadius:3, position:'relative', overflow:'hidden'}}, [
          h('div', {key:'t', style:{position:'absolute', width:totalPct+'%', height:'100%', background:'#f0f0f0', borderRadius:3}}),
          h('div', {key:'u', style:{position:'absolute', width:usedPct+'%', height:'100%', background:barColor, borderRadius:3, transition:'width 0.6s'}}),
        ]),
      ]);
    });

    ctx.render(h('div', {style:{padding:'12px 16px'}}, [
      h('div', {key:'h', style:{fontSize:14, fontWeight:500, marginBottom:4, color:'#333'}}, '刀具使用对比'),
      h('div', {key:'s', style:{fontSize:12, color:'#999', marginBottom:12}}, 'Top 8 使用量（蓝=正常 黄=预警 红=接近报废）'),
      ...bars,
    ]));
  } catch(e) {
    ctx.render(h('div', {style:{color:'red',padding:16}}, '加载失败: '+e.message));
  }
})();
