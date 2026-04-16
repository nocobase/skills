
(async () => {
  const h = ctx.React.createElement;
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_repair:list', params: { pageSize: 500, appends: ['tool'] }
    });
    const data = r?.data?.data || [];
    const tools = {};
    data.forEach(d => {
      const name = d.tool?.name || d.tool?.code || '未知';
      tools[name] = (tools[name]||0) + 1;
    });
    const items = Object.entries(tools).sort((a,b) => b[1]-a[1]).slice(0, 10);
    const maxVal = Math.max(...items.map(([,v]) => v), 1);

    const bars = items.map(([name, cnt], i) => {
      const pct = Math.round(cnt/maxVal*100);
      const color = cnt >= 3 ? '#ff4d4f' : cnt >= 2 ? '#faad14' : '#1890ff';
      return h('div', {key:name, style:{display:'flex', alignItems:'center', marginBottom:8}}, [
        h('div', {key:'n', style:{width:100, fontSize:12, color:'#333', textAlign:'right', marginRight:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}, name),
        h('div', {key:'b', style:{flex:1, height:22, background:'#f5f5f5', borderRadius:4, overflow:'hidden'}},
          h('div', {style:{width:pct+'%', height:'100%', background:color, borderRadius:4, minWidth:18, display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:4}},
            h('span', {style:{color:'#fff', fontSize:11}}, cnt)
          )
        ),
      ]);
    });

    ctx.render(h('div', {style:{padding:'12px 16px'}}, [
      h('div', {key:'h', style:{fontSize:14, fontWeight:500, marginBottom:4}}, '故障频次 Top 10'),
      h('div', {key:'s', style:{fontSize:12, color:'#999', marginBottom:12}}, '红=3次以上 黄=2次 蓝=1次'),
      bars.length > 0 ? bars : h('div',{style:{color:'#ccc',textAlign:'center'}},'暂无数据'),
    ]));
  } catch(e) { ctx.render(h('div',{style:{color:'red',padding:16}},'错误: '+e.message)); }
})();
