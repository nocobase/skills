/**
 * Lead Badges Row Component
 *
 * Displays Rating, Status, and Source badges in a horizontal row.
 * Example: [Hot] [Working] [Website]
 *
 * Table: nb_crm_leads
 * Fields: rating, status, lead_source
 */

const { React, antd } = ctx;
const { Space, Tag } = antd;

// ==================== Config ====================
const RATING_CONFIG = {
  hot: { label: 'Hot', color: 'red' },
  warm: { label: 'Warm', color: 'orange' },
  cold: { label: 'Cold', color: 'blue' },
};

const STATUS_CONFIG = {
  new: { label: 'New', color: 'blue' },
  working: { label: 'Working', color: 'orange' },
  qualified: { label: 'Qualified', color: 'green' },
  unqualified: { label: 'Unqualified', color: 'default' },
  converted: { label: 'Converted', color: 'purple' },
};

const SOURCE_CONFIG = {
  website: { label: 'Website', color: 'blue' },
  phone: { label: 'Phone', color: 'green' },
  referral: { label: 'Referral', color: 'purple' },
  ads: { label: 'Ads', color: 'magenta' },
  email: { label: 'Email', color: 'orange' },
  trade_show: { label: 'Trade Show', color: 'cyan' },
  social: { label: 'Social', color: 'geekblue' },
  other: { label: 'Other', color: 'default' },
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
