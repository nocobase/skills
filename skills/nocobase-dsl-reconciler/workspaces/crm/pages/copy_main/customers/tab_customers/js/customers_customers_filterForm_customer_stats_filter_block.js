/**
 * Customer Stats Filter Block
 * Supports URL params: ?industry=xxx
 */

const TARGET_BLOCK_UID = 'tgnjosft2bq';

const { useState, useEffect } = ctx.React;
const { Button, Badge, Space, Spin, Divider } = ctx.antd;

const t = function(key, opts) { return ctx.t(key, Object.assign({ ns: 'nb_crm' }, opts)); };

// ==================== URL Params ====================
var _search = ctx.router?.state?.location?.search || '';
var _getParam = function(key) {
  var m = _search.match(new RegExp('[?&]' + key + '=([^&]*)'));
  return m ? decodeURIComponent(m[1]) : null;
};
var _urlIndustry = _getParam('industry');
var _urlType = _getParam('type');


// ==================== Filter Config ====================
var now = new Date();
var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

var STATS = [
  // Status filters
  { key: 'all', label: 'All', filter: null, group: 'status' },
  { key: 'active', label: 'Active', filter: { status: { $eq: 'active' } }, group: 'status' },
  { key: 'potential', label: 'Potential', filter: { status: { $eq: 'potential' } }, group: 'status' },
  { key: 'dormant', label: 'Dormant', filter: { status: { $eq: 'dormant' } }, group: 'status' },
  { key: 'key_account', label: 'Key Accounts', filter: { level: { $in: ['vip', 'important'] } }, group: 'status' },
  // Smart filters
  { key: 'new_month', label: 'New This Month', filter: { createdAt: { $gte: monthStart } }, group: 'smart' },
];

// Add industry filters from URL
if (_urlIndustry) {
  STATS.push({ key: 'industry_' + _urlIndustry, label: _urlIndustry,
    filter: { industry: { $eq: _urlIndustry } }, group: 'industry' });
}



// Determine initial key from URL
var INIT_KEY = 'all';
if (_urlIndustry) INIT_KEY = 'industry_' + _urlIndustry;

// ==================== Data Hook ====================
function useStats() {
  var _useState = useState({}), counts = _useState[0], setCounts = _useState[1];
  var _useState2 = useState(true), loading = _useState2[0], setLoading = _useState2[1];

  useEffect(function() {
    var fetchCounts = function() {
      var statusStats = STATS.filter(function(s) { return s.group === 'status'; });
      Promise.all(
        statusStats.map(function(s) {
          return ctx.api.request({
            url: 'nb_crm_customers:list',
            params: { pageSize: 1, ...(s.filter && { filter: JSON.stringify(s.filter) }) },
          });
        })
      ).then(function(results) {
        var c = {};
        statusStats.forEach(function(s, i) { c[s.key] = results[i]?.data?.meta?.count || 0; });
        setCounts(c);
        setLoading(false);
      }).catch(function(e) { console.error('Stats fetch failed:', e); setLoading(false); });
    };
    fetchCounts();
  }, []);

  return { counts: counts, loading: loading };
}

// ==================== Main Component ====================
var StatsFilter = function() {
  var stats = useStats();
  var counts = stats.counts, loading = stats.loading;
  var _active = useState(INIT_KEY);
  var active = _active[0], setActive = _active[1];
  var appliedRef = ctx.React.useRef(false);

  var applyFilter = function(stat) {
    var target = ctx.engine?.getModel(TARGET_BLOCK_UID);
    if (!target) return;
    target.resource.addFilterGroup(ctx.model.uid, stat.filter || { $and: [] });
    target.resource.refresh();
  };

  // Auto-apply from URL param
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
  var smartGroup = STATS.filter(function(s) { return s.group !== 'status'; });

  return (
    <Space wrap size={[8, 8]} split={smartGroup.length > 0 ? <Divider type="vertical" style={{ margin: 0 }} /> : null}>
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
      {smartGroup.length > 0 && (
        <Space wrap size={[8, 8]}>
          {smartGroup.map(function(s) {
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
