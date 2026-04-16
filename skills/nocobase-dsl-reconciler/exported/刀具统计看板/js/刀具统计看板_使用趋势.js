
(async () => {
  const h = ctx.React.createElement;
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_borrow:list', params: { pageSize: 500, sort: ['-apply_date'] }
    });
    const data = r?.data?.data || [];
    // Group by month
    const months = {};
    data.forEach(d => {
      if (!d.apply_date) return;
      const m = d.apply_date.substring(0, 7); // YYYY-MM
      months[m] = (months[m]||0) + 1;
    });
    const sorted = Object.entries(months).sort((a,b) => a[0].localeCompare(b[0])).slice(-6);
    const maxVal = Math.max(...sorted.map(s => s[1]), 1);

    // Vertical bar chart
    const barH = 140;
    const bars = sorted.map(([month, cnt], i) => {
      const pct = Math.round(cnt/maxVal*100);
      return h('div', {key:month, style:{flex:1, display:'flex', flexDirection:'column', alignItems:'center'}}, [
        h('div', {key:'v', style:{fontSize:12, fontWeight:500, color:'#1890ff', marginBottom:4}}, cnt),
        h('div', {key:'b', style:{width:28, height:barH, background:'#f0f0f0', borderRadius:4, display:'flex', alignItems:'flex-end', overflow:'hidden'}},
          h('div', {style:{width:'100%', height:pct+'%', background:'linear-gradient(180deg, #1890ff, #69c0ff)', borderRadius:4, transition:'height 0.6s'}})
        ),
        h('div', {key:'l', style:{fontSize:11, color:'#999', marginTop:4}}, month.substring(5)),
      ]);
    });

    ctx.render(h('div', {style:{padding:'12px 16px'}}, [
      h('div', {key:'h', style:{fontSize:14, fontWeight:500, marginBottom:4, color:'#333'}}, '领用趋势'),
      h('div', {key:'s', style:{fontSize:12, color:'#999', marginBottom:16}}, '近6个月领用次数'),
      h('div', {key:'c', style:{display:'flex', gap:8, alignItems:'flex-end', minHeight:barH+40}},
        sorted.length > 0 ? bars : [h('div', {key:'e', style:{color:'#ccc',flex:1,textAlign:'center'}}, '暂无数据')]
      ),
    ]));
  } catch(e) {
    ctx.render(h('div', {style:{color:'red',padding:16}}, '加载失败: '+e.message));
  }
})();
