/**
 * PO Total Amount KPI
 *
 * @type JSBlockModel
 */

const LABEL = 'PO Total Amount';
const COLOR = '#722ed1';
const SQL = `SELECT COALESCE(sum(total_amount), 0) AS value FROM nb_erp_purchase_orders WHERE status != 'cancelled'`;
const PREFIX = '¥';

const { useState, useEffect } = ctx.React;
const h = ctx.React.createElement;

const KpiCard = () => {
  const [value, setValue] = useState('...');

  useEffect(() => {
    (async () => {
      try {
        const rows = await ctx.sql(SQL);
        const v = Number(rows?.[0]?.value ?? 0);
        const fmt = v >= 1e6 ? (v/1e6).toFixed(1) + 'M' : v >= 1e3 ? (v/1e3).toFixed(1) + 'K' : v.toFixed(0);
        setValue(fmt);
      } catch {
        setValue('ERR');
      }
    })();
  }, []);

  return h('div', {
    style: {
      padding: '20px 24px',
      borderRadius: '12px',
      background: `linear-gradient(135deg, ${COLOR}15, ${COLOR}08)`,
      borderLeft: `4px solid ${COLOR}`,
    }
  },
    h('div', { style: { fontSize: '13px', color: '#666', marginBottom: '8px' } }, LABEL),
    h('div', { style: { fontSize: '28px', fontWeight: '700', color: COLOR } }, PREFIX + String(value)),
  );
};

ctx.render(h(KpiCard, null));
