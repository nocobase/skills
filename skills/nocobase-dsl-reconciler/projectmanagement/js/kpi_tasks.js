/**
 * KPI Cards - Task Statistics
 */
const CONFIG = {
  label: "Total Tasks",
  color: "#52c41a",
  bgColor: "#f6ffed",
  strokeColor: "#d9f7be",
  format: "number",
  dataSourceKey: "main",
  reportUid: "pm_kpi_tasks",
  sql: `
    SELECT 
      COUNT(*) AS value,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) || ' completed' AS sub_text
    FROM nb_pm_tasks
  `
};

const { useState, useEffect } = ctx.React;
const cardStyle = (color, bgColor) => ({
  borderRadius: '0', padding: '24px', position: 'relative', overflow: 'hidden',
  border: 'none', boxShadow: 'none',
  margin: '-24px', height: 'calc(100% + 48px)', width: 'calc(100% + 48px)',
  display: 'flex', flexDirection: 'column', cursor: 'default', overflow: 'hidden'
});
const labelStyle = { fontSize: '0.875rem', fontWeight: '500', zIndex: 2 };
const valueStyle = (color) => ({ fontSize: '2rem', fontWeight: '700', marginTop: 'auto', zIndex: 2, letterSpacing: '-0.03em', color });
const trendPillStyle = (color, bgColor) => ({ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '99px', fontWeight: '600', background: bgColor, color });
const bgChartStyle = { position: 'absolute', bottom: 0, right: 0, width: '140px', height: '90px', zIndex: 1, opacity: 0.5, pointerEvents: 'none' };
const hoverCss = ':has(> .kpi-card-hover),:has(> div > .kpi-card-hover){overflow:hidden!important}.kpi-card-hover{transition:transform .2s ease;transform:scale(0.97)}.kpi-card-hover:hover{transform:scale(1)}';

const fmt = (v, type) => {
  const n = Number(v) || 0;
  if (type === 'percent') return `${n}%`;
  if (type === 'money') return n >= 1e6 ? `¥${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `¥${(n/1e3).toFixed(1)}K` : `¥${n.toFixed(0)}`;
  return String(n);
};

const KpiCard = () => {
  const [data, setData] = useState({ value: 0, sub: '', loading: true });
  useEffect(() => {
    const init = async () => {
      if (ctx.flowSettingsEnabled && CONFIG.sql) {
        try { await ctx.sql.save({ uid: CONFIG.reportUid, sql: CONFIG.sql.trim(), dataSourceKey: CONFIG.dataSourceKey }); } catch(e) {}
      }
      try {
        const result = await ctx.sql.runById(CONFIG.reportUid, { type: 'selectRows', dataSourceKey: CONFIG.dataSourceKey });
        const r = result?.[0] || {};
        setData({ value: r.value || 0, sub: r.sub_text || '', loading: false });
      } catch(e) { console.error(e); setData(prev => ({ ...prev, loading: false })); }
    };
    init();
  }, []);

  return ctx.React.createElement('div', { className: 'kpi-card-hover', style: cardStyle(CONFIG.color, CONFIG.bgColor) },
    ctx.React.createElement('div', { style: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', zIndex:2 } },
      ctx.React.createElement('span', { style: labelStyle }, CONFIG.label),
      ctx.React.createElement('span', { style: trendPillStyle(CONFIG.color, CONFIG.bgColor) }, data.sub)
    ),
    ctx.React.createElement('div', { style: valueStyle(CONFIG.color) }, data.loading ? '...' : fmt(data.value, CONFIG.format)),
    ctx.React.createElement('svg', { style: bgChartStyle, viewBox:'0 0 100 50', preserveAspectRatio:'none' },
      ctx.React.createElement('path', { d:'M0,50 L0,35 Q25,20 50,30 T100,20 L100,50 Z', fill: CONFIG.bgColor, stroke: CONFIG.strokeColor, strokeWidth:'2' }))
  );
};
ctx.render(ctx.React.createElement(ctx.React.Fragment, null, ctx.React.createElement('style', null, hoverCss), ctx.React.createElement(KpiCard, null)));
