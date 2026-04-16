/**
 * Created Ago Column - Leads Module
 * Shows "Created X days ago" with relative time
 *
 * Table: nb_crm_leads
 * Field: createdAt
 */

const record = ctx.record;
const createdDate = record?.createdAt;

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
  const diffDays = Math.floor(diffMs / 86400000);

  let text, color;

  if (diffDays === 0) {
    text = t('today');
    color = T.colorSuccess || '#52c41a';
  } else if (diffDays === 1) {
    text = t('yesterday');
    color = T.colorSuccess || '#52c41a';
  } else if (diffDays < 7) {
    text = t('{{count}}d ago', { count: diffDays });
    color = T.colorPrimary || '#1890ff';
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    text = t('{{count}}w ago', { count: weeks });
    color = T.colorWarning || '#faad14';
  } else {
    const months = Math.floor(diffDays / 30);
    text = t('{{count}}mo ago', { count: months });
    color = T.colorError || '#ff4d4f';
  }

  return { text, color };
};

const { text, color } = formatRelativeDate(createdDate);

ctx.render(
  <span style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>
    <span style={{ color: color, marginRight: '4px' }}>●</span>
    <span style={{ color: T.colorTextSecondary || '#595959' }}>Created {text}</span>
  </span>
);
