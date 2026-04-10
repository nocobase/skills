/**
 * Opportunity Key Stats Block
 * Table: nb_crm_opportunities
 *
 * Key statistics row with 4 metric cards:
 * - Expected Amount
 * - Expected Close Date
 * - Days in Current Stage
 * - AI Win Probability
 *
 * Data source: ctx.record (popup/drawer detail page)
 */

const { React } = ctx;
const { Row, Col, Typography, Card, Statistic } = ctx.antd;
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

const CURRENCY_SYMBOLS = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

const COLORS = {
  success: T.colorSuccess || '#52c41a',
  warning: T.colorWarning || '#faad14',
  info: T.colorPrimary || '#1677ff',
  danger: T.colorError || '#ff4d4f',
  neutral: T.colorText || '#333',
};

const styles = {
  card: {
    borderRadius: 12,
  },
  cardBody: {
    padding: '12px 16px',
  },
};

// ==================== Helper Functions ====================

function formatAmount(amount, currency = 'CNY') {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  if (!amount) return { value: '-', prefix: symbol };
  if (amount >= 1000000) {
    return { value: (amount / 1000000).toFixed(1), suffix: 'M', prefix: symbol };
  }
  if (amount >= 1000) {
    return { value: (amount / 1000).toFixed(0), suffix: 'K', prefix: symbol };
  }
  return { value: amount.toLocaleString(), prefix: symbol };
}

function getDaysSince(dateStr) {
  if (!dateStr) return 0;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

function getDaysColor(days) {
  if (days <= 7) return COLORS.success;
  if (days <= 14) return COLORS.warning;
  return COLORS.danger;
}

function getProbabilityColor(prob) {
  if (prob >= 70) return COLORS.success;
  if (prob >= 40) return COLORS.warning;
  return COLORS.danger;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-CA'); // YYYY-MM-DD format
}

function getCloseDateColor(dateStr) {
  if (!dateStr) return COLORS.neutral;
  const daysUntil = -getDaysSince(dateStr);
  if (daysUntil < 0) return COLORS.danger; // Overdue
  if (daysUntil <= 7) return COLORS.warning;
  return COLORS.success;
}

// ==================== Main Component ====================

const OpportunityKeyStats = () => {
  const record = ctx.record || ctx.popup?.record || {};

  const amount = record.amount || record.expected_amount || 0;
  const currency = record.currency || 'CNY';
  const closeDate = record.expected_close_date;
  const stageChangedAt = record.stage_changed_at || record.updatedAt;
  const daysInStage = getDaysSince(stageChangedAt);
  const aiWinProb = record.ai_win_probability ?? record.win_probability ?? null;

  const amountFormatted = formatAmount(amount, currency);

  const stats = [
    {
      title: t('Expected Amount'),
      value: amountFormatted.value,
      prefix: amountFormatted.prefix,
      suffix: amountFormatted.suffix,
      color: COLORS.success,
    },
    {
      title: t('Expected Close Date'),
      value: formatDate(closeDate),
      color: getCloseDateColor(closeDate),
    },
    {
      title: t('Days in Current Stage'),
      value: stageChangedAt ? daysInStage : '-',
      suffix: stageChangedAt ? ' days' : '',
      color: stageChangedAt ? getDaysColor(daysInStage) : COLORS.neutral,
    },
    {
      title: t('AI Win Probability'),
      value: aiWinProb !== null ? aiWinProb : '-',
      suffix: aiWinProb !== null ? '%' : '',
      color: aiWinProb !== null ? getProbabilityColor(aiWinProb) : COLORS.neutral,
    },
  ];

  return (
    <Row gutter={[12, 12]}>
      {stats.map((stat, index) => (
        <Col xs={12} sm={6} key={index}>
          <Card size="small" style={styles.card} styles={{ body: styles.cardBody }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>{stat.title}</Text>}
              value={stat.value}
              prefix={stat.prefix}
              suffix={stat.suffix}
              valueStyle={{ fontSize: 22, fontWeight: 600, color: stat.color }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
};

ctx.render(<OpportunityKeyStats />);
