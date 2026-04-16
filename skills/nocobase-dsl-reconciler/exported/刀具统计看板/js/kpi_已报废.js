// KPI: 已报废
const CONFIG = {
  label: '已报废', color: '#ef4444', bgColor: '#fef2f2', strokeColor: '#fecaca',
  format: 'number', dataSourceKey: 'main', reportUid: 'tm_kpi_scrap',
  sql: `SELECT COUNT(*) AS value, SUM(CASE WHEN "createdAt" >= NOW() - '30 days'::interval THEN 1 ELSE 0 END) || ' 本月' AS sub_text FROM nb_tm_scrap WHERE status = '已通过'`,
};
const { useState, useEffect } = ctx.React;
const h = ctx.React.createElement;
const KpiCard = () => {
  const [data, setData] = useState({ value: 0, sub: '', loading: true });
  useEffect(() => { (async () => {
    if (ctx.flowSettingsEnabled && CONFIG.sql) { try { await ctx.sql.save({ uid: CONFIG.reportUid, sql: CONFIG.sql.trim(), dataSourceKey: CONFIG.dataSourceKey }); } catch(e) {} }
    try {
      const r = (await ctx.sql.runById(CONFIG.reportUid, { type: 'selectRows', dataSourceKey: CONFIG.dataSourceKey }))?.[0] || {};
      setData({ value: r.value || 0, sub: r.sub_text || '', loading: false });
    } catch(e) { setData(p => ({ ...p, loading: false })); }
  })(); }, []);
  return h('div', { style: { borderRadius:0, padding:24, position:'relative', overflow:'hidden', border:'none', boxShadow:'none', margin:'-24px', height:'calc(100% + 48px)', width:'calc(100% + 48px)', display:'flex', flexDirection:'column', background: CONFIG.bgColor } },
    h('div', { style: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', zIndex:2 } },
      h('span', { style: { fontSize:'0.875rem', fontWeight:500 } }, CONFIG.label),
      h('span', { style: { fontSize:'0.75rem', padding:'2px 8px', borderRadius:99, fontWeight:600, background:CONFIG.bgColor, color:CONFIG.color } }, data.sub)),
    h('div', { style: { fontSize:'2rem', fontWeight:700, marginTop:'auto', zIndex:2, color:CONFIG.color } }, data.loading ? '...' : String(Number(data.value)||0)),
    h('svg', { style: { position:'absolute', bottom:0, right:0, width:140, height:90, zIndex:1, opacity:0.5, pointerEvents:'none' }, viewBox:'0 0 100 50', preserveAspectRatio:'none' },
      h('path', { d:'M0,50 L0,30 Q25,10 50,25 T100,15 L100,50 Z', fill:CONFIG.bgColor, stroke:CONFIG.strokeColor, strokeWidth:2 })));
};
ctx.render(h(KpiCard, null));
