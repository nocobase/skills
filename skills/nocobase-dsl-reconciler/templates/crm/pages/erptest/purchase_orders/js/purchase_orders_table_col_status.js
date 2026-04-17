/**
 * PO Status Tag
 *
 * @type JSColumnModel
 * @collection nb_erp_purchase_orders
 */

const FIELD = 'status';
const COLOR_MAP = {
  draft: '#faad14',
  confirmed: '#1677ff',
  received: '#52c41a',
  cancelled: '#ff4d4f',
};

const { Tag } = ctx.antd;
const value = String(ctx.record?.[FIELD] || '');
const color = COLOR_MAP[value.toLowerCase()] || '#d9d9d9';

ctx.render(ctx.React.createElement(Tag, { color }, value || '-'));
