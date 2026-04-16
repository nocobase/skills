const { useState, useEffect } = ctx.React;
const { Button, Badge, Space, Spin } = ctx.antd;

const STATS = [
  { key: 'all', label: 'All', filter: null, group: 'status' },
  { key: 'planning', label: 'Planning', filter: { status: { $eq: 'planning' } }, group: 'status' },
  { key: 'active', label: 'Active', filter: { status: { $eq: 'active' } }, group: 'status' },
  { key: 'on_hold', label: 'On Hold', filter: { status: { $eq: 'on_hold' } }, group: 'status' },
  { key: 'completed', label: 'Completed', filter: { status: { $eq: 'completed' } }, group: 'status' },
];

function useStats() {
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const statusStats = STATS.filter(s => s.group === 'status');
        const results = await Promise.all(
          statusStats.map(s => ctx.api.request({
            url: 'nb_pm_projects:list',
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

function findTableModel() {
  var models = ctx.engine?.models;
  if (!models) return null;
  var target = null;
  models.forEach(function(m, uid) {
    if (!target && m && m.props && m.props.blockType === 'table') target = m;
  });
  return target;
}

var StatsFilter = function() {
  var stats = useStats();
  var counts = stats.counts, loading = stats.loading;
  var _active = useState('all');
  var active = _active[0], setActive = _active[1];

  var applyFilter = function(stat) {
    var target = findTableModel();
    if (!target) return;
    target.resource.addFilterGroup(ctx.model.uid, stat.filter || { $and: [] });
    target.resource.refresh();
  };

  return React.createElement(Space, { size: 'small', wrap: true },
    STATS.map(function(s) {
      return React.createElement(Button,
        {
          key: s.key,
          type: active === s.key ? 'primary' : 'default',
          onClick: function() { setActive(s.key); applyFilter(s); },
        },
        s.label,
        loading ? null : React.createElement(Badge, { count: counts[s.key] || 0, style: { marginLeft: 8, backgroundColor: active === s.key ? '#fff' : '#1890ff', color: active === s.key ? '#1890ff' : '#fff' } })
      );
    })
  );
};

ctx.render(React.createElement(StatsFilter, null));
