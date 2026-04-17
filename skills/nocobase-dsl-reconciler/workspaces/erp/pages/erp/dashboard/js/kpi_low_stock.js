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

const { useState, useEffect } = ctx.React;
const SQL_UID = 'erp_dashboard_low_stock_kpi_v3';
const SQL = `
WITH current_period AS (
  SELECT COUNT(*) AS current_count
  FROM nb_erp_products
  WHERE inventory_status IN ('low_stock', 'out_of_stock')
),
previous_period AS (
  SELECT COUNT(*) AS previous_count
  FROM nb_erp_products
  WHERE inventory_status IN ('low_stock', 'out_of_stock')
    AND COALESCE(last_restock_date::timestamp, "createdAt") < {{startDate2}}
)
SELECT cp.current_count, (cp.current_count - pp.previous_count) AS growth_count
FROM current_period cp, previous_period pp
`;

const KpiCard = () => {
  const [data, setData] = useState({ count: 0, growthCount: 0, loading: true });
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
      setData({ count: parseInt(record.current_count || 0, 10), growthCount: parseInt(record.growth_count || 0, 10), loading: false });
    } catch (e) {
      console.error(e);
      setData((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleClick = () => {
    ctx.router.navigate('/admin/erp/low_stock_alerts');
  };

  return ctx.React.createElement('div', { className: 'kpi-card-hover', style: cardStyle('#dc2626', '#fef2f2'), onClick: handleClick },
    ctx.React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 2 } },
      ctx.React.createElement('span', { style: labelStyle }, t('Low Stock SKUs')),
      ctx.React.createElement('span', { style: trendPillStyle('#dc2626', '#fee2e2') }, data.growthCount >= 0 ? `+${data.growthCount}` : `${data.growthCount}`)
    ),
    ctx.React.createElement('div', { style: valueStyle('#dc2626') }, data.loading ? '...' : data.count.toLocaleString()),
    ctx.React.createElement('svg', { style: bgChartStyle, viewBox: '0 0 100 50', preserveAspectRatio: 'none' },
      ctx.React.createElement('path', { d: 'M0,50 L0,40 L20,35 L40,20 L60,30 L80,10 L100,5 L100,50 Z', fill: '#fee2e2', stroke: '#fca5a5', strokeWidth: '2' }))
  );
};
ctx.render(ctx.React.createElement(ctx.React.Fragment, null, ctx.React.createElement('style', null, ':has(> .kpi-card-hover),:has(> div > .kpi-card-hover){overflow:hidden!important}.kpi-card-hover{transition:transform .2s ease;transform:scale(0.97)}.kpi-card-hover:hover{transform:scale(1)}'), ctx.React.createElement(KpiCard, null)));
