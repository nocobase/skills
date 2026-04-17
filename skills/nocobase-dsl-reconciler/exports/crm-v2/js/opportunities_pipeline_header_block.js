/**
 * Pipeline Header Block
 * Filters: All | My Deals | Big Deals | Closing Soon
 * Uses addFilterGroup to filter the kanban resource.
 */

const { useState, useEffect } = ctx.React;
const { Row, Col, Spin, Statistic, Typography, Space, Badge, Tag, Button } = ctx.antd;
const { Text } = Typography;

// Theme
const algorithm = ctx.antdConfig?.theme?.algorithm;
const darkAlgo = ctx.antd.theme.darkAlgorithm;
const isDark = Array.isArray(algorithm)
  ? algorithm.some(fn => fn === darkAlgo)
  : algorithm === darkAlgo;
const T = ctx.themeToken || {};

const t = (key, opts) => ctx.t(key, { ns: 'nb_crm.pipeline', ...opts });

// ==================== Config ====================

const TARGET_BLOCK_UID = '79de06ad20d';
const TABLE_NAME = 'nb_crm_opportunities';

const FILTERS = [
  { key: 'all', label: 'All Pipeline', color: T.colorPrimary || '#1890ff', icon: '📊' },
  { key: 'mine', label: 'My Deals', color: '#6366f1', icon: '👤' },
  { key: 'big', label: 'Big Deals', color: '#22c55e', icon: '💰' },
  { key: 'closing', label: 'Closing Soon', color: '#f59e0b', icon: '⏰' },
];

// ==================== Styles ====================

const styles = {
  filterItem: (isActive, color) => ({
    padding: '8px 16px',
    background: isActive
      ? (isDark ? `${color}20` : `${color}10`)
      : (T.colorBgContainer || '#fff'),
    border: `1px solid ${isActive ? color : (T.colorBorderSecondary || '#d9d9d9')}`,
    borderRadius: 6, cursor: 'pointer', transition: 'all 0.2s',
    display: 'flex', alignItems: 'center', gap: 8,
  }),
  statCard: {
    background: T.colorBgContainer || '#fff',
    border: `1px solid ${T.colorBorderSecondary || '#d9d9d9'}`,
    borderRadius: 8, padding: '12px 16px',
  },
};

const formatCurrency = (value) => {
  if (!value) return '$0';
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value}`;
};

// ==================== Data Hook ====================

function usePipelineStats() {
  const [stats, setStats] = useState({ total: { count: 0, amount: 0 }, filters: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await ctx.api.request({
          url: `${TABLE_NAME}:list`,
          params: { pageSize: 2000, fields: ['id', 'stage', 'amount', 'owner_id', 'expected_close_date'] },
        });
        const opps = res?.data?.data || [];
        const currentUserId = await ctx.getVar('ctx.user.id');
        const now = new Date();
        const in30days = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

        const active = opps.filter(o => o.stage !== 'won' && o.stage !== 'lost');
        const mine = active.filter(o => o.owner_id === currentUserId);
        const big = active.filter(o => parseFloat(o.amount) >= 50000);
        const closing = active.filter(o => {
          if (!o.expected_close_date) return false;
          const d = new Date(o.expected_close_date);
          return d >= now && d <= in30days;
        });

        const sum = (arr) => arr.reduce((s, o) => s + (parseFloat(o.amount) || 0), 0);

        setStats({
          total: { count: active.length, amount: sum(active) },
          filters: {
            all: { count: active.length, amount: sum(active) },
            mine: { count: mine.length, amount: sum(mine) },
            big: { count: big.length, amount: sum(big) },
            closing: { count: closing.length, amount: sum(closing) },
          },
        });
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  return { stats, loading };
}

// ==================== Main Component ====================

const PipelineHeader = () => {
  const { stats, loading } = usePipelineStats();
  const [activeKey, setActiveKey] = useState('all');
  const [searchText, setSearchText] = useState('');
  const searchTimerRef = ctx.React.useRef(null);

  const applySearch = (text) => {
    const targetModel = ctx.engine?.getModel(TARGET_BLOCK_UID);
    if (!targetModel?.resource) return;
    if (text.trim()) {
      targetModel.resource.addFilterGroup('search', {
        $or: [
          { name: { $includes: text.trim() } },
          { 'customer.name': { $includes: text.trim() } },
          { 'owner.nickname': { $includes: text.trim() } },
        ]
      });
    } else {
      targetModel.resource.removeFilterGroup('search');
    }
    targetModel.resource.refresh();
  };

  const handleSearch = (e) => {
    const val = e.target.value;
    setSearchText(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => applySearch(val), 400);
  };

  const handleFilter = async (key) => {
    setActiveKey(key);
    try {
      const targetModel = ctx.engine?.getModel(TARGET_BLOCK_UID);
      if (!targetModel?.resource) return;

      const currentUserId = await ctx.getVar('ctx.user.id');
      const now = new Date().toISOString().split('T')[0];
      const in30days = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0];

      let filter;
      switch (key) {
        case 'all':
          filter = { stage: { $notIn: ['won', 'lost'] } };
          break;
        case 'mine':
          filter = {
            $and: [
              { stage: { $notIn: ['won', 'lost'] } },
              { owner_id: { $eq: currentUserId } },
            ]
          };
          break;
        case 'big':
          filter = {
            $and: [
              { stage: { $notIn: ['won', 'lost'] } },
              { amount: { $gte: 50000 } },
            ]
          };
          break;
        case 'closing':
          filter = {
            $and: [
              { stage: { $notIn: ['won', 'lost'] } },
              { expected_close_date: { $gte: now, $lte: in30days } },
            ]
          };
          break;
      }

      targetModel.resource.addFilterGroup(ctx.model?.uid, filter);
      await targetModel.resource.refresh();
    } catch (err) {
      console.error('Filter failed:', err);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin /></div>;
  }

  return (
    <>
    <Row gutter={16} align="middle">
      <Col flex="auto">
        <Space wrap size={[8, 8]}>
          {FILTERS.map(f => {
            const data = stats.filters[f.key] || { count: 0, amount: 0 };
            const isActive = activeKey === f.key;
            return (
              <Button key={f.key} type={isActive ? 'primary' : 'default'}
                onClick={() => handleFilter(f.key)}>
                {f.icon} {f.label}{' '}
                <Badge count={data.count} showZero overflowCount={9999}
                  style={{ marginLeft: 4,
                    backgroundColor: isActive ? '#fff' : '#f0f0f0',
                    color: isActive ? '#1677ff' : 'rgba(0,0,0,0.65)',
                    boxShadow: 'none' }} />
              </Button>
            );
          })}
        </Space>
      </Col>
      <Col>
        <Space size={12}>
<div style={styles.statCard}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 11 }}>Open Deals</Text>}
              value={stats.total.count}
              valueStyle={{ fontSize: 18, fontWeight: 600 }}
            />
          </div>
          <div style={styles.statCard}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 11 }}>Pipeline Value</Text>}
              value={formatCurrency(stats.total.amount)}
              valueStyle={{ fontSize: 18, fontWeight: 600 }}
            />
          </div>
        </Space>
      </Col>
    </Row>
      <div style={{ marginTop: 8 }}>
        <Space size={8} align="center">
          <ctx.antd.Input.Search
            placeholder="Search name, customer, owner..."
            value={searchText}
            onChange={handleSearch}
            allowClear
            onClear={() => { setSearchText(''); applySearch(''); }}
            style={{ width: 480 }}
            size="middle"
          />
          <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
            Cross-block filtering powered by ctx.initResource + addFilterGroup
          </Text>
        </Space>
      </div>
    </>
  );
};

ctx.render(<PipelineHeader />);
