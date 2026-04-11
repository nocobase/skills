/**
 * Customer Statistics Block
 *
 * Displays key customer metrics: Total Revenue, Active Opportunities, Interactions This Month
 * Table: nb_crm_customers (detail context)
 */

const { useState, useEffect } = ctx.React;
const { Row, Col, Statistic, Card, Spin, Typography } = ctx.antd;
const { Text } = Typography;

const T = ctx.themeToken || {};
const t = (key, opts) => ctx.t(key, { ns: 'nb_crm', ...opts });

// ==================== Helpers ====================
const CURRENCY_SYMBOLS = { CNY: '¥', USD: '$', EUR: '€', GBP: '£' };

const formatCurrency = (amount, currency = 'CNY') => {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  if (amount >= 1000000) return { value: (amount / 1000000).toFixed(1), suffix: 'M', prefix: symbol };
  if (amount >= 1000) return { value: (amount / 1000).toFixed(0), suffix: 'K', prefix: symbol };
  return { value: amount.toLocaleString(), prefix: symbol };
};

const getMonthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

// ==================== Main Component ====================
const CustomerStats = () => {
  const record = ctx.record || ctx.popup?.record || {};
  const customerId = record.id;
  const currency = record.preferred_currency || 'CNY';

  const [stats, setStats] = useState({ totalRevenue: 0, activeOpps: 0, monthlyActivities: 0, loading: true });

  useEffect(() => {
    if (!customerId || !ctx.api) {
      setStats(prev => ({ ...prev, loading: false }));
      return;
    }

    const fetchStats = async () => {
      try {
        // Revenue from won opportunities; counts via meta.count (pageSize:1)
        const [wonRes, oppsRes, activitiesRes] = await Promise.all([
          ctx.api.request({
            url: 'nb_crm_opportunities:list',
            params: {
              filter: JSON.stringify({ customer_id: customerId, stage: 'won' }),
              fields: ['amount'],
              pageSize: 5000,
            },
          }),
          ctx.api.request({
            url: 'nb_crm_opportunities:list',
            params: {
              filter: JSON.stringify({ customer_id: customerId, stage: { $notIn: ['won', 'lost'] } }),
              pageSize: 1,
            },
          }),
          ctx.api.request({
            url: 'nb_crm_activities:list',
            params: {
              filter: JSON.stringify({ customer_id: customerId, activity_date: { $gte: getMonthStart() } }),
              pageSize: 1,
            },
          }),
        ]);

        const wonOpps = wonRes?.data?.data || [];
        const totalRevenue = wonOpps.reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0);

        setStats({
          totalRevenue,
          activeOpps: oppsRes?.data?.meta?.count || 0,
          monthlyActivities: activitiesRes?.data?.meta?.count || 0,
          loading: false,
        });
      } catch (error) {
        console.error('Failed to fetch customer stats:', error);
        setStats(prev => ({ ...prev, loading: false }));
      }
    };

    fetchStats();
  }, [customerId]);

  if (stats.loading) {
    return <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>;
  }

  const rev = formatCurrency(stats.totalRevenue, currency);

  const items = [
    { title: t('Total Revenue'), value: rev.value, prefix: rev.prefix, suffix: rev.suffix, color: '#10b981' },
    { title: t('Active Opportunities'), value: stats.activeOpps, color: '#f59e0b' },
    { title: t('Interactions This Month'), value: stats.monthlyActivities, color: '#6366f1' },
  ];

  return (
    <Row gutter={[12, 12]}>
      {items.map((item, i) => (
        <Col xs={24} sm={8} key={i}>
          <Card size="small" style={{ borderRadius: 12 }} styles={{ body: { padding: '12px 16px' } }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>{item.title}</Text>}
              value={item.value}
              prefix={item.prefix}
              suffix={item.suffix}
              valueStyle={{ fontSize: 22, fontWeight: 600, color: item.color }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
};

ctx.render(<CustomerStats />);
