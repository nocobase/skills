/**
 * Line Item Auto-Fill Tip
 *
 * Displays help tip for quotation line item auto-fill behavior
 */

const { Typography, Space } = ctx.antd;
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
    border: `1px solid ${isDark ? 'rgba(3,105,161,0.4)' : '#bae6fd'}`,
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 13,
  };

  const titleStyle = {
    fontSize: 14,
    fontWeight: 600,
    color: isDark ? '#38bdf8' : '#0369a1',
    marginBottom: 8,
    display: 'block',
  };

  const sectionStyle = {
    color: T.colorText || '#475569',
    marginBottom: 6,
  };

  const fieldStyle = {
    color: T.colorPrimary || '#0284c7',
    fontWeight: 500,
  };

  const sourceStyle = {
    color: T.colorTextSecondary || '#64748b',
    fontSize: 12,
  };

  const footerStyle = {
    marginTop: 10,
    paddingTop: 8,
    borderTop: `1px dashed ${isDark ? 'rgba(3,105,161,0.4)' : '#bae6fd'}`,
    fontSize: 12,
    color: isDark ? '#38bdf8' : '#0369a1',
  };

  return (
    <div style={tipStyle}>
      <Text style={titleStyle}>📦 {t('Line Item Auto-Fill')}</Text>

      <div style={sectionStyle}>
        <Text>{t('When you select a')} <Text style={fieldStyle}>{t('Product')}</Text>:</Text>
        <div style={{ marginLeft: 12, marginTop: 4 }}>
          <div><Text style={fieldStyle}>{t('Specification')}</Text> <Text style={sourceStyle}>{t('← from Product')}</Text></div>
          <div><Text style={fieldStyle}>{t('Unit')}</Text> <Text style={sourceStyle}>{t('← from Product')}</Text></div>
          <div><Text style={fieldStyle}>{t('List Price')}</Text> <Text style={sourceStyle}>{t('← from Product')}</Text></div>
        </div>
      </div>

      <div style={sectionStyle}>
        <Text>{t('When')} <Text style={fieldStyle}>{t('Quantity')}</Text> {t('changes, Price Tier auto-matches:')}</Text>
        <div style={{ marginLeft: 12, marginTop: 4 }}>
          <div><Text style={fieldStyle}>{t('Unit Price')}</Text> <Text style={sourceStyle}>{t('← Tier discounted price')}</Text></div>
          <div><Text style={fieldStyle}>{t('Discount Rate')}</Text> <Text style={sourceStyle}>{t('← from Tier')}</Text></div>
          <div><Text style={fieldStyle}>{t('Description')}</Text> <Text style={sourceStyle}>{t('← Tier snapshot')}</Text></div>
        </div>
      </div>

      <div style={footerStyle}>
        💡 {t('Price Tier matches by Product + Currency + Quantity Range')}
      </div>
    </div>
  );
};

ctx.render(<TipCard />);
