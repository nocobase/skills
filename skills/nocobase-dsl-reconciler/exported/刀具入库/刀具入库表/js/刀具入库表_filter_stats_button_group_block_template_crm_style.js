/**
 * Filter Stats Button Group Block Template (CRM-style)
 *
 * @type JSItemModel
 * @template filter-stats
 *
 * === AI Modification Guide ===
 * 1. Modify COLLECTION (collection name)
 * 2. Modify GROUPS (button group definitions)
 *    - key: unique identifier
 *    - label: button text
 *    - filter: NocoBase filter condition (null = all)
 *    - danger: true shows red
 * 3. You can have multiple groups (separated by Divider)
 * 4. Do not modify useStats/StatsFilter components — they are generic
 * ====================
 */

const TARGET_BLOCK_UID = 'fnyge9mfxe4';

// ─── CONFIG: AI modifies here ────────────────────────────────
const COLLECTION = 'nb_tm_production';

const GROUPS = [
  {
    name: 'status',
    items: [
      { key: 'all', label: '全部', filter: null },
      { key: 's1', label: '待入库', filter: {"status": {"$eq": "待入库"}} },
      { key: 's2', label: '待检测', filter: {"status": {"$eq": "待检测"}} },
      { key: 's3', label: '合格入库', filter: {"status": {"$eq": "合格入库"}} },
      { key: 's4', label: '不合格退回', filter: {"status": {"$eq": "不合格退回"}}, danger: true }
    ],
  },
];
// ─── CONFIG END ────────────────────────────────────

// ─── Do not modify below (CRM-identical style) ─────────────
const { useState, useEffect, useCallback } = ctx.React;
const { Button, Badge, Space, Spin, Divider } = ctx.antd;

function useStats() {
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchCounts = useCallback(async () => {
    setLoading(true);
    try {
      const allItems = GROUPS.flatMap(g => g.items);
      const results = await Promise.all(
        allItems.map(item =>
          ctx.api.request({
            url: `${COLLECTION}:list`,
            params: {
              pageSize: 1,
              ...(item.filter && { filter: item.filter }),
            },
          })
        )
      );
      const c = {};
      allItems.forEach((item, i) => {
        c[item.key] = results[i]?.data?.meta?.count || 0;
      });
      setCounts(c);
    } catch (e) {
      console.error('Stats fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  return { counts, loading };
}

const StatsFilter = () => {
  const { counts, loading } = useStats();
  const [active, setActive] = useState('all');

  const handleClick = useCallback(async (item) => {
    setActive(item.key);
    try {
      const target = ctx.engine?.getModel(TARGET_BLOCK_UID);
      if (!target) return;
      target.resource.addFilterGroup(ctx.model.uid, item.filter || { $and: [] });
      await target.resource.refresh();
    } catch (e) {
      console.error('Filter error:', e);
    }
  }, []);

  if (loading) return (<Spin size="small" />);

  const renderGroup = (group, idx) => (
    <Space key={idx} wrap size={[8, 8]}>
      {group.items.map(item => (
        <Button
          key={item.key}
          type={active === item.key ? 'primary' : 'default'}
          danger={item.danger}
          style={group.name !== GROUPS[0]?.name && active !== item.key ? { borderStyle: 'dashed' } : {}}
          onClick={() => handleClick(item)}
        >
          {item.label}{counts[item.key] != null ? ' ' : ''}
          {counts[item.key] != null && (
            <Badge
              count={counts[item.key]}
              showZero
              overflowCount={9999}
              style={{
                marginLeft: 4,
                backgroundColor: active === item.key ? '#fff' : '#f0f0f0',
                color: active === item.key ? '#1677ff' : 'rgba(0,0,0,0.65)',
                boxShadow: 'none',
              }}
            />
          )}
        </Button>
      ))}
    </Space>
  );

  return (
    <Space wrap size={[8, 8]} split={GROUPS.length > 1 ? <Divider type="vertical" style={{ margin: 0 }} /> : null}>
      {GROUPS.map((group, idx) => renderGroup(group, idx))}
    </Space>
  );
};

ctx.render(<StatsFilter />);
