var React = ctx.React;
var useState = React.useState;
var useEffect = React.useEffect;
var Row = ctx.antd.Row, Col = ctx.antd.Col, Spin = ctx.antd.Spin;

var card = {
  borderRadius: 12, padding: '16px 20px', background: '#fff',
  border: '1px solid #f0f0f0', minHeight: 90,
};
var labelStyle = { fontSize: '0.875rem', fontWeight: 600, color: '#666', marginBottom: 4 };
var valStyle = function(color) {
  return { fontSize: '1.6rem', fontWeight: 700, color: color, letterSpacing: '-0.02em' };
};

function Tile(props) {
  return React.createElement('div', { style: card },
    React.createElement('div', { style: labelStyle }, props.label),
    React.createElement('div', { style: valStyle(props.color) }, props.value));
}

function useData() {
  var s = useState(null), data = s[0], setData = s[1];
  var l = useState(true), loading = l[0], setLoading = l[1];
  useEffect(function() {
    var now = new Date().toISOString();
    Promise.all([
      ctx.api.request({ url: 'nb_starter_projects:list', params: { pageSize: 1, filter: JSON.stringify({ status: 'active' }) } }),
      ctx.api.request({ url: 'nb_starter_tasks:list', params: { pageSize: 1 } }),
      ctx.api.request({ url: 'nb_starter_tasks:list', params: { pageSize: 1, filter: JSON.stringify({ status: 'in_progress' }) } }),
      ctx.api.request({ url: 'nb_starter_tasks:list', params: { pageSize: 1, filter: JSON.stringify({ status: { $ne: 'done' }, due_date: { $lt: now } }) } }),
    ]).then(function(r) {
      var get = function(x) { return (x && x.data && x.data.meta && x.data.meta.count) || 0; };
      setData({
        activeProjects: get(r[0]),
        totalTasks: get(r[1]),
        tasksInProgress: get(r[2]),
        overdueTasks: get(r[3]),
      });
      setLoading(false);
    }).catch(function() { setLoading(false); });
  }, []);
  return { data: data, loading: loading };
}

function Dashboard() {
  var state = useData();
  if (state.loading) return React.createElement(Spin);
  var d = state.data || { activeProjects: 0, totalTasks: 0, tasksInProgress: 0, overdueTasks: 0 };
  return React.createElement(Row, { gutter: [16, 16] },
    React.createElement(Col, { span: 6 }, React.createElement(Tile, { label: 'Active Projects', value: d.activeProjects, color: '#1677ff' })),
    React.createElement(Col, { span: 6 }, React.createElement(Tile, { label: 'Total Tasks', value: d.totalTasks, color: '#722ed1' })),
    React.createElement(Col, { span: 6 }, React.createElement(Tile, { label: 'In Progress', value: d.tasksInProgress, color: '#52c41a' })),
    React.createElement(Col, { span: 6 }, React.createElement(Tile, { label: 'Overdue Tasks', value: d.overdueTasks, color: '#ff4d4f' })));
}

ctx.render(React.createElement(Dashboard));
