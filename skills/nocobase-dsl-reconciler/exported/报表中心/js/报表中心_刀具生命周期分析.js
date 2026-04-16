/**
 *
 * @type JSBlockModel
 * @collection nb_tm_tools
 */
// data: ctx.request via ctx.api
// 刀具生命周期分析 — 综合利用率与健康度
(async () => {
  const h = ctx.React.createElement;
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_tools:list', params: { pageSize: 500, appends: ['category_rel'] }
    });
    const data = r?.data?.data || [];
    const active = data.filter(d => d.status !== '已报废' && d.life_total > 0);

    // 按利用率分段
    const segments = { '0-25%': 0, '25-50%': 0, '50-75%': 0, '75-90%': 0, '90-100%': 0, '>100%': 0 };
    active.forEach(d => {
      const ratio = d.life_total > 0 ? (d.life_used || 0) / d.life_total * 100 : 0;
      if (ratio > 100) segments['>100%']++;
      else if (ratio >= 90) segments['90-100%']++;
      else if (ratio >= 75) segments['75-90%']++;
      else if (ratio >= 50) segments['50-75%']++;
      else if (ratio >= 25) segments['25-50%']++;
      else segments['0-25%']++;
    });

    const segColors = { '0-25%': '#10b981', '25-50%': '#3b82f6', '50-75%': '#06b6d4', '75-90%': '#f59e0b', '90-100%': '#ef4444', '>100%': '#991b1b' };
    const total = active.length;
    const avgUtil = total > 0
      ? Math.round(active.reduce((s, d) => s + (d.life_total > 0 ? (d.life_used||0)/d.life_total*100 : 0), 0) / total)
      : 0;

    // Horizontal stacked bar
    const segments2 = Object.entries(segments).filter(([,v]) => v > 0);
    const stackBar = h('div', {key:'stack', style:{display:'flex', height:32, borderRadius:6, overflow:'hidden', marginBottom:16}},
      segments2.map(([label, cnt]) => {
        const pct = total > 0 ? (cnt / total * 100) : 0;
        return h('div', {key:label, style:{width:pct+'%', background:segColors[label], display:'flex', alignItems:'center', justifyContent:'center', minWidth: cnt > 0 ? 20 : 0, transition:'width 0.6s'}},
          pct > 8 ? h('span', {style:{fontSize:10, color:'#fff', fontWeight:500}}, cnt) : null
        );
      })
    );

    // Legend
    const legend = h('div', {key:'legend', style:{display:'flex', flexWrap:'wrap', gap:'8px 16px', marginBottom:16}},
      Object.entries(segments).map(([label, cnt]) =>
        h('span', {key:label, style:{fontSize:11, display:'flex', alignItems:'center', gap:4}}, [
          h('span', {key:'d', style:{display:'inline-block', width:10, height:10, borderRadius:2, background:segColors[label]}}),
          `${label}: ${cnt}`,
        ])
      )
    );

    // Category avg utilization
    const catUtil = {};
    active.forEach(d => {
      const cat = d.category_rel?.name || '未分类';
      if (!catUtil[cat]) catUtil[cat] = { total: 0, used: 0, count: 0 };
      catUtil[cat].total += d.life_total || 0;
      catUtil[cat].used += d.life_used || 0;
      catUtil[cat].count++;
    });
    const catBars = Object.entries(catUtil)
      .map(([cat, v]) => ({ cat, avg: v.total > 0 ? Math.round(v.used/v.total*100) : 0, count: v.count }))
      .sort((a,b) => b.avg - a.avg);

    const catBarEls = catBars.map((d, i) => {
      const barColor = d.avg >= 90 ? '#ef4444' : d.avg >= 70 ? '#f59e0b' : '#3b82f6';
      return h('div', {key:i, style:{display:'flex', alignItems:'center', marginBottom:6}}, [
        h('div', {key:'l', style:{width:60, fontSize:12, color:'#666', textAlign:'right', marginRight:8}}, d.cat),
        h('div', {key:'b', style:{flex:1, height:18, background:'#f5f5f5', borderRadius:3, overflow:'hidden'}},
          h('div', {style:{width:d.avg+'%', height:'100%', background:barColor, borderRadius:3, display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:4}},
            h('span', {style:{fontSize:10, color:'#fff'}}, d.avg+'%')
          )
        ),
        h('div', {key:'c', style:{width:40, fontSize:11, color:'#999', marginLeft:6}}, d.count+'把'),
      ]);
    });

    ctx.render(h('div', {style:{padding:'12px 16px'}}, [
      h('div', {key:'h', style:{fontSize:14, fontWeight:500, marginBottom:4, color:'#333'}}, '刀具生命周期分析'),
      h('div', {key:'s', style:{fontSize:12, color:'#999', marginBottom:16}}, `${total} 把在用刀具 · 平均利用率 ${avgUtil}%`),
      h('div', {key:'sub', style:{fontSize:12, color:'#666', fontWeight:500, marginBottom:8}}, '利用率分布'),
      stackBar, legend,
      h('div', {key:'cat_h', style:{fontSize:12, color:'#666', fontWeight:500, marginBottom:8}}, '分类平均利用率'),
      ...catBarEls,
    ]));
  } catch(e) {
    ctx.render(h('div', {style:{color:'red',padding:16}}, '加载失败: '+e.message));
  }
})();
