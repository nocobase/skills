/**
 * CRM Overview KPI Cards
 *
 * @type JSBlockModel
 * @collection nb_crm_opportunities
 */
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

// ==================== Config ====================

var CONFIG = {
  dataSourceKey: 'main',
  reportUid: 'crm_overview_kpi',
  sql: [
    'WITH stats AS (',
    '  SELECT',
    '    (SELECT count(*) FROM nb_crm_leads WHERE "createdAt" >= date_trunc(\'month\', CURRENT_DATE)) AS new_leads,',
    '    (SELECT count(*) FROM nb_crm_leads WHERE "createdAt" >= date_trunc(\'month\', CURRENT_DATE) - interval \'1 month\' AND "createdAt" < date_trunc(\'month\', CURRENT_DATE)) AS last_month_leads,',
    '    (SELECT count(*) FROM nb_crm_leads WHERE is_converted = true AND "createdAt" >= date_trunc(\'month\', CURRENT_DATE)) AS converted_leads,',
    '    (SELECT COALESCE(sum(amount), 0) FROM nb_crm_opportunities WHERE stage = \'won\' AND actual_close_date >= date_trunc(\'month\', CURRENT_DATE)) AS monthly_revenue,',
    '    (SELECT count(*) FROM nb_crm_opportunities WHERE stage NOT IN (\'won\', \'lost\')) AS active_opps',
    ')',
    'SELECT',
    '  new_leads, last_month_leads, converted_leads, monthly_revenue, active_opps,',
    '  CASE WHEN new_leads > 0 THEN ROUND(converted_leads * 100.0 / new_leads, 1) ELSE 0 END AS conv_rate,',
    '  CASE WHEN last_month_leads > 0 THEN ROUND((new_leads - last_month_leads) * 100.0 / last_month_leads, 1) ELSE 0 END AS leads_change',
    'FROM stats',
  ].join('\n'),
};

// ==================== Styles ====================

var T = ctx.themeToken || {};
var kpiStyle = {
  borderRadius: 12, padding: '16px 20px',
  background: T.colorBgContainer || '#fff',
  border: '1px solid ' + (T.colorBorderSecondary || '#f0f0f0'),
  minHeight: 90, transition: 'all 0.2s ease',
};
var labelSt = { fontSize: '0.875rem', fontWeight: 600, color: T.colorTextSecondary || '#333', marginBottom: 4 };
var valSt = function(color) {
  return { fontSize: '1.6rem', fontWeight: 700, color: color, letterSpacing: '-0.02em' };
};
var sfxSt = { fontSize: '0.75rem', color: '#999', marginLeft: 4 };

// ==================== Data Hook ====================

function useData() {
  var _s = useState(null), data = _s[0], setData = _s[1];
  var _l = useState(true), loading = _l[0], setLoading = _l[1];
  useEffect(function() {
    var init = async function() {
      if (ctx.flowSettingsEnabled && CONFIG.sql) {
        try {
          await ctx.sql.save({ uid: CONFIG.reportUid, sql: CONFIG.sql.trim(), dataSourceKey: CONFIG.dataSourceKey });
        } catch(e) { console.error('SQL save error:', e); }
      }
      try {
        var result = await ctx.sql.runById(CONFIG.reportUid, { type: 'selectRows', dataSourceKey: CONFIG.dataSourceKey });
        var d = result?.[0] || {};
        setData({
          newLeads: Number(d.new_leads) || 0,
          leadsChange: Number(d.leads_change) || 0,
          convRate: Number(d.conv_rate) || 0,
          revenue: Number(d.monthly_revenue) || 0,
          activeOpps: Number(d.active_opps) || 0,
        });
      } catch(e) {
        console.error('KPI query error:', e);
        setData({ newLeads: 0, leadsChange: 0, convRate: 0, revenue: 0, activeOpps: 0 });
      }
      setLoading(false);
    };
    init();
  }, []);
  return { data: data, loading: loading };
}

// ==================== Navigation ====================

var NAV = {
  'New Leads': '/admin/e9478uhrdve?status=new',
  'Conversion Rate': '/admin/vga8g2pgnnu',
  'Monthly Revenue': '/admin/x9u01x7l8wj',
  'Active Opps': '/admin/vga8g2pgnnu',
};

// ==================== Components ====================

var KPI = function(props) {
  var navUrl = NAV[props.title] || null;
  var clickStyle = Object.assign({}, kpiStyle, navUrl ? {cursor: 'pointer'} : {});
  return React.createElement('div', { style: clickStyle, className: 'kpi-hover', onClick: function() { if (navUrl) ctx.router.navigate(navUrl); } },
    React.createElement('div', { style: labelSt }, props.title),
    React.createElement('div', { style: { display: 'flex', alignItems: 'baseline' } },
      React.createElement('span', { style: valSt(props.color) }, props.value),
      props.suffix ? React.createElement('span', { style: sfxSt }, props.suffix) : null
    )
  );
};

var Comp = function() {
  var r = useData();
  if (r.loading) return React.createElement('div', {style:{textAlign:'center',padding:24}}, React.createElement(Spin));
  var s = r.data || {};
  return React.createElement(Row, { gutter: [12, 12] },
    React.createElement(Col, {xs:12, md:6}, React.createElement(KPI, {title:t('New Leads'), value:s.newLeads, color:'#3b82f6'})),
    React.createElement(Col, {xs:12, md:6}, React.createElement(KPI, {title:t('Conversion Rate'), value:(s.convRate||0).toFixed(1), color:'#8b5cf6', suffix:'%'})),
    React.createElement(Col, {xs:12, md:6}, React.createElement(KPI, {title:t('Monthly Revenue'), value:fmt(s.revenue), color:'#22c55e'})),
    React.createElement(Col, {xs:12, md:6}, React.createElement(KPI, {title:t('Active Opps'), value:s.activeOpps, color:'#f59e0b'}))
  );
};

ctx.render(React.createElement(React.Fragment, null,
  React.createElement('style', null, '.kpi-hover{transition:all .2s ease}.kpi-hover:hover{box-shadow:0 4px 12px rgba(0,0,0,.1);transform:translateY(-2px);border-color:#d0d0d0!important}'),
  React.createElement(Comp)
));
