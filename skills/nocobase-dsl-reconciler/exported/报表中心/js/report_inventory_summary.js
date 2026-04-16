// data: ctx.request via ctx.api
// 库存汇总报表 — 按分类+状态交叉统计
(async () => {
  const h = ctx.React.createElement;
  try {
    const r = await ctx.api.request({
      url: 'nb_tm_tools:list', params: { pageSize: 500, appends: ['category_rel'] }
    });
    const data = r?.data?.data || [];

    // Build cross-tab: category × status
    const categories = {};
    const statuses = new Set();
    data.forEach(d => {
      const cat = d.category_rel?.name || '未分类';
      const st = d.status || '未知';
      statuses.add(st);
      if (!categories[cat]) categories[cat] = {};
      categories[cat][st] = (categories[cat][st] || 0) + 1;
    });

    const statusList = [...statuses].sort();
    const catList = Object.keys(categories).sort();

    const statusColors = {
      '在库': '#10b981', '使用中': '#3b82f6', '维修中': '#f59e0b',
      '保养中': '#8b5cf6', '已报废': '#ef4444', '待入库': '#06b6d4',
    };

    // Table header
    const headerCells = [
      h('th', {key:'cat', style:{padding:'8px 12px', textAlign:'left', borderBottom:'2px solid #e5e7eb', background:'#f9fafb', fontSize:13, fontWeight:600}}, '分类'),
      ...statusList.map(st =>
        h('th', {key:st, style:{padding:'8px 12px', textAlign:'center', borderBottom:'2px solid #e5e7eb', background:'#f9fafb', fontSize:13, fontWeight:600, color: statusColors[st] || '#666'}}, st)
      ),
      h('th', {key:'total', style:{padding:'8px 12px', textAlign:'center', borderBottom:'2px solid #e5e7eb', background:'#f9fafb', fontSize:13, fontWeight:700}}, '合计'),
    ];

    const rows = catList.map((cat, i) => {
      const total = statusList.reduce((s, st) => s + (categories[cat][st] || 0), 0);
      return h('tr', {key:cat, style:{background: i % 2 === 0 ? '#fff' : '#f9fafb'}}, [
        h('td', {key:'cat', style:{padding:'6px 12px', fontSize:13, fontWeight:500}}, cat),
        ...statusList.map(st => {
          const cnt = categories[cat][st] || 0;
          return h('td', {key:st, style:{padding:'6px 12px', textAlign:'center', fontSize:13, color: cnt > 0 ? (statusColors[st] || '#333') : '#ccc'}}, cnt || '-');
        }),
        h('td', {key:'total', style:{padding:'6px 12px', textAlign:'center', fontSize:13, fontWeight:600}}, total),
      ]);
    });

    // Footer totals
    const footer = h('tr', {style:{background:'#f0f0f0', fontWeight:600}}, [
      h('td', {key:'cat', style:{padding:'6px 12px', fontSize:13}}, '合计'),
      ...statusList.map(st => {
        const total = catList.reduce((s, cat) => s + (categories[cat][st] || 0), 0);
        return h('td', {key:st, style:{padding:'6px 12px', textAlign:'center', fontSize:13, color: statusColors[st] || '#333'}}, total);
      }),
      h('td', {key:'total', style:{padding:'6px 12px', textAlign:'center', fontSize:14, fontWeight:700}}, data.length),
    ]);

    ctx.render(h('div', {style:{padding:'12px 16px'}}, [
      h('div', {key:'h', style:{fontSize:14, fontWeight:500, marginBottom:16, color:'#333'}}, '库存汇总报表（分类 × 状态）'),
      h('table', {key:'t', style:{width:'100%', borderCollapse:'collapse', border:'1px solid #e5e7eb', borderRadius:8}}, [
        h('thead', {key:'head'}, h('tr', null, headerCells)),
        h('tbody', {key:'body'}, [...rows, footer]),
      ]),
    ]));
  } catch(e) {
    ctx.render(h('div', {style:{color:'red',padding:16}}, '加载失败: '+e.message));
  }
})();
