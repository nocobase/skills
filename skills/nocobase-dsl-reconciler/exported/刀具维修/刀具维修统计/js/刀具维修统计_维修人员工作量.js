
(async () => {
  const h = ctx.React.createElement;
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_repair:list', params: { pageSize: 500, filter: { repair_person: { '$ne': null } } }
    });
    const data = r?.data?.data || [];
    const workers = {};
    data.forEach(d => {
      if (!d.repair_person) return;
      if (!workers[d.repair_person]) workers[d.repair_person] = { count: 0, hours: 0 };
      workers[d.repair_person].count++;
      workers[d.repair_person].hours += (d.repair_hours || 0);
    });
    const items = Object.entries(workers).sort((a,b) => b[1].count - a[1].count);
    const maxCnt = Math.max(...items.map(([,v]) => v.count), 1);
    const colors = ['#1890ff','#52c41a','#faad14','#722ed1','#13c2c2'];

    const bars = items.map(([name, {count, hours}], i) =>
      h('div', {key:name, style:{display:'flex', alignItems:'center', marginBottom:10}}, [
        h('div', {key:'n', style:{width:60, fontSize:13, color:'#333', textAlign:'right', marginRight:8}}, name),
        h('div', {key:'b', style:{flex:1, height:24, background:'#f5f5f5', borderRadius:4, overflow:'hidden'}},
          h('div', {style:{width:Math.round(count/maxCnt*100)+'%', height:'100%', background:colors[i%colors.length], borderRadius:4, minWidth:20, display:'flex', alignItems:'center', paddingLeft:6}},
            h('span', {style:{color:'#fff', fontSize:11, fontWeight:500}}, count+'次')
          )
        ),
        h('div', {key:'h', style:{width:60, fontSize:12, color:'#999', marginLeft:6}}, hours.toFixed(1)+'h'),
      ])
    );

    ctx.render(h('div', {style:{padding:'12px 16px'}}, [
      h('div', {key:'h', style:{fontSize:14, fontWeight:500, marginBottom:12}}, '维修人员工作量'),
      bars.length > 0 ? bars : h('div',{style:{color:'#ccc',textAlign:'center'}},'暂无数据'),
    ]));
  } catch(e) { ctx.render(h('div',{style:{color:'red',padding:16}},'错误: '+e.message)); }
})();
