/**
 * Kanban Board Block (Resource-based)
 * Uses ctx.initResource('MultiRecordResource') so that
 * other blocks can filter this via addFilterGroup + refresh.
 */

const { useState, useEffect, useMemo, useCallback } = ctx.React;
const { Card, Spin, Typography, Tag, Space, Avatar, Badge } = ctx.antd;
const { Text } = Typography;

// Theme detection
const algorithm = ctx.antdConfig?.theme?.algorithm;
const darkAlgo = ctx.antd.theme.darkAlgorithm;
const isDark = Array.isArray(algorithm)
  ? algorithm.some(fn => fn === darkAlgo)
  : algorithm === darkAlgo;
const T = ctx.themeToken || {};

// i18n
const t = (key, opts) => ctx.t(key, { ns: 'nb_crm.pipeline', ...opts });

// ==================== Config ====================

const VIEW_CONFIG = {
  detailPopup: 'mqy057p1798',
  addPopup: 'kto0pdc55hq',
};
const TABLE_NAME = 'nb_crm_opportunities';

const STAGES = [
  { key: 'prospecting', label: t('Prospecting'), color: '#6366f1' },
  { key: 'analysis', label: t('Analysis'), color: '#8b5cf6' },
  { key: 'proposal', label: t('Proposal'), color: '#ec4899' },
  { key: 'negotiation', label: t('Negotiation'), color: '#f59e0b' },
  { key: 'won', label: t('Won'), color: '#22c55e' },
  { key: 'lost', label: t('Lost'), color: '#ef4444' },
];

// ==================== Init Resource ====================

ctx.initResource('MultiRecordResource');
ctx.resource.setResourceName(TABLE_NAME);
ctx.resource.setPageSize(500);
ctx.resource.setSort(['-updatedAt']);
ctx.resource.setAppends(['customer', 'owner']);

// ==================== Styles ====================

const styles = {
  board: { display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 },
  column: {
    width: 260, flexShrink: 0,
    background: T.colorBgLayout || '#f5f5f5',
    border: `1px solid ${T.colorBorderSecondary || '#d9d9d9'}`,
    borderRadius: 8, display: 'flex', flexDirection: 'column',
    maxHeight: 'calc(100vh - 280px)',
  },
  columnHeader: {
    padding: '12px',
    borderBottom: `1px solid ${T.colorBorderSecondary || '#d9d9d9'}`,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  cardsArea: { flex: 1, padding: 8, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 },
  card: { borderRadius: 6, cursor: 'pointer' },
  cardBody: { padding: 10 },
};

// ==================== Helper ====================

const formatCurrency = (v) => {
  if (!v) return '$0';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v}`;
};

const getInitials = (name) => {
  if (!name) return '?';
  if (/[\u4e00-\u9fa5]/.test(name)) return name.slice(-1);
  return name.charAt(0).toUpperCase();
};

// ==================== Components ====================

const OppCard = ({ opp, onClick }) => {
  const owner = opp.owner?.nickname || opp.owner?.name;
  const customer = opp.customer?.name;
  const prob = opp.win_probability || 0;

  const handleDragStart = (e) => {
    e.dataTransfer.setData('oppId', opp.id);
    e.dataTransfer.effectAllowed = 'move';
    e.target.style.opacity = '0.5';
  };
  const handleDragEnd = (e) => { e.target.style.opacity = '1'; };

  return (
    <Card hoverable draggable onDragStart={handleDragStart} onDragEnd={handleDragEnd}
      onClick={() => onClick(opp)} style={{ ...styles.card, cursor: 'grab' }} styles={{ body: styles.cardBody }}>
      <div style={{ marginBottom: 6 }}>
        <Text strong style={{ fontSize: 13 }}>{opp.name || 'Untitled'}</Text>
        {customer && <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{customer}</Text>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong style={{ fontSize: 15 }}>{formatCurrency(opp.amount)}</Text>
        {prob > 0 && (
          <Tag color={prob >= 60 ? 'success' : prob >= 30 ? 'warning' : 'default'} style={{ fontSize: 11 }}>
            {prob}%
          </Tag>
        )}
      </div>
      {owner && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Avatar size={20} style={{ background: T.colorPrimary || '#1890ff', fontSize: 10 }}>{getInitials(owner)}</Avatar>
          <Text type="secondary" style={{ fontSize: 11 }}>{owner}</Text>
        </div>
      )}
    </Card>
  );
};

const StageColumn = ({ stage, opps, onCardClick, onDrop, onAdd }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const total = opps.reduce((s, o) => s + (parseFloat(o.amount) || 0), 0);

  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsDragOver(true); };
  const handleDragLeave = () => { setIsDragOver(false); };
  const handleDrop = (e) => {
    e.preventDefault(); setIsDragOver(false);
    const oppId = e.dataTransfer.getData('oppId');
    if (oppId) onDrop(parseInt(oppId), stage.key);
  };

  return (
    <div style={{
      ...styles.column,
      background: isDragOver ? (T.colorPrimaryBg || '#e6f7ff') : (T.colorBgLayout || '#f5f5f5'),
      borderColor: isDragOver ? (T.colorPrimary || '#1890ff') : (T.colorBorderSecondary || '#d9d9d9'),
    }} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <div style={styles.columnHeader}>
        <Space size={6}>
          <Badge color={stage.color} />
          <Text strong style={{ fontSize: 13 }}>{stage.label}</Text>
          <Text type="secondary">({opps.length})</Text>
        </Space>
        <Space size={8}>
          <Text type="secondary" style={{ fontSize: 12 }}>{formatCurrency(total)}</Text>
          <span onClick={onAdd} style={{ cursor: 'pointer', color: T.colorPrimary || '#1890ff', fontSize: 16, lineHeight: 1 }}
            title={t('Add Opportunity')}>+</span>
        </Space>
      </div>
      <div style={styles.cardsArea}>
        {opps.length === 0
          ? <Text type="secondary" style={{ textAlign: 'center', padding: 20, fontSize: 12 }}>{isDragOver ? 'Drop here' : 'Empty'}</Text>
          : opps.map(o => <OppCard key={o.id} opp={o} onClick={onCardClick} />)
        }
      </div>
    </div>
  );
};

// ==================== Main Component ====================

const KanbanBoard = () => {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    const data = ctx.resource.getData() || [];
    setOpportunities(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial load
    ctx.resource.refresh().then(loadData);
    // Listen for refresh (triggered by addFilterGroup from Header)
    ctx.resource.on('refresh', loadData);
    return () => ctx.resource.off('refresh', loadData);
  }, []);

  const grouped = useMemo(() => {
    const g = {};
    STAGES.forEach(s => { g[s.key] = []; });
    opportunities.forEach(o => {
      const s = o.stage || 'prospecting';
      if (g[s]) g[s].push(o);
    });
    return g;
  }, [opportunities]);

  const handleCardClick = async (opp) => {
    if (!ctx.openView) return;
    try {
      await ctx.openView(VIEW_CONFIG.detailPopup, { mode: 'drawer', size: 'large', filterByTk: opp.id });
      ctx.resource.refresh();
    } catch (err) { console.error('Open failed:', err); }
  };

  const handleDrop = async (oppId, newStage) => {
    const opp = opportunities.find(o => o.id === oppId);
    if (opp && opp.stage !== newStage) {
      try {
        await ctx.resource.update(oppId, { stage: newStage });
        ctx.message?.success('Stage updated');
      } catch (err) {
        console.error('Failed to update stage:', err);
        ctx.message?.error('Failed to update');
      }
    }
  };

  const handleAdd = async () => {
    if (!ctx.openView) return;
    try {
      await ctx.openView(VIEW_CONFIG.addPopup, { mode: 'drawer', size: 'medium' });
      ctx.resource.refresh();
    } catch (err) { console.error('Open add form failed:', err); }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin /></div>;
  }

  return (
    <div style={styles.board}>
      {STAGES.map(stage => (
        <StageColumn key={stage.key} stage={stage} opps={grouped[stage.key] || []}
          onCardClick={handleCardClick} onDrop={handleDrop} onAdd={handleAdd} />
      ))}
    </div>
  );
};

ctx.render(<KanbanBoard />);
