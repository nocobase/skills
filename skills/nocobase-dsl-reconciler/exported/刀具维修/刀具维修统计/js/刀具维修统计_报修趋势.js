
(async () => {
  const h = ctx.React.createElement;
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_repair:list', params: { pageSize: 500, sort: ['-report_date'] }
    });
    const data = r?.data?.data || [];
    const months = {};
    data.forEach(d => {
      if (!d.report_date) return;
      const m = d.report_date.substring(0, 7);
      months[m] = (months[m]||0) + 1;
    });
    const sorted = Object.entries(months).sort((a,b) => a[0].localeCompare(b[0])).slice(-6);
    const maxVal = Math.max(...sorted.map(s => s[1]), 1);
    const barH = 120;

    const bars = sorted.map(([month, cnt]) =>
      h('div', {key:month, style:{flex:1, display:'flex', flexDirection:'column', alignItems:'center'}}, [
        h('div', {key:'v', style:{fontSize:12, fontWeight:500, color:'#faad14'}}, cnt),
        h('div', {key:'b', style:{width:28, height:barH, background:'#f0f0f0', borderRadius:4, display:'flex', alignItems:'flex-end', overflow:'hidden'}},
          h('div', {style:{width:'100%', height:Math.round(cnt/maxVal*100)+'%', background:'linear-gradient(180deg, #faad14, #ffd666)', borderRadius:4}})
        ),
        h('div', {key:'l', style:{fontSize:11, color:'#999', marginTop:4}}, month.substring(5)),
      ])
    );

    ctx.render(h('div', {style:{padding:'12px 16px'}}, [
      h('div', {key:'h', style:{fontSize:14, fontWeight:500, marginBottom:12}}, '报修趋势'),
      h('div', {key:'c', style:{display:'flex', gap:8, minHeight:barH+40}},
        bars.length > 0 ? bars : [h('div',{key:'e',style:{color:'#ccc',flex:1,textAlign:'center'}},'暂无数据')]
      ),
    ]));
  } catch(e) { ctx.render(h('div',{style:{color:'red',padding:16}},'错误: '+e.message)); }
})();
