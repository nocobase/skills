
(async () => {
  const h = ctx.React.createElement;
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_repair:list', params: { pageSize: 500, appends: ['tool'] }
    });
    const data = r?.data?.data || [];
    const cats = {};
    data.forEach(d => {
      const cat = d.tool?.category || '未知';
      cats[cat] = (cats[cat]||0) + 1;
    });
    const items = Object.entries(cats).sort((a,b) => b[1]-a[1]);
    const total = data.length;
    const colors = ['#ff4d4f','#faad14','#1890ff','#52c41a','#722ed1','#13c2c2','#eb2f96'];

    // Donut-style with stats
    const segments = items.map(([cat, cnt], i) => {
      const pct = total ? Math.round(cnt/total*100) : 0;
      return h('div', {key:cat, style:{display:'flex', alignItems:'center', marginBottom:8}}, [
        h('div', {key:'d', style:{width:12, height:12, borderRadius:2, background:colors[i%colors.length], marginRight:8}}),
        h('div', {key:'n', style:{flex:1, fontSize:13, color:'#333'}}, cat),
        h('div', {key:'c', style:{fontSize:13, fontWeight:500, color:'#333', marginRight:8}}, cnt+'次'),
        h('div', {key:'p', style:{fontSize:12, color:'#999', width:35}}, pct+'%'),
      ]);
    });

    ctx.render(h('div', {style:{padding:'12px 16px'}}, [
      h('div', {key:'h', style:{fontSize:14, fontWeight:500, marginBottom:4}}, '维修分布（按刀具类别）'),
      h('div', {key:'s', style:{fontSize:12, color:'#999', marginBottom:12}}, '共 '+total+' 次维修'),
      ...segments,
    ]));
  } catch(e) { ctx.render(h('div',{style:{color:'red',padding:16}},'错误: '+e.message)); }
})();
