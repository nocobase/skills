// 寿命预警 — 接近设计寿命的刀具列表
(async () => {
  const h = ctx.React.createElement;
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_tools:list',
      params: { pageSize: 500, filter: { status: { '$ne': '已报废' } } }
    });
    const data = (r?.data?.data || [])
      .filter(d => d.life_total > 0 && d.life_used > 0)
      .map(d => ({ ...d, ratio: Math.round((d.life_used / d.life_total) * 100) }))
      .filter(d => d.ratio >= 60)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 10);

    const danger = data.filter(d => d.ratio >= 90).length;
    const warn = data.filter(d => d.ratio >= 70 && d.ratio < 90).length;

    const rows = data.map((d, i) => {
      const barColor = d.ratio >= 90 ? '#ef4444' : d.ratio >= 70 ? '#f59e0b' : '#3b82f6';
      const tag = d.ratio >= 90 ? '危险' : d.ratio >= 70 ? '预警' : '关注';
      const tagBg = d.ratio >= 90 ? '#fef2f2' : d.ratio >= 70 ? '#fffbeb' : '#eff6ff';
      return h('div', {key:i, style:{display:'flex', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #f5f5f5'}}, [
        h('div', {key:'n', style:{width:120, fontSize:13, fontWeight:500, color:'#333'}}, d.name || d.code),
        h('div', {key:'b', style:{flex:1, height:16, background:'#f0f0f0', borderRadius:3, overflow:'hidden', margin:'0 12px'}},
          h('div', {style:{width:d.ratio+'%', height:'100%', background:barColor, borderRadius:3, transition:'width 0.6s'}})
        ),
        h('div', {key:'r', style:{width:80, fontSize:12, color:barColor, fontWeight:500, textAlign:'right'}}, d.life_used+'/'+d.life_total),
        h('span', {key:'t', style:{marginLeft:8, fontSize:11, padding:'1px 6px', borderRadius:3, background:tagBg, color:barColor, fontWeight:500}}, tag),
      ]);
    });

    ctx.render(h('div', {style:{padding:'12px 16px'}}, [
      h('div', {key:'h', style:{fontSize:14, fontWeight:500, marginBottom:4, color:'#333'}}, '寿命预警'),
      h('div', {key:'s', style:{fontSize:12, color:'#999', marginBottom:12}},
        `${danger} 危险 · ${warn} 预警 · ${data.length - danger - warn} 关注`),
      data.length > 0
        ? h('div', {key:'list'}, rows)
        : h('div', {key:'e', style:{color:'#ccc', textAlign:'center', padding:24}}, '暂无预警刀具'),
    ]));
  } catch(e) {
    ctx.render(h('div', {style:{color:'red',padding:16}}, '加载失败: '+e.message));
  }
})();
