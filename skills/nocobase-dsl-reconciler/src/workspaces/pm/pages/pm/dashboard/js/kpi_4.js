/**
 * KPI Card 4: Completed
 *
 * @type JSBlockModel
 *
 * SQL flow: ctx.sql.save({ uid, sql }) → ctx.sql.runById(uid, { type: 'selectRows' })
 */
var React = ctx.React;
var useState = React.useState;
var useEffect = React.useEffect;
var Spin = ctx.antd.Spin;
var T = ctx.themeToken || {};

// ==================== Config ====================
var CONFIG = {
  dataSourceKey: 'main',
  reportUid: 'pm_kpi_4',
  // TODO: replace with real SQL for this KPI
  sql: 'SELECT 0 AS value',
  label: 'Completed',
  color: '#8b5cf6',
};

// ==================== Styles ====================
var cardStyle = {
  borderRadius: '0', padding: '24px', position: 'relative', overflow: 'hidden',
  border: 'none', boxShadow: 'none',
  margin: '-24px', height: 'calc(100% + 48px)', width: 'calc(100% + 48px)',
  display: 'flex', flexDirection: 'column', cursor: 'pointer',
  background: T.colorBgContainer || '#fff',
};
var labelStyle = { fontSize: '0.875rem', fontWeight: '500', zIndex: 2, color: T.colorTextSecondary || '#666' };
var valueStyle = { fontSize: '2rem', fontWeight: '700', marginTop: 'auto', zIndex: 2, letterSpacing: '-0.03em', color: CONFIG.color };
var bgChartStyle = { position: 'absolute', bottom: 0, right: 0, width: '140px', height: '90px', zIndex: 1, opacity: 0.5, pointerEvents: 'none' };

// ==================== Data ====================
function useKpi() {
  var _s = useState(null), value = _s[0], setValue = _s[1];
  var _l = useState(true), loading = _l[0], setLoading = _l[1];
  useEffect(function() {
    var init = async function() {
      if (ctx.flowSettingsEnabled && CONFIG.sql) {
        try { await ctx.sql.save({ uid: CONFIG.reportUid, sql: CONFIG.sql.trim(), dataSourceKey: CONFIG.dataSourceKey }); } catch(e) {}
      }
      try {
        var result = await ctx.sql.runById(CONFIG.reportUid, { type: 'selectRows', dataSourceKey: CONFIG.dataSourceKey });
        setValue(Number(result?.[0]?.value) || 0);
      } catch(e) { setValue(0); }
      setLoading(false);
    };
    init();
  }, []);
  return { value: value, loading: loading };
}

var fmtVal = function(v) {
  var n = Number(v) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
};

// ==================== Render ====================
var KpiCard = function() {
  var r = useKpi();
  return React.createElement('div', { className: 'kpi-card-hover', style: cardStyle },
    React.createElement('span', { style: labelStyle }, CONFIG.label),
    React.createElement('div', { style: valueStyle }, r.loading ? '...' : fmtVal(r.value)),
    React.createElement('svg', { style: bgChartStyle, viewBox: '0 0 100 50', preserveAspectRatio: 'none' },
      React.createElement('path', { d: 'M0,50 L0,30 Q25,10 50,25 T100,15 L100,50 Z', fill: '#f5f3ff', stroke: '#c4b5fd', strokeWidth: '2' }))
  );
};

ctx.render(React.createElement(React.Fragment, null,
  React.createElement('style', null, ':has(> .kpi-card-hover),:has(> div > .kpi-card-hover){overflow:hidden!important}.kpi-card-hover{transition:transform .2s ease;transform:scale(0.97)}.kpi-card-hover:hover{transform:scale(1)}'),
  React.createElement(KpiCard, null)
));
