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
const SQL_UID = 'kpi_conversion_rate_v2';

const KpiCard = () => {
  const [data, setData] = useState({ rate: 0, rateChange: 0, loading: true });
  useEffect(() => { fetchData(); }, []);
  const fetchData = async () => {
    try {
      setData(prev => ({ ...prev, loading: true }));
      const { date_range } = ctx.form?.getFieldsValue?.() || {};
      const startDate = date_range?.[0] || ctx.libs.dayjs().startOf('month');
      const endDate = date_range?.[1] || ctx.libs.dayjs().endOf('month');
      const periodLength = endDate.diff(startDate, 'day');
      const previousStart = startDate.subtract(periodLength, 'day');
      const result = await ctx.sql.runById(SQL_UID, {
        bind: { __var1: startDate.format('YYYY-MM-DD 00:00:00'), __var2: endDate.format('YYYY-MM-DD 23:59:59'),
          __var3: startDate.format('YYYY-MM-DD 00:00:00'), __var4: endDate.format('YYYY-MM-DD 23:59:59'),
          __var5: previousStart.format('YYYY-MM-DD 00:00:00'), __var6: startDate.format('YYYY-MM-DD 00:00:00'),
          __var7: previousStart.format('YYYY-MM-DD 00:00:00'), __var8: startDate.format('YYYY-MM-DD 00:00:00') }, type: 'selectRows', dataSourceKey: 'main'
      });
      const record = result?.[0] || {};
      setData({ rate: parseFloat(record.current_rate || 0), rateChange: parseFloat(record.rate_change || 0), loading: false });
    } catch (e) { console.error(e); setData(prev => ({ ...prev, loading: false })); }
  };

  const handleClick = async () => {
    const popupUid = ctx.model.uid + '-conversion-detail';
    await ctx.openView(popupUid, {
      mode: 'dialog',
      title: t('Conversion Rate'),
      size: 'small',
    });
  };

  return ctx.React.createElement('div', { className: 'kpi-card-hover', style: cardStyle('#8b5cf6', '#f5f3ff'), onClick: handleClick },
    ctx.React.createElement('div', { style: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', zIndex:2 } },
      ctx.React.createElement('span', { style: labelStyle }, t('Conversion Rate')),
      ctx.React.createElement('span', { style: trendPillStyle('#8b5cf6', '#f5f3ff') }, data.rateChange >= 0 ? `+${Math.abs(data.rateChange).toFixed(1)}%` : `-${Math.abs(data.rateChange).toFixed(1)}%`)
    ),
    ctx.React.createElement('div', { style: valueStyle('#8b5cf6') }, data.loading ? '...' : `${data.rate.toFixed(1)}%`),
    ctx.React.createElement('svg', { style: bgChartStyle, viewBox:'0 0 100 50', preserveAspectRatio:'none' },
      ctx.React.createElement('path', { d:'M0,50 L0,25 Q30,40 60,20 T100,25 L100,50 Z', fill:'#f5f3ff', stroke:'#ddd6fe', strokeWidth:'2' }))
  );
};
ctx.render(ctx.React.createElement(ctx.React.Fragment, null, ctx.React.createElement('style', null, ':has(> .kpi-card-hover),:has(> div > .kpi-card-hover){overflow:hidden!important}.kpi-card-hover{transition:transform .2s ease;transform:scale(0.97)}.kpi-card-hover:hover{transform:scale(1)}'), ctx.React.createElement(KpiCard, null)));
