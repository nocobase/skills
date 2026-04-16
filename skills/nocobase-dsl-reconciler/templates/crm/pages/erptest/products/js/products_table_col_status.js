/**
 * Product Status Tag
 *
 * @type JSColumnModel
 * @collection nb_erp_products
 */

const FIELD = 'status';
const COLOR_MAP = {
  active: '#52c41a',
  inactive: '#d9d9d9',
  discontinued: '#ff4d4f',
};

const { Tag } = ctx.antd;
const value = String(ctx.record?.[FIELD] || '');
const color = COLOR_MAP[value.toLowerCase()] || '#d9d9d9';

ctx.render(ctx.React.createElement(Tag, { color }, value || '-'));
