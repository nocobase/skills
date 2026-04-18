/**
 * Lead Key Stats Block
 * Table: nb_crm_leads
 *
 * Key statistics row with 4 metric cards:
 * - AI Score (0-100)
 * - Conversion Probability (%)
 * - Days in Pipeline (calculated from createdAt)
 * - Last Activity (relative date from updatedAt)
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
const t = (key, opts) => ctx.t(key, { ns: 'nb_crm.leads', ...opts });

// ==================== Config ====================

const COLORS = {
  success: T.colorSuccess || '#52c41a',
  warning: T.colorWarning || '#faad14',
  info: T.colorPrimary || '#1677ff',
  danger: T.colorError || '#ff4d4f',
  neutral: T.colorText || '#333',
};

// ==================== Styles ====================

const styles = {
  card: {
    borderRadius: 12,
  },
  cardBody: {
    padding: '12px 16px',
  },
};

// ==================== Helper Functions ====================

function getScoreColor(score) {
  if (score >= 80) return COLORS.success;
  if (score >= 60) return COLORS.info;
  if (score >= 40) return COLORS.warning;
  return COLORS.danger;
}

function getProbabilityColor(prob) {
  if (prob >= 70) return COLORS.success;
  if (prob >= 40) return COLORS.warning;
  return COLORS.danger;
}

function getDaysColor(days) {
  if (days <= 7) return COLORS.success;
  if (days <= 14) return COLORS.warning;
  return COLORS.danger;
}

function getDaysSince(dateStr) {
  if (!dateStr) return 0;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return 'N/A';
  const diffMs = new Date() - new Date(dateStr);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return t('Just now');
  if (diffMins < 60) return t('{{count}}m ago', { count: diffMins });
  if (diffHours < 24) return t('{{count}}h ago', { count: diffHours });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return t('{{count}}d ago', { count: diffDays });
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function getLastActivityColor(dateStr) {
  if (!dateStr) return COLORS.neutral;
  const days = getDaysSince(dateStr);
  if (days <= 2) return COLORS.success;
  if (days <= 7) return COLORS.warning;
  return COLORS.danger;
}

// ==================== Main Component ====================

const LeadKeyStats = () => {
  const record = ctx.record || ctx.popup?.record || {};

  const aiScore = record.ai_score ?? null;
  const convertProb = record.ai_convert_prob ?? null;
  const createdAt = record.createdAt;
  const updatedAt = record.updatedAt;
  const daysInPipeline = getDaysSince(createdAt);

  const stats = [
    {
      title: t('AI Score'),
      value: aiScore !== null ? aiScore : '-',
      color: aiScore !== null ? getScoreColor(aiScore) : COLORS.neutral,
    },
    {
      title: t('Conversion'),
      value: convertProb !== null ? convertProb : '-',
      suffix: convertProb !== null ? '%' : '',
      color: convertProb !== null ? getProbabilityColor(convertProb) : COLORS.neutral,
    },
    {
      title: t('Days in Pipeline'),
      value: createdAt ? daysInPipeline : '-',
      color: createdAt ? getDaysColor(daysInPipeline) : COLORS.neutral,
    },
    {
      title: t('Last Activity'),
      value: formatRelativeDate(updatedAt),
      color: getLastActivityColor(updatedAt),
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
              suffix={stat.suffix}
              valueStyle={{ fontSize: 22, fontWeight: 600, color: stat.color }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
};

ctx.render(<LeadKeyStats />);
