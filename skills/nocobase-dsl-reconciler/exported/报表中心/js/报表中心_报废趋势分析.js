/**
 *
 * @type JSBlockModel
 * @collection nb_tm_tools
 */
// data: ctx.request via ctx.api
// 报废趋势报表
(async () => {
  const h = ctx.React.createElement;
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_scrap:list', params: { pageSize: 500, appends: ['tool'] }
    });
    const data = r?.data?.data || [];

    // By month
    const months = {};
    data.forEach(d => {
      if (!d.apply_date) return;
      const m = d.apply_date.substring(0, 7);
      months[m] = (months[m] || 0) + 1;
    });
    const sorted = Object.entries(months).sort((a,b) => a[0].localeCompare(b[0])).slice(-12);

    // By reason (top reasons)
    const reasons = {};
    data.forEach(d => {
      const reason = (d.reason || '').substring(0, 20) || '未注明';
      reasons[reason] = (reasons[reason] || 0) + 1;
    });
    const topReasons = Object.entries(reasons).sort((a,b) => b[1]-a[1]).slice(0, 5);

    // Status breakdown
    const statuses = {};
    data.forEach(d => { const s = d.status || '未知'; statuses[s] = (statuses[s]||0) + 1; });

    const maxVal = Math.max(...sorted.map(([,v]) => v), 1);
    const barH = 100;

    const trendBars = sorted.map(([month, cnt]) => {
      const pct = Math.round(cnt / maxVal * 100);
      return h('div', {key:month, style:{flex:1, display:'flex', flexDirection:'column', alignItems:'center'}}, [
        h('div', {key:'v', style:{fontSize:11, fontWeight:500, color:'#ef4444', marginBottom:2}}, cnt),
        h('div', {key:'b', style:{width:24, height:barH, background:'#f0f0f0', borderRadius:4, display:'flex', alignItems:'flex-end', overflow:'hidden'}},
          h('div', {style:{width:'100%', height:pct+'%', background:'linear-gradient(180deg, #ef4444, #fca5a5)', borderRadius:4, transition:'height 0.6s'}})
        ),
        h('div', {key:'l', style:{fontSize:10, color:'#999', marginTop:4}}, month.substring(5)),
      ]);
    });

    const reasonBars = topReasons.map(([reason, cnt], i) => {
      const pct = data.length ? Math.round(cnt/data.length*100) : 0;
      return h('div', {key:i, style:{display:'flex', alignItems:'center', marginBottom:6}}, [
        h('div', {key:'l', style:{width:120, fontSize:12, color:'#666', textAlign:'right', marginRight:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}, reason),
        h('div', {key:'b', style:{flex:1, height:18, background:'#f5f5f5', borderRadius:3, overflow:'hidden'}},
          h('div', {style:{width:Math.max(pct, 3)+'%', height:'100%', background:'#fca5a5', borderRadius:3}},
            h('span', {style:{fontSize:10, color:'#ef4444', paddingLeft:4}}, cnt)
          )
        ),
      ]);
    });

    ctx.render(h('div', {style:{padding:'12px 16px'}}, [
      h('div', {key:'h', style:{fontSize:14, fontWeight:500, marginBottom:4, color:'#333'}}, '报废趋势分析'),
      h('div', {key:'s', style:{fontSize:12, color:'#999', marginBottom:16}}, `共 ${data.length} 条报废记录`),
      h('div', {key:'trend_h', style:{fontSize:12, color:'#666', fontWeight:500, marginBottom:8}}, '月度报废趋势'),
      h('div', {key:'trend', style:{display:'flex', gap:6, alignItems:'flex-end', minHeight:barH+30, marginBottom:20}},
        sorted.length > 0 ? trendBars : [h('div', {key:'e', style:{color:'#ccc', flex:1, textAlign:'center'}}, '暂无数据')]
      ),
      h('div', {key:'reason_h', style:{fontSize:12, color:'#666', fontWeight:500, marginBottom:8}}, '报废原因 Top5'),
      ...(topReasons.length > 0 ? reasonBars : [h('div', {key:'e2', style:{color:'#ccc', textAlign:'center'}}, '暂无数据')]),
    ]));
  } catch(e) {
    ctx.render(h('div', {style:{color:'red',padding:16}}, '加载失败: '+e.message));
  }
})();
