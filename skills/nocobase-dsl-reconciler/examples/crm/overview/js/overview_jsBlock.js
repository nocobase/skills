var React = ctx.React;
var useState = React.useState;
var useEffect = React.useEffect;
var Row = ctx.antd.Row, Col = ctx.antd.Col, Spin = ctx.antd.Spin;

var t = function(key) { return ctx.t(key, { ns: 'nb_crm' }); };
var fmt = function(v) {
  var n = Number(v) || 0;
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
};

var kpiStyle = {
  borderRadius: 12, padding: '16px 20px', background: '#fff',
  border: '1px solid #f0f0f0', minHeight: 90, transition: 'all 0.2s ease'
};
var label = { fontSize: '0.875rem', fontWeight: 600, color: '#333', marginBottom: 4 };
var val = function(color) {
  return { fontSize: '1.6rem', fontWeight: 700, color: color, letterSpacing: '-0.02em' };
};
var sfx = { fontSize: '0.75rem', color: '#999', marginLeft: 4 };
var changeStyle = function(positive) {
  return { fontSize: '0.7rem', color: positive ? '#22c55e' : '#ef4444', marginTop: 4 };
};

function useData() {
  var _s = useState(null), data = _s[0], setData = _s[1];
  var _l = useState(true), loading = _l[0], setLoading = _l[1];
  useEffect(function() {
    var now = new Date();
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    var lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    var lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

    Promise.all([
      ctx.api.request({ url: 'nb_crm_leads:list', params: { pageSize: 1, filter: JSON.stringify({ createdAt: { $gte: monthStart } }) } }),
      ctx.api.request({ url: 'nb_crm_leads:list', params: { pageSize: 1, filter: JSON.stringify({ createdAt: { $gte: lastMonthStart, $lt: monthStart } }) } }),
      ctx.api.request({ url: 'nb_crm_leads:list', params: { pageSize: 1, filter: JSON.stringify({ is_converted: true, createdAt: { $gte: monthStart } }) } }),
      ctx.api.request({ url: 'nb_crm_opportunities:list', params: { pageSize: 200, filter: JSON.stringify({ stage: 'won', actual_close_date: { $gte: monthStart } }), fields: ['amount'] } }),
      ctx.api.request({ url: 'nb_crm_opportunities:list', params: { pageSize: 1, filter: JSON.stringify({ stage: { $notIn: ['won', 'lost'] } }) } }),
    ]).then(function(results) {
      var newLeads = (results[0] && results[0].data && results[0].data.meta && results[0].data.meta.count) || 0;
      var lastMonth = (results[1] && results[1].data && results[1].data.meta && results[1].data.meta.count) || 0;
      var converted = (results[2] && results[2].data && results[2].data.meta && results[2].data.meta.count) || 0;
      var wonData = (results[3] && results[3].data && results[3].data.data) || [];
      var revenue = wonData.reduce(function(s, o) { return s + (Number(o.amount) || 0); }, 0);
      var activeOpps = (results[4] && results[4].data && results[4].data.meta && results[4].data.meta.count) || 0;
      var leadsChange = lastMonth > 0 ? ((newLeads - lastMonth) / lastMonth * 100) : 0;
      var convRate = newLeads > 0 ? (converted / newLeads * 100) : 0;
      setData({ newLeads: newLeads, leadsChange: leadsChange, convRate: convRate, revenue: revenue, activeOpps: activeOpps });
      setLoading(false);
    }).catch(function() { setLoading(false); });
  }, []);
  return { data: data, loading: loading };
}

var NAV = {
  'Pipeline Value': '/admin/vga8g2pgnnu',
  'Open Deals': '/admin/vga8g2pgnnu',
  'Active Opps': '/admin/vga8g2pgnnu',
  'Win Rate': '/admin/vga8g2pgnnu',
  'Avg Deal Size': '/admin/vga8g2pgnnu',
  'Weighted Pipeline': '/admin/vga8g2pgnnu',
  'Deals Won': '/admin/vga8g2pgnnu?filter=won',
  'Won (MTD)': '/admin/vga8g2pgnnu?filter=won',
  'Avg AI Win Prob': '/admin/vga8g2pgnnu',
  'Avg Win Prob': '/admin/vga8g2pgnnu',
  'High Risk': '/admin/vga8g2pgnnu',
  'Stagnant (14d+)': '/admin/vga8g2pgnnu',
  'Closing This Month': '/admin/vga8g2pgnnu?filter=closing',
  'Closing This Week': '/admin/vga8g2pgnnu?filter=closing',
  'Value at Risk': '/admin/vga8g2pgnnu',
  'Pipeline / Deal': '/admin/vga8g2pgnnu',
  'New Leads': '/admin/e9478uhrdve?status=new',
  'Conversion Rate': '/admin/vga8g2pgnnu',
  'Monthly Revenue': '/admin/x9u01x7l8wj',
  'Revenue YTD': '/admin/x9u01x7l8wj',
  'Revenue MTD': '/admin/x9u01x7l8wj',
  'Active Customers': '/admin/c137kk6hghm',
  'Avg Health': '/admin/c137kk6hghm',
  'Hot Leads': '/admin/e9478uhrdve?filter=hot',
};

var KPI = function(props) {
  var navUrl = NAV[props.title] || null;
  var clickStyle = Object.assign({}, kpiStyle, navUrl ? {cursor: 'pointer'} : {});
  return React.createElement('div', { style: clickStyle, className: 'kpi-hover', onClick: function() { if (navUrl) ctx.router.navigate(navUrl); } },
    React.createElement('div', { style: label }, props.title),
    React.createElement('div', { style: { display: 'flex', alignItems: 'baseline' } },
      React.createElement('span', { style: val(props.color) }, props.value),
      props.suffix ? React.createElement('span', { style: sfx }, props.suffix) : null
    ),
    null
  );
};

var Comp = function() {
  var r = useData();
  if (r.loading) return React.createElement('div', {style:{textAlign:'center',padding:24}}, React.createElement(Spin));
  var s = r.data || {};
  return React.createElement(Row, { gutter: [12, 12] },
    React.createElement(Col, {xs:12, md:6}, React.createElement(KPI, {title:t('New Leads'), value:s.newLeads, color:'#3b82f6', change:s.leadsChange})),
    React.createElement(Col, {xs:12, md:6}, React.createElement(KPI, {title:t('Conversion Rate'), value:(s.convRate||0).toFixed(1), color:'#8b5cf6', suffix:'%'})),
    React.createElement(Col, {xs:12, md:6}, React.createElement(KPI, {title:t('Monthly Revenue'), value:fmt(s.revenue), color:'#22c55e'})),
    React.createElement(Col, {xs:12, md:6}, React.createElement(KPI, {title:t('Active Opps'), value:s.activeOpps, color:'#f59e0b'}))
  );
};

ctx.render(React.createElement(React.Fragment, null, React.createElement('style', null, '.kpi-hover{transition:all .2s ease}.kpi-hover:hover{box-shadow:0 4px 12px rgba(0,0,0,.1);transform:translateY(-2px);border-color:#d0d0d0!important}'), React.createElement(Comp)));
