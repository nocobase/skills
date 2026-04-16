/**
 * Pending Orders KPI
 *
 * @type JSBlockModel
 */

const LABEL = 'Pending Orders';
const COLOR = '#faad14';
const SQL = `SELECT count(*) AS value FROM nb_erp_purchase_orders WHERE status IN ('draft','confirmed')`;
const PREFIX = '';

const { useState, useEffect } = ctx.React;
const h = ctx.React.createElement;

const KpiCard = () => {
  const [value, setValue] = useState('...');

  useEffect(() => {
    (async () => {
      try {
        const rows = await ctx.sql(SQL);
        setValue(rows?.[0]?.value ?? '-');
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
