/**
 * Departments stats filter block
 * Copied from CRM stats filter block and simplified for HRM list pages.
 */

const TARGET_BLOCK_UID = '';
const { useState, useEffect } = ctx.React;
const { Button, Badge, Space, Spin } = ctx.antd;

const CONFIG = {
  resource: 'nb_hrm_departments:list',
  stats: [
    { key: 'all', label: 'All', filter: null },
    { key: 'active', label: 'Active', filter: { status: { $eq: 'active' } } },
    { key: 'transition', label: 'Transition', filter: { status: { $eq: 'transition' } } },
    { key: 'inactive', label: 'Inactive', filter: { status: { $eq: 'inactive' } } },
  ],
};

function useStats() {
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const results = await Promise.all(CONFIG.stats.map((s) => ctx.api.request({
          url: CONFIG.resource,
          params: { pageSize: 1, ...(s.filter && { filter: JSON.stringify(s.filter) }) },
        })));
        const next = {};
        CONFIG.stats.forEach((s, i) => { next[s.key] = results[i]?.data?.meta?.count || 0; });
        setCounts(next);
      } catch (e) {
        console.error('Departments stats fetch failed:', e);
      }
      setLoading(false);
    };
    fetchCounts();
  }, []);

  return { counts, loading };
}

const StatsFilter = () => {
  const { counts, loading } = useStats();
  const [active, setActive] = useState('all');

  const applyFilter = async (stat) => {
    const target = TARGET_BLOCK_UID ? ctx.engine?.getModel(TARGET_BLOCK_UID) : null;
    if (!target) return;
    target.resource.addFilterGroup(ctx.model.uid, stat.filter || { $and: [] });
    await target.resource.refresh();
  };

  const handleClick = async (stat) => {
    setActive(stat.key);
    await applyFilter(stat);
  };

  if (loading) return <Spin />;

  return (
    <Space wrap size={[8, 8]}>
      {CONFIG.stats.map((s) => (
        <Button key={s.key} type={active === s.key ? 'primary' : 'default'} onClick={() => handleClick(s)}>
          {s.label}{' '}
          <Badge
            count={counts[s.key] || 0}
            showZero
            overflowCount={9999}
            style={{
              backgroundColor: active === s.key ? '#fff' : '#f0f0f0',
              color: active === s.key ? '#1677ff' : 'rgba(0,0,0,0.65)',
              boxShadow: 'none',
            }}
          />
        </Button>
      ))}
    </Space>
  );
};

ctx.render(<StatsFilter />);
