/**
 * Quote Status Flow Block
 * Table: nb_crm_quotations (related to opportunity)
 *
 * Displays current quote's status flow visualization
 * Status flow from fields enum: draft → pending_approval → approved → sent → accepted/rejected
 *
 * Data source: API fetch latest quotation by opportunity_id
 */

const { React } = ctx;
const { useState, useEffect } = React;
const { Space, Typography, Spin, Empty } = ctx.antd;
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

// Status flow order (matches fields enum)
const STATUS_FLOW = [
  { key: 'draft', label: t('Draft'), color: 'default' },
  { key: 'pending_approval', label: t('Pending Approval'), color: 'orange' },
  { key: 'approved', label: t('Approved'), color: 'blue' },
  { key: 'sent', label: t('Sent'), color: 'cyan' },
  { key: 'accepted', label: t('Accepted'), color: 'green' },
];

// Terminal statuses
const TERMINAL_STATUSES = {
  rejected: { label: t('Rejected'), color: 'red' },
  expired: { label: t('Expired'), color: 'default' },
};

const styles = {
  container: {
    background: T.colorBgContainer || '#fff',
    border: `1px solid ${T.colorBorderSecondary || '#f0f0f0'}`,
    borderRadius: 8,
    padding: 16,
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    fontSize: 14,
    fontWeight: 600,
  },
  flow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  node: (status) => ({
    padding: '6px 12px',
    borderRadius: 16,
    fontSize: 12,
    fontWeight: 500,
    background: status === 'completed' ? (isDark ? 'rgba(34,197,94,0.15)' : '#f0fdf4') :
                status === 'current' ? (isDark ? 'rgba(59,130,246,0.15)' : '#eff6ff') :
                status === 'rejected' ? (isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2') :
                status === 'expired' ? (T.colorBgLayout || '#f5f5f5') : (T.colorBgLayout || '#f5f5f5'),
    color: status === 'completed' ? (T.colorSuccess || '#22c55e') :
           status === 'current' ? '#3b82f6' :
           status === 'rejected' ? (T.colorError || '#ef4444') :
           status === 'expired' ? (T.colorTextTertiary || '#9ca3af') : (T.colorTextTertiary || '#9ca3af'),
    border: status === 'current' ? '2px solid #3b82f6' : '1px solid transparent',
  }),
  arrow: (completed) => ({
    color: completed ? (T.colorSuccess || '#22c55e') : (T.colorBorderSecondary || '#d9d9d9'),
    fontSize: 14,
    margin: '0 2px',
  }),
  versionTag: {
    marginLeft: 8,
    fontSize: 12,
    color: '#6366f1',
    fontWeight: 600,
  },
};

// ==================== Helper Functions ====================

function getStatusIndex(status) {
  return STATUS_FLOW.findIndex(s => s.key === status);
}

// ==================== Main Component ====================

const QuoteStatusFlow = () => {
  const record = ctx.record || ctx.popup?.record || {};
  const opportunityId = record.id;

  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!opportunityId || !ctx.api) {
      setLoading(false);
      return;
    }

    const fetchLatestQuote = async () => {
      try {
        const res = await ctx.api.request({
          url: 'nb_crm_quotations:list',
          method: 'GET',
          params: {
            filter: { opportunity_id: opportunityId },
            sort: ['-version'],
            fields: ['id', 'version', 'status'],
            pageSize: 1,
          },
        });
        const quotes = res?.data?.data || [];
        setQuote(quotes[0] || null);
      } catch (error) {
        console.error('Failed to fetch quote:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLatestQuote();
  }, [opportunityId]);

  if (loading) {
    return (
      <div style={styles.container}>
        <Space style={{ width: '100%', justifyContent: 'center', padding: 24 }}>
          <Spin size="small" />
        </Space>
      </div>
    );
  }

  if (!quote) {
    return (
      <div style={styles.container}>
        <div style={styles.title}>
          <span>{t('Quote Status Flow')}</span>
        </div>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No quotes yet" />
      </div>
    );
  }

  const currentStatus = quote.status || 'draft';
  const isTerminal = !!TERMINAL_STATUSES[currentStatus];
  const currentIndex = getStatusIndex(currentStatus);

  // Build flow items
  const flowItems = STATUS_FLOW.map((item, index) => {
    let nodeStatus = 'pending';
    if (isTerminal) {
      // Show completed up to where it stopped, then terminal
      const terminalIndex = getStatusIndex(currentStatus);
      if (terminalIndex >= 0) {
        if (index < terminalIndex) nodeStatus = 'completed';
        else if (index === terminalIndex) nodeStatus = currentStatus;
      } else {
        // Terminal status not in flow, show all as completed before terminal
        nodeStatus = 'completed';
      }
    } else if (index < currentIndex) {
      nodeStatus = 'completed';
    } else if (index === currentIndex) {
      nodeStatus = 'current';
    }
    return { ...item, nodeStatus };
  });

  return (
    <div style={styles.container}>
      <div style={styles.title}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
        <span>{t('Quote Status Flow')}</span>
        <span style={styles.versionTag}>(V{quote.version || 1})</span>
      </div>

      <div style={styles.flow}>
        {flowItems.map((item, index) => (
          <React.Fragment key={item.key}>
            <span style={styles.node(item.nodeStatus)}>
              {item.nodeStatus === 'completed' && '✓ '}
              {item.nodeStatus === 'current' && '● '}
              {item.label}
            </span>
            {index < flowItems.length - 1 && (
              <span style={styles.arrow(item.nodeStatus === 'completed')}>→</span>
            )}
          </React.Fragment>
        ))}
        {isTerminal && (
          <>
            <span style={styles.arrow(false)}>→</span>
            <span style={styles.node(currentStatus)}>
              {TERMINAL_STATUSES[currentStatus].label}
            </span>
          </>
        )}
      </div>
    </div>
  );
};

ctx.render(<QuoteStatusFlow />);
