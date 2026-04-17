var React = ctx.React;
var useState = React.useState;
var useEffect = React.useEffect;
var T = ctx.themeToken || {};

var CONFIG = {
  dataSourceKey: 'main',
  reportUid: 'erp_dashboard_inventory_value',
  sql: 'SELECT COALESCE(SUM(current_stock * standard_cost), 0) AS value FROM nb_erp_products',
  label: 'Inventory Value',
  color: '#b45309',
  prefix: '$',
};

function useKpi() {
  var s = useState(null), value = s[0], setValue = s[1];
  var l = useState(true), loading = l[0], setLoading = l[1];
  useEffect(function() {
    (async function() {
      try { await ctx.sql.save({ uid: CONFIG.reportUid, sql: CONFIG.sql, dataSourceKey: CONFIG.dataSourceKey }); } catch (e) {}
      try {
        var result = await ctx.sql.runById(CONFIG.reportUid, { type: 'selectRows', dataSourceKey: CONFIG.dataSourceKey });
        setValue(Number(result && result[0] && result[0].value) || 0);
      } catch (e) { setValue(0); }
      setLoading(false);
    })();
  }, []);
  return { value: value, loading: loading };
}

function formatValue(v) {
  var n = Number(v) || 0;
  if (n >= 1000000) return CONFIG.prefix + (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return CONFIG.prefix + (n / 1000).toFixed(1) + 'K';
  return CONFIG.prefix + n.toFixed(0);
}

function Card() {
  var r = useKpi();
  return React.createElement('div', {
    style: {
      borderRadius: '0', padding: '24px', position: 'relative', overflow: 'hidden',
      margin: '-24px', height: 'calc(100% + 48px)', width: 'calc(100% + 48px)',
      display: 'flex', flexDirection: 'column', background: T.colorBgContainer || '#fff',
    },
  },
  React.createElement('span', { style: { fontSize: '0.875rem', fontWeight: '500', color: T.colorTextSecondary || '#666' } }, CONFIG.label),
  React.createElement('div', { style: { fontSize: '2rem', fontWeight: '700', marginTop: 'auto', color: CONFIG.color } }, r.loading ? '...' : formatValue(r.value)));
}

ctx.render(React.createElement(Card));
