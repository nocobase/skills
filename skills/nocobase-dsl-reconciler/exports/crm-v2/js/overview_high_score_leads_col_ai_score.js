/**
 * AI Score Column
 *
 * Displays AI lead score with color-coded progress bar.
 * High (80-100): Green
 * Medium (50-79): Yellow/Orange
 * Low (0-49): Gray/Red
 *
 * Table: nb_crm_leads
 * Field: ai_score (integer 0-100)
 */

const { Tooltip, Progress, Tag, Space, Typography } = ctx.antd;
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
const SCORE_CONFIG = {
  high: {
    min: 80,
    color: T.colorSuccess || '#22c55e',
    strokeColor: T.colorSuccess || '#22c55e',
    label: t('High Intent'),
  },
  medium: {
    min: 50,
    color: T.colorWarning || '#f59e0b',
    strokeColor: T.colorWarning || '#f59e0b',
    label: t('Medium Intent'),
  },
  low: {
    min: 0,
    color: T.colorError || '#ef4444',
    strokeColor: T.colorError || '#ef4444',
    label: t('Low Intent'),
  },
};

function getScoreConfig(score) {
  if (score >= 80) return SCORE_CONFIG.high;
  if (score >= 50) return SCORE_CONFIG.medium;
  return SCORE_CONFIG.low;
}

// ==================== Styles ====================
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 120,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
};

// ==================== Component ====================
const AiScoreColumn = () => {
  const record = ctx.record || {};
  const score = record.ai_score || 0;
  const config = getScoreConfig(score);

  const tooltipContent = `${config.label} - AI Score: ${score}`;

  return (
    <Tooltip title={tooltipContent}>
      <div style={styles.container}>
        {/* Header with score and AI badge */}
        <div style={styles.header}>
          <Text strong style={{ fontSize: 16, color: config.color }}>{score}</Text>
          <Tag color="cyan" style={{ fontSize: 10, marginRight: 0, padding: '0 4px' }}>{t('AI')}</Tag>
        </div>
        {/* Progress bar using Antd Progress */}
        <Progress
          percent={score}
          size="small"
          showInfo={false}
          strokeColor={config.strokeColor}
          trailColor={T.colorBorderSecondary || '#e5e7eb'}
          style={{ marginBottom: 0 }}
        />
      </div>
    </Tooltip>
  );
};

// ==================== Render ====================
ctx.render(<AiScoreColumn />);
