const { useState, useEffect } = ctx.React;
const { Button, Badge, Space, Spin } = ctx.antd;

const STATS = [
  { key: 'all', label: 'All', filter: null },
];

function findTableModel() {
  var models = ctx.engine?.models;
  if (!models) return null;
  var target = null;
  models.forEach(function(m, uid) {
    if (!target && m && m.props && m.props.blockType === 'table') target = m;
  });
  return target;
}

function useStats() {
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const results = await Promise.all(
          STATS.map(s => ctx.api.request({
            url: 'nb_hrm_departments:list',
            params: { pageSize: 1, ...(s.filter && { filter: JSON.stringify(s.filter) }) },
          }))
        );
        const c = {};
        STATS.forEach((s, i) => { c[s.key] = results[i]?.data?.meta?.count || 0; });
        setCounts(c);
      } catch (e) { console.error('Stats fetch failed:', e); }
      setLoading(false);
    };
    fetchCounts();
  }, []);

  return { counts, loading };
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
