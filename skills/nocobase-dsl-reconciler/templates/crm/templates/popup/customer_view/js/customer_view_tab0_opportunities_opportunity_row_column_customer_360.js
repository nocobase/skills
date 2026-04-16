/**
 * Opportunity Row Column - Customer 360
 *
 * Displays an opportunity row in a business style.
 * Shows: Name, Stage Tag, Amount, Win Probability
 * Clickable to open opportunity detail popup.
 *
 * Table: nb_crm_opportunities (related to customer)
 * Fields: name, stage, amount, win_probability, currency
 * Currency symbols loaded from: nb_cbo_currencies
 */

const { Space, Tag, Typography, Spin } = ctx.antd;
const { Text } = Typography;
const { useState, useEffect } = ctx.React;

// Theme detection
const algorithm = ctx.antdConfig?.theme?.algorithm;
const darkAlgo = ctx.antd.theme.darkAlgorithm;
const isDark = Array.isArray(algorithm)
  ? algorithm.some(fn => fn === darkAlgo)
  : algorithm === darkAlgo;
const T = ctx.themeToken || {};

// i18n
const t = (key, opts) => ctx.t(key, { ns: 'nb_crm', ...opts });

// Stage configurations
const STAGE_CONFIG = {
  qualification: { label: t('Qualification'), color: 'default' },
  needs_analysis: { label: t('Needs Analysis'), color: 'processing' },
  proposal: { label: t('Proposal'), color: 'processing' },
  negotiation: { label: t('Negotiation'), color: 'warning' },
  closed_won: { label: t('Won'), color: 'success' },
  won: { label: t('Won'), color: 'success' },
  closed_lost: { label: t('Lost'), color: 'error' },
  lost: { label: t('Lost'), color: 'error' },
};

// Configure popup UID
const VIEW_CONFIG = {
  opportunityDetailPopup: 'xzuvlcsgar6',
};

// Currency cache (shared across renders)
let currencyCache = null;
let currencyLoading = false;
let currencyLoadPromise = null;

const loadCurrencies = async () => {
  if (currencyCache) return currencyCache;
  if (currencyLoading) return currencyLoadPromise;

  currencyLoading = true;
  currencyLoadPromise = (async () => {
    try {
      const res = await ctx.api.request({
        url: 'nb_cbo_currencies:list',
        method: 'GET',
        params: { pageSize: 100, filter: { is_active: true } },
      });
      const list = res?.data?.data || [];
      currencyCache = {};
      list.forEach(c => {
        currencyCache[c.code] = c.symbol || c.code;
      });
      return currencyCache;
    } catch (e) {
      console.error('Failed to load currencies:', e);
      // Fallback
      return { CNY: '¥', USD: '$', EUR: '€', GBP: '£' };
    } finally {
      currencyLoading = false;
    }
  })();
  return currencyLoadPromise;
};

const formatAmount = (amount, currency = 'CNY', currencyMap = {}) => {
  const symbol = currencyMap[currency] || currency;
  if (amount >= 1000000) {
    return `${symbol}${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `${symbol}${(amount / 1000).toFixed(0)}K`;
  }
  return `${symbol}${amount?.toLocaleString() || 0}`;
};

const OpportunityRow = () => {
  const record = ctx.record || {};
  const name = record.name || 'Untitled Opportunity';
  const stage = record.stage || '';
  const amount = record.amount || record.expected_amount || 0;
  const currency = record.currency || 'CNY';
  const winProb = record.win_probability || record.probability || 0;

  const [currencyMap, setCurrencyMap] = useState(currencyCache || {});
  const [loading, setLoading] = useState(!currencyCache);

  useEffect(() => {
    if (!currencyCache) {
      loadCurrencies().then(map => {
        setCurrencyMap(map);
        setLoading(false);
      });
    }
  }, []);

  const stageConfig = STAGE_CONFIG[stage] || { label: stage, color: 'default' };

  const handleClick = async () => {
    if (!ctx.openView || !record.id) return;

    const viewUid = VIEW_CONFIG.opportunityDetailPopup;
    if (!viewUid || viewUid.startsWith('REPLACE_WITH')) {
      console.warn('Configure VIEW_CONFIG.opportunityDetailPopup');
      return;
    }

    try {
      await ctx.openView(viewUid, {
        mode: 'drawer',
        size: 'large',
        filterByTk: record.id,
      });
    } catch (error) {
      console.error('Failed to open opportunity detail:', error);
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{
        padding: '12px 0',
        borderBottom: `1px solid ${T.colorBorderSecondary || '#f0f0f0'}`,
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong ellipsis style={{ fontSize: 14, display: 'block', marginBottom: 6 }}>
            {name}
          </Text>
          <Space size={8}>
            <Tag color={stageConfig.color}>{stageConfig.label}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>Win {winProb}%</Text>
          </Space>
        </div>
        <Text strong style={{ fontSize: 14, flexShrink: 0 }}>
          {formatAmount(amount, currency, currencyMap)}
        </Text>
      </div>
    </div>
  );
};

ctx.render(<OpportunityRow />);
