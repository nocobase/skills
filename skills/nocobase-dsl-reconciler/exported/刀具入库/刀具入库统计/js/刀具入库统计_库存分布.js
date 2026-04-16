
(async () => {
  const h = ctx.React.createElement;
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_tools:list', params: { pageSize: 500, appends: ['location'], filter: { status: { '$ne': '已报废' } } }
    });
    const data = r?.data?.data || [];
    const locs = {};
    data.forEach(d => {
      const loc = d.location?.name || '未分配';
      locs[loc] = (locs[loc]||0) + 1;
    });
    const items = Object.entries(locs).sort((a,b) => b[1]-a[1]);
    const total = data.length;
    const colors = ['#1890ff','#52c41a','#faad14','#722ed1','#13c2c2','#eb2f96','#ff4d4f','#2f54eb'];

    const bars = items.map(([loc, cnt], i) => {
      const pct = total ? Math.round(cnt/total*100) : 0;
      return h('div', {key:loc, style:{display:'flex', alignItems:'center', marginBottom:8}}, [
        h('div', {key:'l', style:{width:100, fontSize:12, color:'#666', textAlign:'right', marginRight:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}, loc),
        h('div', {key:'b', style:{flex:1, height:22, background:'#f5f5f5', borderRadius:4, overflow:'hidden'}},
          h('div', {style:{width:pct+'%', height:'100%', background:colors[i%colors.length], borderRadius:4, minWidth:cnt>0?18:0, display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:4}},
            h('span', {style:{color:'#fff', fontSize:11}}, cnt)
          )
        ),
        h('div', {key:'p', style:{width:35, fontSize:11, color:'#999', marginLeft:6}}, pct+'%'),
      ]);
    });

    ctx.render(h('div', {style:{padding:'12px 16px'}}, [
      h('div', {key:'h', style:{fontSize:14, fontWeight:500, marginBottom:12}}, '库存分布（按库位）'),
      ...bars,
    ]));
  } catch(e) { ctx.render(h('div',{style:{color:'red',padding:16}},'错误: '+e.message)); }
})();
