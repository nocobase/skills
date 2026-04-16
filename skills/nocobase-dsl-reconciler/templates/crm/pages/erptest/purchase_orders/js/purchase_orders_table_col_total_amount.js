/**
 * Total Amount Currency Column
 *
 * @type JSColumnModel
 * @collection nb_erp_purchase_orders
 */

const FIELD = 'total_amount';
const SYMBOL = '¥';
const DECIMALS = 2;

const value = Number(ctx.record?.[FIELD]);
const formatted = isNaN(value) ? '-' : SYMBOL + value.toFixed(DECIMALS).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

ctx.render(ctx.React.createElement('span', {
  style: { fontVariantNumeric: 'tabular-nums' },
}, formatted));
