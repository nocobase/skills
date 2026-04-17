const t = (key, opts) => ctx.t(key, { ns: 'nb_erp', ...opts });
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

const fmt = (v) => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`;
const { useState, useEffect } = ctx.React;
const SQL_UID = 'erp_sales_revenue_kpi_v3';
const SQL = `
WITH current_period AS (
  SELECT COALESCE(SUM(total_amount), 0) AS current_value
  FROM nb_erp_customer_orders
  WHERE status <> 'cancelled'
    AND order_date >= {{startDate1}} AND order_date <= {{endDate1}}
),
previous_period AS (
  SELECT COALESCE(SUM(total_amount), 0) AS previous_value
  FROM nb_erp_customer_orders
  WHERE status <> 'cancelled'
    AND order_date >= {{previousStart1}} AND order_date < {{startDate2}}
)
SELECT cp.current_value,
  CASE WHEN pp.previous_value > 0 THEN
    ROUND(((cp.current_value - pp.previous_value) / pp.previous_value * 100)::numeric, 1)
  ELSE CASE WHEN cp.current_value > 0 THEN 100.0 ELSE 0 END
  END AS growth_rate
FROM current_period cp, previous_period pp
`;

const KpiCard = () => {
  const [data, setData] = useState({ value: 0, growthRate: 0, loading: true });
  useEffect(() => { fetchData(); }, []);
  const fetchData = async () => {
    try {
      setData((prev) => ({ ...prev, loading: true }));
      if (ctx.flowSettingsEnabled) {
        try { await ctx.sql.save({ uid: SQL_UID, sql: SQL.trim(), dataSourceKey: 'main' }); } catch (e) {}
      }
      const { date_range } = ctx.form?.getFieldsValue?.() || {};
      const startDate = date_range?.[0] || ctx.libs.dayjs().startOf('month');
      const endDate = date_range?.[1] || ctx.libs.dayjs().endOf('month');
      const periodLength = endDate.diff(startDate, 'day');
      const previousStart = startDate.subtract(periodLength, 'day');
      const result = await ctx.sql.runById(SQL_UID, {
        bind: {
          __var1: startDate.format('YYYY-MM-DD 00:00:00'),
          __var2: endDate.format('YYYY-MM-DD 23:59:59'),
          __var3: previousStart.format('YYYY-MM-DD 00:00:00'),
          __var4: startDate.format('YYYY-MM-DD 00:00:00')
        },
        type: 'selectRows',
        dataSourceKey: 'main'
      });
      const record = result?.[0] || {};
      setData({ value: parseFloat(record.current_value || 0), growthRate: parseFloat(record.growth_rate || 0), loading: false });
    } catch (e) {
      console.error(e);
      setData((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleClick = () => {
    ctx.router.navigate('/admin/erp/sales_analytics');
  };

  return ctx.React.createElement('div', { className: 'kpi-card-hover', style: cardStyle('#115e59', '#f0fdfa'), onClick: handleClick },
    ctx.React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 2 } },
      ctx.React.createElement('span', { style: labelStyle }, t('Revenue')),
      ctx.React.createElement('span', { style: trendPillStyle('#115e59', '#ccfbf1') }, data.growthRate >= 0 ? `+${data.growthRate.toFixed(1)}%` : `${data.growthRate.toFixed(1)}%`)
    ),
    ctx.React.createElement('div', { style: valueStyle('#115e59') }, data.loading ? '...' : fmt(data.value)),
    ctx.React.createElement('svg', { style: bgChartStyle, viewBox: '0 0 100 50', preserveAspectRatio: 'none' },
      ctx.React.createElement('path', { d: 'M0,50 L0,30 Q25,10 50,25 T100,15 L100,50 Z', fill: '#ccfbf1', stroke: '#5eead4', strokeWidth: '2' }))
  );
};
ctx.render(ctx.React.createElement(ctx.React.Fragment, null, ctx.React.createElement('style', null, ':has(> .kpi-card-hover),:has(> div > .kpi-card-hover){overflow:hidden!important}.kpi-card-hover{transition:transform .2s ease;transform:scale(0.97)}.kpi-card-hover:hover{transform:scale(1)}'), ctx.React.createElement(KpiCard, null)));
