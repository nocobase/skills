/**
 *
 * @type JSBlockModel
 * @collection nb_tm_tools
 */
// data: ctx.request via ctx.api
// 领用归还统计报表 — 按月统计领用/归还次数
(async () => {
  const h = ctx.React.createElement;
  try {
    const [br, rt] = await Promise.all([
      ctx.api.request({ url: 'nb_tm_borrow:list', params: { pageSize: 500 } }),
      ctx.api.request({ url: 'nb_tm_return:list', params: { pageSize: 500 } }),
    ]);
    const borrows = br?.data?.data || [];
    const returns = rt?.data?.data || [];

    // Group by month
    const months = {};
    borrows.forEach(d => {
      if (!d.apply_date) return;
      const m = d.apply_date.substring(0, 7);
      if (!months[m]) months[m] = { borrow: 0, return: 0 };
      months[m].borrow++;
    });
    returns.forEach(d => {
      if (!d.return_date) return;
      const m = d.return_date.substring(0, 7);
      if (!months[m]) months[m] = { borrow: 0, return: 0 };
      months[m].return++;
    });

    const sorted = Object.entries(months).sort((a,b) => a[0].localeCompare(b[0])).slice(-12);
    const maxVal = Math.max(...sorted.map(([,v]) => Math.max(v.borrow, v.return)), 1);
    const barH = 120;

    const bars = sorted.map(([month, v]) => {
      const bPct = Math.round(v.borrow / maxVal * 100);
      const rPct = Math.round(v.return / maxVal * 100);
      return h('div', {key:month, style:{flex:1, display:'flex', flexDirection:'column', alignItems:'center', minWidth:50}}, [
        h('div', {key:'vals', style:{display:'flex', gap:2, fontSize:10, marginBottom:4}}, [
          h('span', {key:'b', style:{color:'#3b82f6', fontWeight:500}}, v.borrow),
          h('span', {key:'s', style:{color:'#ccc'}}, '/'),
          h('span', {key:'r', style:{color:'#10b981', fontWeight:500}}, v.return),
        ]),
        h('div', {key:'bars', style:{display:'flex', gap:2, height:barH, alignItems:'flex-end'}}, [
          h('div', {key:'b', style:{width:12, height:bPct+'%', background:'#3b82f6', borderRadius:'3px 3px 0 0', transition:'height 0.6s'}}),
          h('div', {key:'r', style:{width:12, height:rPct+'%', background:'#10b981', borderRadius:'3px 3px 0 0', transition:'height 0.6s'}}),
        ]),
        h('div', {key:'m', style:{fontSize:10, color:'#999', marginTop:4}}, month.substring(5)),
      ]);
    });

    // Summary
    const totalB = borrows.length;
    const totalR = returns.length;
    const pendingReturn = totalB - totalR;

    ctx.render(h('div', {style:{padding:'12px 16px'}}, [
      h('div', {key:'h', style:{fontSize:14, fontWeight:500, marginBottom:4, color:'#333'}}, '领用/归还统计'),
      h('div', {key:'s', style:{fontSize:12, color:'#999', marginBottom:16}},
        `领用 ${totalB} 次 · 归还 ${totalR} 次 · 待归还 ${Math.max(pendingReturn, 0)} 次`),
      h('div', {key:'legend', style:{display:'flex', gap:16, marginBottom:12}}, [
        h('span', {key:'b', style:{fontSize:12}}, [h('span', {key:'d', style:{display:'inline-block', width:10, height:10, background:'#3b82f6', borderRadius:2, marginRight:4}}), '领用']),
        h('span', {key:'r', style:{fontSize:12}}, [h('span', {key:'d', style:{display:'inline-block', width:10, height:10, background:'#10b981', borderRadius:2, marginRight:4}}), '归还']),
      ]),
      h('div', {key:'chart', style:{display:'flex', gap:4, alignItems:'flex-end', minHeight:barH+40}},
        sorted.length > 0 ? bars : [h('div', {key:'e', style:{color:'#ccc', flex:1, textAlign:'center'}}, '暂无数据')]
      ),
    ]));
  } catch(e) {
    ctx.render(h('div', {style:{color:'red',padding:16}}, '加载失败: '+e.message));
  }
})();
