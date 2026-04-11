/**
 * Lead Badges Row Component
 *
 * Displays Rating, Status, and Source badges in a horizontal row.
 * Example: [Hot] [Working] [Website]
 *
 * Table: nb_crm_leads
 * Fields: rating, status, lead_source
 */

// i18n
const t = (key, opts) => ctx.t(key, { ns: 'nb_crm.leads', ...opts });


const { React, antd } = ctx;
const { Space, Tag } = antd;

// ==================== Config ====================
const RATING_CONFIG = {
  hot: { label: t('Hot'), color: 'red' },
  warm: { label: t('Warm'), color: 'orange' },
  cold: { label: t('Cold'), color: 'blue' },
};

const STATUS_CONFIG = {
  new: { label: t('New'), color: 'blue' },
  working: { label: t('Working'), color: 'orange' },
  qualified: { label: t('Qualified'), color: 'green' },
  unqualified: { label: t('Unqualified'), color: 'default' },
  converted: { label: t('Converted'), color: 'purple' },
};

const SOURCE_CONFIG = {
  website: { label: t('Website'), color: 'blue' },
  phone: { label: t('Phone'), color: 'green' },
  referral: { label: t('Referral'), color: 'purple' },
  ads: { label: t('Ads'), color: 'magenta' },
  email: { label: t('Email'), color: 'orange' },
  trade_show: { label: t('Trade Show'), color: 'cyan' },
  social: { label: t('Social'), color: 'geekblue' },
  other: { label: t('Other'), color: 'default' },
};

// ==================== Main Component ====================
const BadgesRow = () => {
  const record = ctx.record || ctx.popup?.record || {};
  const rating = record.rating?.toLowerCase() || '';
  const status = record.status?.toLowerCase() || '';
  const source = record.lead_source?.toLowerCase()?.replace(/\s+/g, '_') || '';

  const ratingConfig = RATING_CONFIG[rating];
  const statusConfig = STATUS_CONFIG[status];
  const sourceConfig = SOURCE_CONFIG[source] || SOURCE_CONFIG.other;

  const badges = [];

  if (ratingConfig) {
    badges.push(
      <Tag key="rating" color={ratingConfig.color}>
        {ratingConfig.label}
      </Tag>
    );
  }

  if (statusConfig) {
    badges.push(
      <Tag key="status" color={statusConfig.color}>
        {statusConfig.label}
      </Tag>
    );
  }

  if (source && sourceConfig) {
    badges.push(
      <Tag key="source" color={sourceConfig.color} bordered={false}>
        {sourceConfig.label}
      </Tag>
    );
  }

  if (badges.length === 0) {
    return null;
  }

  return <Space size={8}>{badges}</Space>;
};

ctx.render(<BadgesRow />);
