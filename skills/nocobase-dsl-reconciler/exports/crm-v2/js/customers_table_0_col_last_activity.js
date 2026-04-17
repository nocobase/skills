/**
 * Last Activity Column - Leads Module
 * Shows relative time since last activity with color indicator
 *
 * Table: nb_crm_leads
 * Field: last_activity_at or updatedAt
 */

const record = ctx.record;
const activityDate = record?.last_activity_at || record?.updatedAt;

// Theme detection
const algorithm = ctx.antdConfig?.theme?.algorithm;
const darkAlgo = ctx.antd.theme.darkAlgorithm;
const isDark = Array.isArray(algorithm)
  ? algorithm.some(fn => fn === darkAlgo)
  : algorithm === darkAlgo;
const T = ctx.themeToken || {};

// i18n
const t = (key, opts) => ctx.t(key, { ns: 'nb_crm.leads', ...opts });

// Format relative date helper
const formatRelativeDate = (dateStr) => {
  if (!dateStr) return { text: '-', color: T.colorTextTertiary || '#bfbfbf' };

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  let text, color;

  if (diffMins < 60) {
    text = diffMins <= 1 ? 'Just now' : t('{{count}}m ago', { count: diffMins });
    color = T.colorSuccess || '#52c41a'; // Green - very recent
  } else if (diffHours < 24) {
    text = t('{{count}}h ago', { count: diffHours });
    color = T.colorSuccess || '#52c41a'; // Green - today
  } else if (diffDays === 1) {
    text = 'Yesterday';
    color = T.colorPrimary || '#1890ff'; // Blue - yesterday
  } else if (diffDays < 7) {
    text = t('{{count}}d ago', { count: diffDays });
    color = T.colorPrimary || '#1890ff'; // Blue - this week
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    text = t('{{count}}w ago', { count: weeks });
    color = T.colorWarning || '#faad14'; // Orange - weeks ago
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    text = t('{{count}}mo ago', { count: months });
    color = T.colorError || '#ff4d4f'; // Red - months ago
  } else {
    const years = Math.floor(diffDays / 365);
    text = t('{{years}}y ago', { years: years });
    color = T.colorError || '#ff4d4f'; // Red - years ago
  }

  return { text, color };
};

const { text, color } = formatRelativeDate(activityDate);

ctx.render(
  <span style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>
    <span style={{ color: color, marginRight: '4px' }}>●</span>
    <span style={{ color: T.colorTextSecondary || '#595959' }}>{text}</span>
  </span>
);
