/**
 * Price Calculation Formula Tip
 *
 * Displays help tip for quotation price calculation formulas
 */

const { Typography } = ctx.antd;
const { Text } = Typography;
// Theme detection
const algorithm = ctx.antdConfig?.theme?.algorithm;
const darkAlgo = ctx.antd.theme.darkAlgorithm;
const isDark = Array.isArray(algorithm)
  ? algorithm.some(fn => fn === darkAlgo)
  : algorithm === darkAlgo;
const T = ctx.themeToken || {};

// i18n
const t = (key, opts) => ctx.t(key, { ns: 'nb_crm', ...opts });

const TipCard = () => {
  const tipStyle = {
    border: `1px solid ${isDark ? 'rgba(21,128,61,0.4)' : '#86efac'}`,
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 13,
  };

  const titleStyle = {
    fontSize: 14,
    fontWeight: 600,
    color: isDark ? '#4ade80' : '#15803d',
    marginBottom: 10,
    display: 'block',
  };

  const formulaRowStyle = {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 4,
    color: T.colorText || '#475569',
  };

  const fieldStyle = {
    color: T.colorSuccess || '#16a34a',
    fontWeight: 500,
    minWidth: 120,
    display: 'inline-block',
  };

  const operatorStyle = {
    color: T.colorTextSecondary || '#64748b',
    margin: '0 6px',
  };

  const footerStyle = {
    marginTop: 10,
    paddingTop: 8,
    borderTop: `1px dashed ${isDark ? 'rgba(21,128,61,0.4)' : '#86efac'}`,
    fontSize: 12,
    color: isDark ? '#4ade80' : '#15803d',
  };

  return (
    <div style={tipStyle}>
      <Text style={titleStyle}>🔎 {t('Price Calculation Formula')}</Text>

      <div style={formulaRowStyle}>
        <Text style={fieldStyle}>{t('Line Amount')}</Text>
        <Text style={operatorStyle}>=</Text>
        <Text>{t('Quantity × Unit Price')}</Text>
      </div>

      <div style={formulaRowStyle}>
        <Text style={fieldStyle}>{t('Subtotal')}</Text>
        <Text style={operatorStyle}>=</Text>
        <Text>{t('Sum of all Line Amounts')}</Text>
      </div>

      <div style={formulaRowStyle}>
        <Text style={fieldStyle}>{t('Discount Amount')}</Text>
        <Text style={operatorStyle}>=</Text>
        <Text>{t('Subtotal × Discount Rate')}</Text>
      </div>

      <div style={formulaRowStyle}>
        <Text style={fieldStyle}>{t('Tax Amount')}</Text>
        <Text style={operatorStyle}>=</Text>
        <Text>{t('(Subtotal - Discount + S&H) × Tax Rate')}</Text>
      </div>

      <div style={formulaRowStyle}>
        <Text style={fieldStyle}>{t('Total Amount')}</Text>
        <Text style={operatorStyle}>=</Text>
        <Text>{t('Subtotal - Discount + S&H + Tax')}</Text>
      </div>

      <div style={formulaRowStyle}>
        <Text style={fieldStyle}>{t('Total (USD)')}</Text>
        <Text style={operatorStyle}>=</Text>
        <Text>{t('Total Amount × Exchange Rate')}</Text>
      </div>

      <div style={footerStyle}>
        💡 {t('Exchange Rate auto-fills from selected Currency')}
      </div>
    </div>
  );
};

ctx.render(<TipCard />);
