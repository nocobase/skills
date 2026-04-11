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

var SQL1 = "WITH ps AS (SELECT COUNT(*) AS total, COALESCE(SUM(amount),0) AS total_val, ROUND(AVG(amount)::numeric,0) AS avg_size, COUNT(*) FILTER (WHERE stage='won') AS won, COUNT(*) FILTER (WHERE stage IN ('won','lost')) AS closed, COUNT(*) FILTER (WHERE stage NOT IN ('won','lost')) AS open_d, COALESCE(SUM(amount) FILTER (WHERE stage NOT IN ('won','lost')),0) AS pipe_val, ROUND(AVG(ai_win_probability)::numeric,1) AS avg_prob, COUNT(*) FILTER (WHERE ai_win_probability<40 AND stage NOT IN ('won','lost')) AS high_risk, COUNT(*) FILTER (WHERE stage NOT IN ('won','lost') AND \"updatedAt\"<NOW()-INTERVAL '14 days') AS stagnant, COUNT(*) FILTER (WHERE stage NOT IN ('won','lost') AND expected_close_date BETWEEN DATE_TRUNC('month',CURRENT_DATE) AND DATE_TRUNC('month',CURRENT_DATE)+INTERVAL '1 month'-INTERVAL '1 day') AS closing_mo, COALESCE(SUM(amount) FILTER (WHERE ai_win_probability<40 AND stage NOT IN ('won','lost')),0) AS val_at_risk FROM nb_crm_opportunities) SELECT *, CASE WHEN closed>0 THEN ROUND(won*100.0/closed,1) ELSE 0 END AS win_rate, ROUND(pipe_val*avg_prob/100,0) AS weighted FROM ps";

function useData() {
  var _s = useState(null), data = _s[0], setData = _s[1];
  var _l = useState(true), loading = _l[0], setLoading = _l[1];
  useEffect(function() {
    var uid = 'crm_sm_dashboard';
    if (ctx.flowSettingsEnabled) {
      ctx.sql.save({ uid: uid, sql: SQL1, dataSourceKey: 'main' }).catch(function(){});
    }
    ctx.sql.runById(uid, { type: 'selectRows', dataSourceKey: 'main' })
      .then(function(r) {
        var d = (r && r[0]) || {};
        setData({
          pipeVal: Number(d.pipe_val)||0, openDeals: Number(d.open_d)||0,
          winRate: Number(d.win_rate)||0, avgSize: Number(d.avg_size)||0,
          highRisk: Number(d.high_risk)||0, stagnant: Number(d.stagnant)||0,
          closingMo: Number(d.closing_mo)||0, valAtRisk: Number(d.val_at_risk)||0,
        });
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
    )
  );
};

var Comp = function() {
  var r = useData();
  if (r.loading) return React.createElement('div', {style:{textAlign:'center',padding:40}}, React.createElement(Spin));
  var s = r.data || {};
  return React.createElement('div', null,
    React.createElement(Row, { gutter: [12, 12] },
      React.createElement(Col, {xs:12, md:6}, React.createElement(KPI, {title:t('Pipeline Value'), value:fmt(s.pipeVal), color:'#3b82f6'})),
      React.createElement(Col, {xs:12, md:6}, React.createElement(KPI, {title:t('Open Deals'), value:s.openDeals, color:'#6366f1'})),
      React.createElement(Col, {xs:12, md:6}, React.createElement(KPI, {title:t('Win Rate'), value:s.winRate, color:'#22c55e', suffix:'%'})),
      React.createElement(Col, {xs:12, md:6}, React.createElement(KPI, {title:t('Avg Deal Size'), value:fmt(s.avgSize), color:'#8b5cf6'}))
    ),
    React.createElement(Row, { gutter: [12, 12], style: { marginTop: 12 } },
      React.createElement(Col, {xs:12, md:6}, React.createElement(KPI, {title:t('High Risk'), value:s.highRisk, color:'#ef4444', alert:true})),
      React.createElement(Col, {xs:12, md:6}, React.createElement(KPI, {title:t('Stagnant (14d+)'), value:s.stagnant, color:'#f59e0b', alert:true})),
      React.createElement(Col, {xs:12, md:6}, React.createElement(KPI, {title:t('Closing This Month'), value:s.closingMo, color:'#3b82f6', alert:true})),
      React.createElement(Col, {xs:12, md:6}, React.createElement(KPI, {title:t('Value at Risk'), value:fmt(s.valAtRisk), color:'#ef4444', alert:true}))
    )
  );
};

ctx.render(React.createElement(React.Fragment, null, React.createElement('style', null, '.kpi-hover{transition:all .2s ease}.kpi-hover:hover{box-shadow:0 4px 12px rgba(0,0,0,.1);transform:translateY(-2px);border-color:#d0d0d0!important}'), React.createElement(Comp)));
