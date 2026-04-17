const t = (key, opts) => ctx.t(key, { ns: 'nb_crm', ...opts });
const cardStyle = (color, bgColor) => ({
  borderRadius: '0', padding: '24px', position: 'relative', overflow: 'hidden',
  border: 'none', boxShadow: 'none',
  margin: '-24px', height: 'calc(100% + 48px)', width: 'calc(100% + 48px)',
  display: 'flex', flexDirection: 'column', cursor: 'pointer', overflow: 'hidden'
});
const labelStyle = { fontSize: '0.875rem', fontWeight: '500', zIndex: 2 };
const valueStyle = (color) => ({ fontSize: '2rem', fontWeight: '700', marginTop: 'auto', zIndex: 2, letterSpacing: '-0.03em', color });
const trendPillStyle = (color, bgColor) => ({ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '99px', fontWeight: '600', background: bgColor, color });
const bgChartStyle = { position: 'absolute', bottom: 0, right: 0, width: '140px', height: '90px', zIndex: 1, opacity: 0.5, pointerEvents: 'none' };


const { useState, useEffect } = ctx.React;
const SQL_UID = 'kpi_deal_cycle_v2';
const SQL = `
SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (o."updatedAt" - o."createdAt")) / 86400)::integer, 0) as current_days
FROM nb_crm_opportunities o
WHERE o.stage = 'won'
  AND o."updatedAt" >= {{startDate1}} AND o."updatedAt" <= {{endDate1}}
  AND o."createdAt" IS NOT NULL
`;

const KpiCard = () => {
  const [data, setData] = useState({ days: 0, loading: true });
  useEffect(() => { fetchData(); }, []);
  const fetchData = async () => {
    try {
      setData(prev => ({ ...prev, loading: true }));
      if (ctx.flowSettingsEnabled) {
        try { await ctx.sql.save({ uid: SQL_UID, sql: SQL.trim(), dataSourceKey: 'main' }); } catch(e) {}
      }
      const { date_range } = ctx.form?.getFieldsValue?.() || {};
      const startDate = date_range?.[0] || ctx.libs.dayjs().startOf('month');
      const endDate = date_range?.[1] || ctx.libs.dayjs().endOf('month');

      const result = await ctx.sql.runById(SQL_UID, {
        bind: { __var1: startDate.format('YYYY-MM-DD 00:00:00'), __var2: endDate.format('YYYY-MM-DD 23:59:59') }, type: 'selectRows', dataSourceKey: 'main'
      });
      const record = result?.[0] || {};
      setData({ days: parseInt(record.current_days || 0), loading: false });
    } catch (e) { console.error(e); setData(prev => ({ ...prev, loading: false })); }
  };

  const handleClick = async () => {
    const popupUid = ctx.model.uid + '-cycle-detail';
    await ctx.openView(popupUid, {
      mode: 'dialog',
      title: t('Avg Deal Cycle'),
      size: 'small',
    });
  };

  return ctx.React.createElement('div', { className: 'kpi-card-hover', style: cardStyle('#f59e0b', '#fffbeb'), onClick: handleClick },
    ctx.React.createElement('div', { style: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', zIndex:2 } },
      ctx.React.createElement('span', { style: labelStyle }, t('Avg Deal Cycle')),
      ctx.React.createElement('span', { style: trendPillStyle('#f59e0b', '#fffbeb') }, `${data.days}d`)
    ),
    ctx.React.createElement('div', { style: valueStyle('#f59e0b') }, data.loading ? '...' : `${data.days} Days`),
    ctx.React.createElement('svg', { style: bgChartStyle, viewBox:'0 0 100 50', preserveAspectRatio:'none' },
      ctx.React.createElement('path', { d:'M0,50 L0,20 Q40,20 50,30 T100,20 L100,50 Z', fill:'#fffbeb', stroke:'#fde68a', strokeWidth:'2' }))
  );
};
ctx.render(ctx.React.createElement(ctx.React.Fragment, null, ctx.React.createElement('style', null, ':has(> .kpi-card-hover),:has(> div > .kpi-card-hover){overflow:hidden!important}.kpi-card-hover{transition:transform .2s ease;transform:scale(0.97)}.kpi-card-hover:hover{transform:scale(1)}'), ctx.React.createElement(KpiCard, null)));
