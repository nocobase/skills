/**
 * @deprecated Use col_ai_score.js instead
 */

/**
 * AI Score Column
 *
 * Displays AI lead quality score with progress bar visualization.
 * Color coding based on score:
 * - Green (80+): High quality
 * - Yellow (50-79): Medium quality
 * - Red (<50): Low quality
 *
 * Field: ai_score (number 0-100)
 */

const { React, ReactDOM, antd } = ctx;
const { Tooltip } = antd;
const h = React.createElement;

// Theme detection
const algorithm = ctx.antdConfig?.theme?.algorithm;
const darkAlgo = ctx.antd.theme.darkAlgorithm;
const isDark = Array.isArray(algorithm)
  ? algorithm.some(fn => fn === darkAlgo)
  : algorithm === darkAlgo;
const T = ctx.themeToken || {};

// ==================== Configuration ====================
const SCORE_CONFIG = {
  high: { min: 80, color: T.colorSuccess || '#22c55e', gradient: 'linear-gradient(90deg, #22c55e, #10b981)', label: 'High' },
  medium: { min: 50, color: T.colorWarning || '#f59e0b', gradient: 'linear-gradient(90deg, #f59e0b, #eab308)', label: 'Medium' },
  low: { min: 0, color: T.colorError || '#ef4444', gradient: 'linear-gradient(90deg, #ef4444, #f97316)', label: 'Low' },
};

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
  scoreValue: {
    fontWeight: 700,
    fontSize: 16,
  },
  aiBadge: {
    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2))',
    color: T.colorSuccess || '#10b981',
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  progressBar: {
    height: 6,
    background: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.5s ease',
  },
  label: {
    fontSize: 11,
    marginTop: 2,
  },
};

// ==================== Helper Functions ====================
function getScoreConfig(score) {
  const numScore = Number(score) || 0;
  if (numScore >= SCORE_CONFIG.high.min) return SCORE_CONFIG.high;
  if (numScore >= SCORE_CONFIG.medium.min) return SCORE_CONFIG.medium;
  return SCORE_CONFIG.low;
}

// ==================== Component ====================
function AiScoreColumn() {
  const record = ctx.record || {};
  const score = record.ai_score;
  const numScore = Number(score) || 0;
  const config = getScoreConfig(numScore);

  // AI icon SVG
  const aiIcon = h('svg', {
    width: 10,
    height: 10,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
  },
    h('path', { d: 'M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1' })
  );

  return h('div', { style: styles.container },
    // Header row with score and AI badge
    h('div', { style: styles.header },
      h('span', { style: { ...styles.scoreValue, color: config.color } }, numScore),
      h('span', { style: styles.aiBadge }, aiIcon, 'AI')
    ),
    // Progress bar
    h('div', { style: styles.progressBar },
      h('div', {
        style: {
          ...styles.progressFill,
          width: `${numScore}%`,
          background: config.gradient,
        },
      })
    ),
    // Label
    h('span', { style: { ...styles.label, color: config.color } }, config.label)
  );
}

// ==================== Render ====================
const root = ReactDOM.createRoot(ctx.element);
root.render(h(AiScoreColumn));

// Handle refresh
if (ctx.resource) {
  ctx.resource.on?.('refresh', () => {
    root.render(h(AiScoreColumn));
  });
}
