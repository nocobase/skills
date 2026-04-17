/**
 * Leads Stats Filter Block
 * Supports URL params: ?status=new&rating=hot etc.
 */

const TARGET_BLOCK_UID = 'b3f6e318381';

const { useState, useEffect } = ctx.React;
const { Button, Badge, Space, Spin, Divider, Typography } = ctx.antd;
const { Text } = ctx.antd.Typography;

const t = (key, opts) => ctx.t(key, { ns: 'nb_crm.leads', ...opts });

// ==================== Filter Config ====================
const STATS = [
  // --- Status filters ---
  { key: 'all', label: 'All', filter: null, group: 'status' },
  { key: 'new', label: 'New', filter: { status: { $eq: 'new' } }, group: 'status' },
  { key: 'working', label: 'Working', filter: { status: { $eq: 'working' } }, group: 'status' },
  { key: 'qualified', label: 'Qualified', filter: { status: { $eq: 'qualified' } }, group: 'status' },
  { key: 'unqualified', label: 'Unqualified', filter: { status: { $eq: 'unqualified' } }, group: 'status' },
  // --- Composite filters ---
  { key: 'hot', label: '🔥 Hot', filter: { $and: [{ rating: { $eq: 'hot' } }, { status: { $ne: 'unqualified' } }] }, group: 'smart' },
  { key: 'today', label: 'Today', filterFn: () => {
    const today = ctx.libs.dayjs().format('YYYY-MM-DD');
    return { createdAt: { $dateOn: today } };
  }, group: 'smart' },
  { key: 'this_week', label: 'This Week', filterFn: () => {
    const start = ctx.libs.dayjs().startOf('week').format('YYYY-MM-DD');
    const end = ctx.libs.dayjs().endOf('week').format('YYYY-MM-DD');
    return { createdAt: { $dateBetween: [start, end] } };
  }, group: 'smart' },
  { key: 'this_month', label: 'This Month', filterFn: () => {
    const start = ctx.libs.dayjs().startOf('month').format('YYYY-MM-DD');
    const end = ctx.libs.dayjs().endOf('month').format('YYYY-MM-DD');
    return { createdAt: { $dateBetween: [start, end] } };
  }, group: 'smart' },
  { key: 'no_owner', label: 'Unassigned', filter: { owner_id: { $empty: true } }, group: 'smart' },
  { key: 'high_value', label: 'Enterprise', filter: { number_of_employees: { $in: ['1001-5000', '5001-10000', '10000+'] } }, group: 'smart' },
];

// ==================== Read URL params ====================
const _search = ctx.router?.state?.location?.search || '';
const _getParam = (key) => {
  const m = _search.match(new RegExp('[?&]' + key + '=([^&]*)'));
  return m ? decodeURIComponent(m[1]) : null;
};

const _urlStatus = _getParam('status');
const _urlFilter = _getParam('filter');
const _urlKey = _urlStatus || _urlFilter;
const INIT_KEY = STATS.find(s => s.key === _urlKey) ? _urlKey : 'all';

// ==================== Data Hook ====================
function useStats() {
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        // Only count status-based filters (not smart filters to save requests)
        const statusStats = STATS.filter(s => s.group === 'status');
        const results = await Promise.all(
          statusStats.map(s => ctx.api.request({
            url: 'nb_crm_leads:list',
            params: { pageSize: 1, ...(s.filter && { filter: JSON.stringify(s.filter) }) },
          }))
        );
        const c = {};
        statusStats.forEach((s, i) => { c[s.key] = results[i]?.data?.meta?.count || 0; });
        setCounts(c);
      } catch (e) { console.error('Stats fetch failed:', e); }
      setLoading(false);
    };
    fetchCounts();
  }, []);

  return { counts, loading };
}

// ==================== Main Component ====================
const StatsFilter = () => {
  const { counts, loading } = useStats();
  const [active, setActive] = useState(INIT_KEY);
  const appliedRef = ctx.React.useRef(false);

  const applyFilter = async (stat) => {
    try {
      const target = ctx.engine?.getModel(TARGET_BLOCK_UID);
      if (!target) return;
      const filterVal = stat.filterFn ? stat.filterFn() : (stat.filter || { $and: [] });
      target.resource.addFilterGroup(ctx.model.uid, filterVal);
      await target.resource.refresh();
    } catch (e) { console.error('Filter failed:', e); }
  };

  // Auto-apply from URL param
  useEffect(() => {
    if (!appliedRef.current && INIT_KEY !== 'all') {
      appliedRef.current = true;
      const stat = STATS.find(s => s.key === INIT_KEY);
      if (stat) setTimeout(() => applyFilter(stat), 500);
    }
  }, []);

  const handleClick = async (stat) => {
    setActive(stat.key);
    await applyFilter(stat);
  };

  if (loading) return <Spin />;

  const statusGroup = STATS.filter(s => s.group === 'status');
  const smartGroup = STATS.filter(s => s.group === 'smart');

  return (
    <Space wrap size={[8, 8]} split={<Divider type="vertical" style={{ margin: 0 }} />}>
      <Space wrap size={[8, 8]}>
        {statusGroup.map(s => (
          <Button key={s.key} type={active === s.key ? 'primary' : 'default'} onClick={() => handleClick(s)}>
            {s.label}{counts[s.key] != null ? ' ' : ''}
            {counts[s.key] != null && (
              <Badge count={counts[s.key]} showZero overflowCount={9999}
                style={{ marginLeft: 4,
                  backgroundColor: active === s.key ? '#fff' : '#f0f0f0',
                  color: active === s.key ? '#1677ff' : 'rgba(0,0,0,0.65)',
                  boxShadow: 'none' }} />
            )}
          </Button>
        ))}
      </Space>
      <Space wrap size={[8, 8]}>
        {smartGroup.map(s => (
          <Button key={s.key} type={active === s.key ? 'primary' : 'default'}
            style={active !== s.key ? { borderStyle: 'dashed' } : {}}
            onClick={() => handleClick(s)}>
            {s.label}
          </Button>
        ))}
      </Space>
    </Space>
  );
};

ctx.render(<StatsFilter />);
