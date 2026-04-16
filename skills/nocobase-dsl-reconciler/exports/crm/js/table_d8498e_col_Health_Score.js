/**
 * Health Score Column
 *
 * Displays AI health score with Antd Progress circle.
 * Score ranges:
 * - >= 80: Green (Healthy)
 * - >= 50: Yellow (Warning)
 * - < 50: Red (Critical)
 *
 * Table: nb_crm_customers
 * Field: ai_health_score (integer 0-100)
 */

const { Progress, Space, Tag, Tooltip } = ctx.antd;

// Theme detection
const algorithm = ctx.antdConfig?.theme?.algorithm;
const darkAlgo = ctx.antd.theme.darkAlgorithm;
const isDark = Array.isArray(algorithm)
  ? algorithm.some(fn => fn === darkAlgo)
  : algorithm === darkAlgo;
const T = ctx.themeToken || {};

// i18n
const t = (key, opts) => ctx.t(key, { ns: 'nb_crm', ...opts });

// ==================== Config ====================
function getScoreConfig(score) {
  if (score >= 80) return { status: 'success', label: t('Healthy') };
  if (score >= 50) return { status: 'normal', label: t('Warning'), strokeColor: T.colorWarning || '#faad14' };
  return { status: 'exception', label: t('Critical') };
}

// ==================== Component ====================
function HealthScoreColumn() {
  const record = ctx.record || {};
  const score = typeof record.ai_health_score === 'number' ? record.ai_health_score : 0;
  const config = getScoreConfig(score);

  const tooltipContent = `${config.label} - AI Health Score: ${score}`;

  return (
    <Tooltip title={tooltipContent}>
      <Space size={8}>
        <Progress
          type="circle"
          percent={score}
          width={40}
          status={config.status}
          strokeColor={config.strokeColor}
          format={(percent) => `${percent}`}
        />
        <Tag
          color="cyan"
          style={{
            fontSize: 10,
            padding: '0 4px',
            lineHeight: '16px',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.15))',
            border: 'none',
          }}
        >{t('AI')}</Tag>
      </Space>
    </Tooltip>
  );
}

ctx.render(<HealthScoreColumn />);
