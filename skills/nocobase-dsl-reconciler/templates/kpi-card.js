/**
 * KPI Card Block Template (CRM-style + SQL data)
 *
 * @type JSBlockModel
 * @template kpi-card
 *
 * === AI Modification Guide ===
 * Only modify the 5 parameters + SQL in the CONFIG section
 * Do not touch anything else!
 * ====================
 */

// ─── CONFIG: AI modifies here ────────────────────────────────
const LABEL = '本月销售额';
const COLOR = '#3b82f6';
const BG = '#eff6ff';
const SQL_UID = 'erp_kpi_sales';
const FMT = (v) => v >= 1e6 ? `¥${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `¥${(v/1e3).toFixed(1)}K` : `¥${v.toFixed(0)}`;

// SQL must return: current_value, growth_rate
// Date variables are auto-replaced by JS: ${startDate}, ${endDate}, ${prevStart}, ${prevEnd}
const buildSql = (startDate, endDate, prevStart, prevEnd) => `
SELECT
  COALESCE(SUM(CASE WHEN order_date >= '${startDate}' AND order_date <= '${endDate}'
    THEN total_amount ELSE 0 END), 0) as current_value,
  CASE WHEN COALESCE(SUM(CASE WHEN order_date >= '${prevStart}' AND order_date < '${prevEnd}'
    THEN total_amount ELSE 0 END), 0) > 0
  THEN ROUND(
    (COALESCE(SUM(CASE WHEN order_date >= '${startDate}' AND order_date <= '${endDate}' THEN total_amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN order_date >= '${prevStart}' AND order_date < '${prevEnd}' THEN total_amount ELSE 0 END), 0))::numeric
    / COALESCE(SUM(CASE WHEN order_date >= '${prevStart}' AND order_date < '${prevEnd}' THEN total_amount ELSE 0 END), 1) * 100, 1)
  ELSE 0 END as growth_rate
FROM nb_erp_sales_orders
WHERE status NOT IN ('已取消', '草稿')
`;
// ─── CONFIG END ────────────────────────────────────

// ─── Do not modify below ─────────────────────────────────────
const { useState, useEffect } = ctx.React;
const h = ctx.React.createElement;

const cardStyle = () => ({
  borderRadius: '0', padding: '24px', position: 'relative', overflow: 'hidden',
  border: 'none', boxShadow: 'none',
  margin: '-24px', height: 'calc(100% + 48px)', width: 'calc(100% + 48px)',
  display: 'flex', flexDirection: 'column', cursor: 'pointer',
});
const labelStyle = { fontSize: '0.875rem', fontWeight: '500', zIndex: 2 };
const valueStyle = { fontSize: '2rem', fontWeight: '700', marginTop: 'auto', zIndex: 2, letterSpacing: '-0.03em', color: COLOR };
const trendPillStyle = (up) => ({
  fontSize: '0.75rem', padding: '2px 8px', borderRadius: '99px', fontWeight: '600',
  background: up ? '#ecfdf5' : '#fef2f2', color: up ? '#10b981' : '#ef4444',
});
const bgChartStyle = { position: 'absolute', bottom: 0, right: 0, width: '140px', height: '90px', zIndex: 1, opacity: 0.5, pointerEvents: 'none' };

const KpiCard = () => {
  const [data, setData] = useState({ value: 0, growthRate: 0, loading: true });

  useEffect(() => {
    (async () => {
      try {
        const now = ctx.libs.dayjs();
        const startDate = now.startOf('month').format('YYYY-MM-DD 00:00:00');
        const endDate = now.endOf('month').format('YYYY-MM-DD 23:59:59');
        const prevStart = now.subtract(1, 'month').startOf('month').format('YYYY-MM-DD 00:00:00');
        const prevEnd = now.startOf('month').format('YYYY-MM-DD 00:00:00');

        const sql = buildSql(startDate, endDate, prevStart, prevEnd);

        // Save SQL template
        try {
          await ctx.sql.save({ uid: SQL_UID, sql: sql.trim(), dataSourceKey: 'main' });
        } catch (e) { /* ignore if already saved */ }

        // Run by ID
        const result = await ctx.sql.runById(SQL_UID, {
          type: 'selectRows', dataSourceKey: 'main',
        });

        const record = result?.[0] || {};
        setData({
          value: parseFloat(record.current_value || 0),
          growthRate: parseFloat(record.growth_rate || 0),
          loading: false,
        });
      } catch (e) {
        console.error('KPI error:', e);
        setData(prev => ({ ...prev, loading: false }));
      }
    })();
  }, []);

  const up = data.growthRate >= 0;
  return h('div', { className: 'kpi-card-hover', style: cardStyle() },
    h('div', { style: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', zIndex:2 } },
      h('span', { style: labelStyle }, LABEL),
      data.growthRate !== 0 && h('span', { style: trendPillStyle(up) }, up ? `+${data.growthRate.toFixed(1)}%` : `${data.growthRate.toFixed(1)}%`)
    ),
    h('div', { style: valueStyle }, data.loading ? '...' : FMT(data.value)),
    h('svg', { style: bgChartStyle, viewBox:'0 0 100 50', preserveAspectRatio:'none' },
      h('path', { d:'M0,50 L0,30 Q25,10 50,25 T100,15 L100,50 Z', fill: BG, stroke: COLOR, strokeWidth:'1', opacity: 0.3 }))
  );
};

ctx.render(h(ctx.React.Fragment, null,
  h('style', null, ':has(> .kpi-card-hover),:has(> div > .kpi-card-hover){overflow:hidden!important}.kpi-card-hover{transition:transform .2s ease;transform:scale(0.97)}.kpi-card-hover:hover{transform:scale(1)}'),
  h(KpiCard, null)
));
