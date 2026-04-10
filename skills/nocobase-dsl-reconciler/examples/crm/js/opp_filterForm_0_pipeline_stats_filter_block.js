/**
 * Pipeline Stats Filter Block
 *
 * Button+Badge clickable filters for the target opportunity list block.
 * Table: nb_crm_opportunities
 */

const TARGET_BLOCK_UID = 'm157t7ngzap';

const { useState, useEffect } = ctx.React;
const { Button, Badge, Space, Spin } = ctx.antd;

const t = (key, opts) => ctx.t(key, { ns: 'nb_crm.pipeline', ...opts });

// ==================== Stat Buttons Config ====================
const STATS = [
  { key: 'all', label: t('All Opportunities'), filter: null },
  { key: 'pipeline', label: t('In Pipeline'),
    filter: { stage: { $notIn: ['won', 'lost'] } } },
  { key: 'closing', label: t('Closing Soon'), filter: null },
  { key: 'won', label: t('Won'), filter: { stage: 'won' } },
  { key: 'lost', label: t('Lost'), filter: { stage: 'lost' } },
];

// ==================== Data Hook ====================
function useStats() {
  const [counts, setCounts] = useState({});
  const [closingIds, setClosingIds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        // Fetch counts for simple filters via collection API
        const simple = STATS.filter(s => s.key !== 'closing');
        const results = await Promise.all(
          simple.map(s => ctx.api.request({
            url: 'nb_crm_opportunities:list',
            params: { pageSize: 1, ...(s.filter && { filter: JSON.stringify(s.filter) }) },
          }))
        );
        const c = {};
        simple.forEach((s, i) => { c[s.key] = results[i]?.data?.meta?.count || 0; });

        // "Closing Soon" — query via SQL to get IDs (safe, no filter broadcast)
        const monthEnd = ctx.libs.dayjs().endOf('month').format('YYYY-MM-DD');
        const closingResult = await ctx.api.request({
          url: 'nb_crm_opportunities:list',
          params: {
            pageSize: 200,
            fields: 'id',
            filter: JSON.stringify({
              $and: [
                { stage: { $notIn: ['won', 'lost'] } },
                { expected_close_date: { $dateBefore: monthEnd } },
              ]
            }),
          },
        });
        const ids = (closingResult?.data?.data || []).map(r => r.id);
        c.closing = closingResult?.data?.meta?.count || ids.length;
        setClosingIds(ids);
        setCounts(c);
      } catch (e) { console.error('Stats fetch failed:', e); }
      setLoading(false);
    };
    fetch();
  }, []);

  return { counts, closingIds, loading };
}

// ==================== Main Component ====================
const StatsFilter = () => {
  const { counts, closingIds, loading } = useStats();
  const [active, setActive] = useState('all');

  const handleClick = async (stat) => {
    setActive(stat.key);
    try {
      const target = ctx.engine?.getModel(TARGET_BLOCK_UID);
      if (!target) { ctx.message?.warning('Target block not found'); return; }

      let filter;
      if (stat.key === 'closing') {
        // Use id.$in — safe for all block types (id is always in SELECT)
        filter = closingIds.length > 0
          ? { id: { $in: closingIds } }
          : { id: { $eq: -1 } };
      } else {
        filter = stat.filter;
      }

      target.resource.addFilterGroup(ctx.model.uid, filter || { $and: [] });
      await target.resource.refresh();
    } catch (e) { console.error('Filter failed:', e); }
  };

  if (loading) return <Spin size="small" />;

  return (
    <Space wrap size={[8, 8]}>
      {STATS.map(s => (
        <Button key={s.key} type={active === s.key ? 'primary' : 'default'} onClick={() => handleClick(s)}>
          {s.label}{' '}
          <Badge count={counts[s.key] ?? 0} showZero overflowCount={9999}
            style={{ marginLeft: 4,
              backgroundColor: active === s.key ? '#fff' : '#f0f0f0',
              color: active === s.key ? '#1677ff' : 'rgba(0,0,0,0.65)',
              boxShadow: 'none' }} />
        </Button>
      ))}
    </Space>
  );
};

ctx.render(<StatsFilter />);