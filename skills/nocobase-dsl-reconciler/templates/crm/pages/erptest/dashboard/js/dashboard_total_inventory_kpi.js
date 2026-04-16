/**
 * Total Inventory KPI
 *
 * @type JSBlockModel
 */

const LABEL = 'Total Inventory';
const COLOR = '#52c41a';
const SQL = `SELECT COALESCE(sum(quantity), 0) AS value FROM nb_erp_inventory`;
const PREFIX = '';

const { useState, useEffect } = ctx.React;
const h = ctx.React.createElement;

const KpiCard = () => {
  const [value, setValue] = useState('...');

  useEffect(() => {
    (async () => {
      try {
        const rows = await ctx.sql(SQL);
        const v = rows?.[0]?.value ?? 0;
        const fmt = v >= 1e6 ? (v/1e6).toFixed(1) + 'M' : v >= 1e3 ? (v/1e3).toFixed(1) + 'K' : String(v);
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
