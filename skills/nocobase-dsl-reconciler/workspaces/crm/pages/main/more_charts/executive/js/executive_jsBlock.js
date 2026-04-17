
var cardStyle = function(color) {
  return {
    borderRadius: 12, padding: '16px 20px', position: 'relative', overflow: 'hidden',
    background: '#fff', border: '1px solid #f0f0f0',
    display: 'flex', flexDirection: 'column', height: '100%', minHeight: 90, transition: 'all 0.2s ease'
  };
};
var labelStyle = { fontSize: '0.875rem', fontWeight: 600, color: '#333', marginBottom: 4 };
var valueStyle = function(color) {
  return { fontSize: '1.6rem', fontWeight: 700, color: color, letterSpacing: '-0.02em' };
};
var suffixStyle = { fontSize: '0.75rem', color: '#999', marginLeft: 4 };

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

var CONFIG = {
  reportUid: 'crm_exec_overview',
  sql: "SELECT COALESCE(SUM(amount) FILTER (WHERE stage = 'won' AND DATE_TRUNC('year', actual_close_date) = DATE_TRUNC('year', CURRENT_DATE)), 0) AS revenue_ytd, COALESCE(SUM(amount) FILTER (WHERE stage = 'won' AND DATE_TRUNC('month', actual_close_date) = DATE_TRUNC('month', CURRENT_DATE)), 0) AS revenue_mtd, COALESCE(SUM(amount) FILTER (WHERE stage NOT IN ('won','lost')), 0) AS pipeline_value, CASE WHEN COUNT(*) FILTER (WHERE stage IN ('won','lost')) > 0 THEN ROUND(COUNT(*) FILTER (WHERE stage='won') * 100.0 / COUNT(*) FILTER (WHERE stage IN ('won','lost')), 1) ELSE 0 END AS win_rate, COUNT(*) FILTER (WHERE stage NOT IN ('won','lost')) AS open_deals FROM nb_crm_opportunities"
};

var CONFIG2 = {
  reportUid: 'crm_exec_overview2',
  sql: "SELECT COUNT(*) FILTER (WHERE status = 'active') AS active_customers, ROUND(AVG(ai_health_score)::numeric, 0) AS avg_health FROM nb_crm_customers WHERE is_deleted = false OR is_deleted IS NULL"
};

var CONFIG3 = {
  reportUid: 'crm_exec_overview3',
  sql: "SELECT COUNT(*) FILTER (WHERE rating = 'hot' AND status NOT IN ('unqualified','converted')) AS hot_leads FROM nb_crm_leads"
};

function useData() {
  var _s = useState(null), data = _s[0], setData = _s[1];
  var _l = useState(true), loading = _l[0], setLoading = _l[1];
  useEffect(function() {
    var configs = [CONFIG, CONFIG2, CONFIG3];
    if (ctx.flowSettingsEnabled) {
      configs.forEach(function(c) {
        ctx.sql.save({ uid: c.reportUid, sql: c.sql, dataSourceKey: 'main' }).catch(function(){});
      });
    }
    Promise.all(configs.map(function(c) {
      return ctx.sql.runById(c.reportUid, { type: 'selectRows', dataSourceKey: 'main' });
    })).then(function(results) {
      var d1 = (results[0] && results[0][0]) || {};
      var d2 = (results[1] && results[1][0]) || {};
      var d3 = (results[2] && results[2][0]) || {};
      setData({
        revenueYtd: Number(d1.revenue_ytd) || 0,
        revenueMtd: Number(d1.revenue_mtd) || 0,
        pipelineValue: Number(d1.pipeline_value) || 0,
        winRate: Number(d1.win_rate) || 0,
        openDeals: Number(d1.open_deals) || 0,
        activeCustomers: Number(d2.active_customers) || 0,
        avgHealth: Number(d2.avg_health) || 0,
        hotLeads: Number(d3.hot_leads) || 0,
      });
      setLoading(false);
    }).catch(function() { setLoading(false); });
  }, []);
  return { data: data, loading: loading };
}


var NAV = {
  'Open Deals': '/admin/vga8g2pgnnu',
  'Pipeline Value': '/admin/vga8g2pgnnu',
  'Won (MTD)': '/admin/vga8g2pgnnu?filter=won',
  'Closing This Week': '/admin/vga8g2pgnnu?filter=closing',
  'Avg Win Prob': '/admin/vga8g2pgnnu',
  'Pipeline / Deal': '/admin/vga8g2pgnnu',
  'Revenue YTD': '/admin/x9u01x7l8wj',
  'Revenue MTD': '/admin/x9u01x7l8wj',
  'Win Rate': '/admin/vga8g2pgnnu',
  'Active Customers': '/admin/c137kk6hghm',
  'Avg Health': '/admin/c137kk6hghm',
  'Hot Leads': '/admin/e9478uhrdve?filter=hot',
};
var nav = function(title) { return function() { var url = NAV[title]; if (url) ctx.router.navigate(url); }; };
var clickable = function(style) { return Object.assign({}, style, {cursor: 'pointer'}); };
var cardProps = function(style, onClick) { return {style: clickable(style), className: 'kpi-hover', onClick: onClick}; };

var Comp = function() {
  var r = useData();
  if (r.loading) return React.createElement('div', {style:{textAlign:'center',padding:24}}, React.createElement(Spin));
  var s = r.data || {};
  return React.createElement('div', null,
    React.createElement(Row, {gutter: [12, 12]},
      React.createElement(Col, {xs:12, md:6}, React.createElement('div', cardProps(cardStyle('#22c55e'), nav('Revenue YTD')),
        React.createElement('div', {style: labelStyle}, t('Revenue YTD')),
        React.createElement('div', {style: {display:'flex', alignItems:'baseline'}},
          React.createElement('span', {style: valueStyle('#22c55e')}, fmt(s.revenueYtd))
        )
      )),
      React.createElement(Col, {xs:12, md:6}, React.createElement('div', cardProps(cardStyle('#10b981'), nav('Revenue MTD')),
        React.createElement('div', {style: labelStyle}, t('Revenue MTD')),
        React.createElement('div', {style: {display:'flex', alignItems:'baseline'}},
          React.createElement('span', {style: valueStyle('#10b981')}, fmt(s.revenueMtd))
        )
      )),
      React.createElement(Col, {xs:12, md:6}, React.createElement('div', cardProps(cardStyle('#3b82f6'), nav('Pipeline Value')),
        React.createElement('div', {style: labelStyle}, t('Pipeline Value')),
        React.createElement('div', {style: {display:'flex', alignItems:'baseline'}},
          React.createElement('span', {style: valueStyle('#3b82f6')}, fmt(s.pipelineValue))
        )
      )),
      React.createElement(Col, {xs:12, md:6}, React.createElement('div', cardProps(cardStyle('#8b5cf6'), nav('Win Rate')),
        React.createElement('div', {style: labelStyle}, t('Win Rate')),
        React.createElement('div', {style: {display:'flex', alignItems:'baseline'}},
          React.createElement('span', {style: valueStyle('#8b5cf6')}, s.winRate),
          React.createElement('span', {style: suffixStyle}, '%')
        )
      ))
    ),
    React.createElement(Row, {gutter: [12, 12], style: {marginTop: 12}},
      React.createElement(Col, {xs:12, md:6}, React.createElement('div', cardProps(cardStyle('#6366f1'), nav('Active Customers')),
        React.createElement('div', {style: labelStyle}, t('Active Customers')),
        React.createElement('div', {style: {display:'flex', alignItems:'baseline'}},
          React.createElement('span', {style: valueStyle('#6366f1')}, s.activeCustomers)
        )
      )),
      React.createElement(Col, {xs:12, md:6}, React.createElement('div', cardProps(cardStyle('#f59e0b'), nav('Avg Health')),
        React.createElement('div', {style: labelStyle}, t('Avg Health')),
        React.createElement('div', {style: {display:'flex', alignItems:'baseline'}},
          React.createElement('span', {style: valueStyle('#f59e0b')}, s.avgHealth)
        )
      )),
      React.createElement(Col, {xs:12, md:6}, React.createElement('div', cardProps(cardStyle('#3b82f6'), nav('Open Deals')),
        React.createElement('div', {style: labelStyle}, t('Open Deals')),
        React.createElement('div', {style: {display:'flex', alignItems:'baseline'}},
          React.createElement('span', {style: valueStyle('#3b82f6')}, s.openDeals)
        )
      )),
      React.createElement(Col, {xs:12, md:6}, React.createElement('div', cardProps(cardStyle('#ef4444'), nav('Hot Leads')),
        React.createElement('div', {style: labelStyle}, t('Hot Leads')),
        React.createElement('div', {style: {display:'flex', alignItems:'baseline'}},
          React.createElement('span', {style: valueStyle('#ef4444')}, s.hotLeads)
        )
      ))
    )
  );
};

ctx.render(React.createElement(React.Fragment, null, React.createElement('style', null, '.kpi-hover{transition:all .2s ease}.kpi-hover:hover{box-shadow:0 4px 12px rgba(0,0,0,.1);transform:translateY(-2px);border-color:#d0d0d0!important}'), React.createElement(Comp)));
