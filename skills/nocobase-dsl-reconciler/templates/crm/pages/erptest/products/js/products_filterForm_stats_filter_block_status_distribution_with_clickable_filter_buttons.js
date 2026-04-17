/**
 * Stats Filter Block — status distribution with clickable filter buttons
 *
 * @type JSItemModel
 * @template stats-filter
 * @collection nb_erp_products
 *
 * === Parameters ===
 * COLLECTION : data table name (e.g. nb_erp_products)
 * GROUP_FIELD: field to group by (default: status)
 * LABEL      : display label prefix (default: collection short name)
 */

// ─── CONFIG: modify here ─────────────────────────────────────
const COLLECTION = 'nb_erp_products';
const GROUP_FIELD = 'status';
// ─── END CONFIG ──────────────────────────────────────────────

const { useState, useEffect } = ctx.React;
const h = ctx.React.createElement;

const StatsFilter = () => {
  const [active, setActive] = useState('all');
  const [stats, setStats] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const total = await ctx.sql(`SELECT count(*) AS cnt FROM ${COLLECTION}`);
        const byGroup = await ctx.sql(
          `SELECT COALESCE(${GROUP_FIELD}, 'N/A') AS label, count(*) AS cnt ` +
          `FROM ${COLLECTION} GROUP BY ${GROUP_FIELD} ORDER BY cnt DESC`
        );
        const items = [{ key: 'all', label: 'All', count: total?.[0]?.cnt || 0 }];
        for (const row of (byGroup || [])) {
          items.push({ key: String(row.label), label: String(row.label), count: row.cnt });
        }
        setStats(items);
      } catch {
        setStats([{ key: 'all', label: 'All', count: '-' }]);
      }
    })();
  }, []);

  const btnStyle = (isActive) => ({
    padding: '6px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    border: 'none',
    fontWeight: isActive ? '600' : '400',
    fontSize: '13px',
    background: isActive ? '#1677ff' : '#f5f5f5',
    color: isActive ? '#fff' : '#333',
  });

  return h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
    ...stats.map(b => h('button', {
      key: b.key,
      style: btnStyle(active === b.key),
      onClick: () => setActive(b.key),
    }, b.label + ' (' + b.count + ')'))
  );
};

ctx.render(h(StatsFilter, null));
