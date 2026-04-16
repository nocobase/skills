const LABEL = 'Team Members';
const COLOR = '#8b5cf6';
const SQL_UID = 'pm_kpi_team_members';
const SQL = `SELECT count(*) AS current_value FROM nb_pm_members WHERE status = 'active'`;

const { useState, useEffect } = ctx.React;
const h = ctx.React.createElement;

const KpiCard = () => {
  const [value, setValue] = useState('...');
  useEffect(() => {
    (async () => {
      try {
        await ctx.sql.save({ uid: SQL_UID, sql: SQL, dataSourceKey: 'main' });
        const rows = await ctx.sql.runById(SQL_UID, { type: 'selectRows', dataSourceKey: 'main' });
        setValue(rows?.[0]?.current_value ?? '-');
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
      height: '100%',
    }
  },
    h('div', { style: { fontSize: '13px', color: '#666', marginBottom: '8px' } }, LABEL),
    h('div', { style: { fontSize: '28px', fontWeight: '700', color: COLOR } }, String(value)),
  );
};

ctx.render(h(KpiCard, null));
