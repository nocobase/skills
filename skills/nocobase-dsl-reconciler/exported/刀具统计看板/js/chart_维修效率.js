// 维修效率分析 — 平均维修耗时和完成率
(async () => {
  const h = ctx.React.createElement;
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_repair:list', params: { pageSize: 500 }
    });
    const data = r?.data?.data || [];
    const total = data.length;
    const completed = data.filter(d => d.status === '已完成');
    const inProgress = data.filter(d => d.status === '维修中');
    const avgHours = completed.length > 0
      ? (completed.reduce((s, d) => s + (d.repair_hours || 0), 0) / completed.length).toFixed(1)
      : '0';
    const completionRate = total > 0 ? Math.round(completed.length / total * 100) : 0;

    // Group completed by month
    const months = {};
    completed.forEach(d => {
      if (!d.end_time) return;
      const m = d.end_time.substring(0, 7);
      if (!months[m]) months[m] = { count: 0, hours: 0 };
      months[m].count++;
      months[m].hours += d.repair_hours || 0;
    });
    const sorted = Object.entries(months).sort((a,b) => a[0].localeCompare(b[0])).slice(-6);

    // Summary cards
    const stats = [
      { label: '总报修', value: total, color: '#3b82f6' },
      { label: '维修中', value: inProgress.length, color: '#f59e0b' },
      { label: '已完成', value: completed.length, color: '#10b981' },
      { label: '平均耗时', value: avgHours + 'h', color: '#8b5cf6' },
      { label: '完成率', value: completionRate + '%', color: '#06b6d4' },
    ];

    const statCards = stats.map((s, i) =>
      h('div', {key:i, style:{flex:1, textAlign:'center', padding:'8px 4px'}}, [
        h('div', {key:'v', style:{fontSize:20, fontWeight:700, color:s.color}}, s.value),
        h('div', {key:'l', style:{fontSize:11, color:'#999', marginTop:2}}, s.label),
      ])
    );

    // Monthly trend
    const maxCnt = Math.max(...sorted.map(([,v]) => v.count), 1);
    const barH = 80;
    const bars = sorted.map(([month, v], i) => {
      const pct = Math.round(v.count / maxCnt * 100);
      const avgH = v.count > 0 ? (v.hours / v.count).toFixed(1) : '0';
      return h('div', {key:month, style:{flex:1, display:'flex', flexDirection:'column', alignItems:'center'}}, [
        h('div', {key:'v', style:{fontSize:11, fontWeight:500, color:'#10b981', marginBottom:2}}, v.count),
        h('div', {key:'b', style:{width:24, height:barH, background:'#f0f0f0', borderRadius:4, display:'flex', alignItems:'flex-end', overflow:'hidden'}},
          h('div', {style:{width:'100%', height:pct+'%', background:'linear-gradient(180deg, #10b981, #6ee7b7)', borderRadius:4, transition:'height 0.6s'}})
        ),
        h('div', {key:'m', style:{fontSize:10, color:'#999', marginTop:4}}, month.substring(5)),
        h('div', {key:'h', style:{fontSize:10, color:'#8b5cf6'}}, avgH+'h'),
      ]);
    });

    ctx.render(h('div', {style:{padding:'12px 16px'}}, [
      h('div', {key:'h', style:{fontSize:14, fontWeight:500, marginBottom:12, color:'#333'}}, '维修效率分析'),
      h('div', {key:'stats', style:{display:'flex', gap:4, marginBottom:16, padding:'8px 0', borderBottom:'1px solid #f0f0f0'}}, statCards),
      h('div', {key:'trend_h', style:{fontSize:12, color:'#999', marginBottom:8}}, '月度完成趋势（含平均耗时）'),
      h('div', {key:'trend', style:{display:'flex', gap:8, alignItems:'flex-end', minHeight:barH+50}},
        sorted.length > 0 ? bars : [h('div', {key:'e', style:{color:'#ccc', flex:1, textAlign:'center'}}, '暂无数据')]
      ),
    ]));
  } catch(e) {
    ctx.render(h('div', {style:{color:'red',padding:16}}, '加载失败: '+e.message));
  }
})();
