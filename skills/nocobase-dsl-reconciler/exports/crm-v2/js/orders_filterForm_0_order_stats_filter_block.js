/**
 * Order Stats Filter Block
 * Supports URL params: ?month=YYYY-MM&payment_status=xxx
 */

var TARGET_BLOCK_UID = '76b91d81037';

var _React = ctx.React;
var useState = _React.useState;
var useEffect = _React.useEffect;
var _antd = ctx.antd;
var Button = _antd.Button, Badge = _antd.Badge, Space = _antd.Space, Spin = _antd.Spin, Divider = _antd.Divider;

var t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };

// ==================== URL Params ====================
var _search = ctx.router?.state?.location?.search || '';
var _getParam = function(key) {
  var m = _search.match(new RegExp('[?&]' + key + '=([^&]*)'));
  return m ? decodeURIComponent(m[1]) : null;
};
var _urlMonth = _getParam('month');
var _urlPayment = _getParam('payment_status');

// ==================== Filter Config ====================
var STATS = [
  { key: 'all', label: 'All', filter: null, group: 'status' },
  { key: 'processing', label: 'Processing', filter: { status: { $in: ['pending', 'confirmed'] } }, group: 'status' },
  { key: 'pending_payment', label: 'Pending Payment', filter: { payment_status: { $in: ['unpaid', 'partial'] } }, group: 'status' },
  { key: 'shipped', label: 'Shipped', filter: { status: { $eq: 'shipped' } }, group: 'status' },
  { key: 'completed', label: 'Completed', filter: { status: { $eq: 'completed' } }, group: 'status' },
];

// Add month filter from URL
if (_urlMonth) {
  var parts = _urlMonth.split('-');
  var y = Number(parts[0]);
  var m = Number(parts[1]);
  var lastDay = new Date(y, m, 0).getDate();
  var mStart = _urlMonth + '-01';
  var mEnd = _urlMonth + '-' + String(lastDay).padStart(2, '0');
  STATS.push({ key: 'month_' + _urlMonth, label: _urlMonth,
    filter: { order_date: { $dateBetween: [mStart, mEnd] } }, group: 'url' });
}

// Add payment_status filter from URL
if (_urlPayment) {
  var payLabel = _urlPayment.charAt(0).toUpperCase() + _urlPayment.slice(1);
  STATS.push({ key: 'pay_' + _urlPayment, label: payLabel,
    filter: { payment_status: { $eq: _urlPayment } }, group: 'url' });
}

// Determine initial key
var INIT_KEY = 'all';
if (_urlMonth) INIT_KEY = 'month_' + _urlMonth;
else if (_urlPayment) INIT_KEY = 'pay_' + _urlPayment;

// ==================== Data Hook ====================
function useStats() {
  var _s = useState({}), counts = _s[0], setCounts = _s[1];
  var _l = useState(true), loading = _l[0], setLoading = _l[1];

  useEffect(function() {
    var statusStats = STATS.filter(function(s) { return s.group === 'status'; });
    Promise.all(
      statusStats.map(function(s) {
        return ctx.api.request({
          url: 'nb_crm_orders:list',
          params: { pageSize: 1, ...(s.filter && { filter: JSON.stringify(s.filter) }) },
        });
      })
    ).then(function(results) {
      var c = {};
      statusStats.forEach(function(s, i) { c[s.key] = results[i]?.data?.meta?.count || 0; });
      setCounts(c);
      setLoading(false);
    }).catch(function(e) { console.error('Stats fetch failed:', e); setLoading(false); });
  }, []);

  return { counts: counts, loading: loading };
}

// ==================== Main Component ====================
var StatsFilter = function() {
  var stats = useStats();
  var counts = stats.counts, loading = stats.loading;
  var _a = useState(INIT_KEY), active = _a[0], setActive = _a[1];
  var appliedRef = _React.useRef(false);

  var applyFilter = function(stat) {
    var target = ctx.engine?.getModel(TARGET_BLOCK_UID);
    if (!target) return;
    target.resource.addFilterGroup(ctx.model.uid, stat.filter || { $and: [] });
    target.resource.refresh();
  };

  useEffect(function() {
    if (!appliedRef.current && INIT_KEY !== 'all') {
      appliedRef.current = true;
      var stat = STATS.find(function(s) { return s.key === INIT_KEY; });
      if (stat) setTimeout(function() { applyFilter(stat); }, 500);
    }
  }, []);

  var handleClick = function(stat) {
    setActive(stat.key);
    applyFilter(stat);
  };

  if (loading) return <Spin />;

  var statusGroup = STATS.filter(function(s) { return s.group === 'status'; });
  var urlGroup = STATS.filter(function(s) { return s.group === 'url'; });

  return (
    <Space wrap size={[8, 8]} split={urlGroup.length > 0 ? <Divider type="vertical" style={{ margin: 0 }} /> : null}>
      <Space wrap size={[8, 8]}>
        {statusGroup.map(function(s) {
          return (
            <Button key={s.key} type={active === s.key ? 'primary' : 'default'}
              onClick={function() { handleClick(s); }}>
              {s.label}{counts[s.key] != null ? ' ' : ''}
              {counts[s.key] != null && (
                <Badge count={counts[s.key]} showZero overflowCount={9999}
                  style={{ marginLeft: 4,
                    backgroundColor: active === s.key ? '#fff' : '#f0f0f0',
                    color: active === s.key ? '#1677ff' : 'rgba(0,0,0,0.65)',
                    boxShadow: 'none' }} />
              )}
            </Button>
          );
        })}
      </Space>
      {urlGroup.length > 0 && (
        <Space wrap size={[8, 8]}>
          {urlGroup.map(function(s) {
            return (
              <Button key={s.key} type={active === s.key ? 'primary' : 'default'}
                style={active !== s.key ? { borderStyle: 'dashed' } : {}}
                onClick={function() { handleClick(s); }}>
                {s.label}
              </Button>
            );
          })}
        </Space>
      )}
    </Space>
  );
};

ctx.render(<StatsFilter />);
