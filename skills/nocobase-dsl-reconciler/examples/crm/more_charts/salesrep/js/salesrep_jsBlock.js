
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
  reportUid: 'crm_my_performance',
  sql: "SELECT COUNT(*) FILTER (WHERE stage NOT IN ('won','lost')) AS open_deals, COALESCE(SUM(amount) FILTER (WHERE stage NOT IN ('won','lost')), 0) AS pipeline_value, COUNT(*) FILTER (WHERE stage = 'won' AND DATE_TRUNC('month', actual_close_date) = DATE_TRUNC('month', CURRENT_DATE)) AS deals_won_mtd, COUNT(*) FILTER (WHERE stage NOT IN ('won','lost') AND expected_close_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days') AS closing_this_week, ROUND(AVG(ai_win_probability)::numeric, 1) AS avg_win_prob FROM nb_crm_opportunities"
};

function useData() {
  var _s = useState(null), data = _s[0], setData = _s[1];
  var _l = useState(true), loading = _l[0], setLoading = _l[1];
  useEffect(function() {
    if (ctx.flowSettingsEnabled) {
      ctx.sql.save({ uid: CONFIG.reportUid, sql: CONFIG.sql, dataSourceKey: 'main' }).catch(function(){});
    }
    ctx.sql.runById(CONFIG.reportUid, { type: 'selectRows', dataSourceKey: 'main' })
      .then(function(r) {
        var d = (r && r[0]) || {};
        setData({
          openDeals: Number(d.open_deals) || 0,
          pipelineValue: Number(d.pipeline_value) || 0,
          dealsWonMtd: Number(d.deals_won_mtd) || 0,
          closingThisWeek: Number(d.closing_this_week) || 0,
          avgWinProb: Number(d.avg_win_prob) || 0,
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
  return React.createElement(Row, {gutter: [12, 12]},
    React.createElement(Col, {xs:12, md:4}, React.createElement('div', cardProps(cardStyle('#3b82f6'), nav('Open Deals')),
        React.createElement('div', {style: labelStyle}, t('Open Deals')),
        React.createElement('div', {style: {display:'flex', alignItems:'baseline'}},
          React.createElement('span', {style: valueStyle('#3b82f6')}, s.openDeals)
        )
      )),
    React.createElement(Col, {xs:12, md:4}, React.createElement('div', cardProps(cardStyle('#6366f1'), nav('Pipeline Value')),
        React.createElement('div', {style: labelStyle}, t('Pipeline Value')),
        React.createElement('div', {style: {display:'flex', alignItems:'baseline'}},
          React.createElement('span', {style: valueStyle('#6366f1')}, fmt(s.pipelineValue))
        )
      )),
    React.createElement(Col, {xs:12, md:4}, React.createElement('div', cardProps(cardStyle('#22c55e'), nav('Won (MTD)')),
        React.createElement('div', {style: labelStyle}, t('Won (MTD)')),
        React.createElement('div', {style: {display:'flex', alignItems:'baseline'}},
          React.createElement('span', {style: valueStyle('#22c55e')}, s.dealsWonMtd)
        )
      )),
    React.createElement(Col, {xs:12, md:4}, React.createElement('div', cardProps(cardStyle('#f59e0b'), nav('Closing This Week')),
        React.createElement('div', {style: labelStyle}, t('Closing This Week')),
        React.createElement('div', {style: {display:'flex', alignItems:'baseline'}},
          React.createElement('span', {style: valueStyle('#f59e0b')}, s.closingThisWeek)
        )
      )),
    React.createElement(Col, {xs:12, md:4}, React.createElement('div', cardProps(cardStyle('#8b5cf6'), nav('Avg Win Prob')),
        React.createElement('div', {style: labelStyle}, t('Avg Win Prob')),
        React.createElement('div', {style: {display:'flex', alignItems:'baseline'}},
          React.createElement('span', {style: valueStyle('#8b5cf6')}, s.avgWinProb),
          React.createElement('span', {style: suffixStyle}, '%')
        )
      )),
    React.createElement(Col, {xs:12, md:4}, React.createElement('div', cardProps(cardStyle('#10b981'), nav('Pipeline / Deal')),
        React.createElement('div', {style: labelStyle}, t('Pipeline / Deal')),
        React.createElement('div', {style: {display:'flex', alignItems:'baseline'}},
          React.createElement('span', {style: valueStyle('#10b981')}, s.openDeals > 0 ? fmt(s.pipelineValue / s.openDeals) : '$0')
        )
      ))
  );
};

ctx.render(React.createElement(React.Fragment, null, React.createElement('style', null, '.kpi-hover{transition:all .2s ease}.kpi-hover:hover{box-shadow:0 4px 12px rgba(0,0,0,.1);transform:translateY(-2px);border-color:#d0d0d0!important}'), React.createElement(Comp)));
