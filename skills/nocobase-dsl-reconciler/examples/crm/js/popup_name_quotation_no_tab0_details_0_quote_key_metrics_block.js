/**
 * Quote Key Metrics Block
 *
 * Displays key metrics cards for quotation detail page using Antd components.
 * Metrics:
 * - Total Amount
 * - Discount Amount
 * - Items Count
 * - Days Until Expiry
 *
 * Table: nb_crm_quotations
 * Fields: total_amount, discount_amount, valid_until, currency
 */

const { Row, Col, Card, Statistic, Typography } = ctx.antd;
const { Text } = Typography;
// Theme detection
const algorithm = ctx.antdConfig?.theme?.algorithm;
const darkAlgo = ctx.antd.theme.darkAlgorithm;
const isDark = Array.isArray(algorithm)
  ? algorithm.some(fn => fn === darkAlgo)
  : algorithm === darkAlgo;
const T = ctx.themeToken || {};

// i18n
const t = (key, opts) => ctx.t(key, { ns: 'nb_crm.quotes', ...opts });

// Currency symbols
const CURRENCY_SYMBOLS = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

const formatAmount = (amount) => {
  return (amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const QuoteMetrics = () => {
  const record = ctx.record || ctx.popup?.record || {};
  const totalAmount = record.total_amount || 0;
  const discountAmount = record.discount_amount || 0;
  const currency = record.currency || 'CNY';
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const validUntil = record.valid_until;

  // Count items from relation or default to 0
  const itemsCount = record.items?.length || record.quote_items?.length || 0;

  // Calculate days until expiry
  let daysLeft = '-';
  let daysColor = T.colorSuccess || '#52c41a';
  if (validUntil) {
    const now = new Date();
    const expiryDate = new Date(validUntil);
    const diffDays = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      daysLeft = 'Expired';
      daysColor = T.colorError || '#ff4d4f';
    } else {
      daysLeft = diffDays;
      daysColor = diffDays <= 7 ? (T.colorWarning || '#faad14') : (T.colorSuccess || '#52c41a');
    }
  }

  const metrics = [
    {
      label: t('Total Amount'),
      value: `${symbol}${formatAmount(totalAmount)}`,
      color: '#722ed1',
    },
    {
      label: t('Discount'),
      value: `${symbol}${formatAmount(discountAmount)}`,
      color: '#eb2f96',
    },
    {
      label: t('Items'),
      value: itemsCount,
      color: T.colorPrimary || '#1890ff',
    },
    {
      label: t('Days Left'),
      value: daysLeft,
      color: daysColor,
    },
  ];

  return (
    <Row gutter={16} style={{ padding: 16 }}>
      {metrics.map((metric, index) => (
        <Col key={index} span={6}>
          <Card
            size="small"
            style={{ textAlign: 'center', backgroundColor: T.colorBgContainer || '#fff', border: `1px solid ${T.colorBorderSecondary || '#f0f0f0'}` }}
            styles={{ body: { padding: 16 } }}
          >
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>{metric.label}</Text>}
              value={metric.value}
              valueStyle={{ color: metric.color, fontSize: 20, fontWeight: 600 }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
};

ctx.render(<QuoteMetrics />);
