/**
 * AI Smart Profile Block
 *
 * Displays AI-generated customer insights including:
 * - AI Tags (smart labels)
 * - Health Score (circular progress)
 * - Churn Risk (circular progress)
 * - AI Suggestions (best contact time, communication strategy)
 *
 * Table: nb_crm_customers
 * Fields: ai_tags, health_score, churn_risk, ai_best_contact_time, ai_communication_style
 */

const { Tag, Progress, Row, Col, Card, Space, Typography, Badge } = ctx.antd;
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

// ==================== Config ====================
const COLORS = {
  green: { stroke: '#10b981', text: '#10b981' },
  yellow: { stroke: '#f59e0b', text: '#f59e0b' },
  red: { stroke: '#ef4444', text: '#ef4444' },
};

// ==================== Components ====================

// Risk Badge Component
const RiskBadge = ({ riskColor, riskLabel }) => {
  const colorMap = {
    green: 'success',
    yellow: 'warning',
    red: 'error',
  };
  return (
    <Tag color={colorMap[riskColor] || 'default'} style={{ borderRadius: 6, fontWeight: 500 }}>
      {riskLabel}
    </Tag>
  );
};

// ==================== Main Component ====================
const AIProfile = () => {
  const record = ctx.record || ctx.popup?.record || {};

  // Parse AI tags
  let tags = record.ai_tags || [];
  if (typeof tags === 'string') {
    try {
      tags = JSON.parse(tags);
    } catch (e) {
      tags = tags.split(',').map(t => t.trim()).filter(Boolean);
    }
  }

  const healthScore = record.health_score || record.ai_health_score || 0;
  const churnRisk = record.churn_risk || record.ai_churn_risk || 0;
  const bestContactTime = record.ai_best_contact_time;
  const commStyle = record.ai_communication_style;

  const hasData = tags.length > 0 || healthScore > 0 || bestContactTime || commStyle;

  if (!hasData) {
    return (
      <Card style={{ position: 'relative' }}>
        <Badge.Ribbon text="🤖 AI Smart Profile" color="purple" style={{ top: -8 }}>
          <div style={{ textAlign: 'center', padding: 30, color: T.colorTextTertiary || '#9ca3af' }}>
            <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }}>🤖</div>
            <div>{t('AI analysis not available yet')}</div>
            <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>{t('More customer data needed')}</Text>
          </div>
        </Badge.Ribbon>
      </Card>
    );
  }

  // Determine risk level
  let riskColor = 'green';
  let riskLabel = 'Low Risk';
  if (churnRisk >= 60) {
    riskColor = 'red';
    riskLabel = 'High Risk';
  } else if (churnRisk >= 30) {
    riskColor = 'yellow';
    riskLabel = 'Medium Risk';
  }

  // Get health color
  let healthColor = 'green';
  if (healthScore < 40) {
    healthColor = 'red';
  } else if (healthScore < 70) {
    healthColor = 'yellow';
  }

  return (
    <Card style={{ position: 'relative' }}>
      <Badge.Ribbon text="🤖 AI Smart Profile" color="purple" style={{ top: -8 }}>
        <div style={{ paddingTop: 8 }}>
          {/* AI Tags */}
          {tags.length > 0 && (
            <Space wrap style={{ marginBottom: 20 }}>
              {tags.map((tag, index) => {
                const tagText = typeof tag === 'object' ? tag.name || tag.label : tag;
                const isHighlight = tagText.toLowerCase().includes('high value') ||
                                   tagText.toLowerCase().includes('vip');
                return (
                  <Tag
                    key={index}
                    color={isHighlight ? 'green' : 'purple'}
                    style={{ borderRadius: 20, padding: '6px 14px', fontSize: 13 }}
                  >
                    #{tagText}
                  </Tag>
                );
              })}
            </Space>
          )}

          {/* Health Score & Churn Risk */}
          <Row gutter={16} style={{ marginBottom: 20 }}>
            <Col span={12}>
              <Card size="small" style={{ background: T.colorBgLayout || '#f9fafb', textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>{t('Health Score')}</Text>
                <Progress
                  type="circle"
                  percent={healthScore}
                  size={80}
                  strokeColor={COLORS[healthColor].stroke}
                  format={(percent) => (
                    <span style={{ color: COLORS[healthColor].text, fontWeight: 700, fontSize: 20 }}>
                      {percent}
                    </span>
                  )}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" style={{ background: T.colorBgLayout || '#f9fafb', textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>{t('Churn Risk')}</Text>
                <Progress
                  type="circle"
                  percent={churnRisk}
                  size={80}
                  strokeColor={COLORS[riskColor].stroke}
                  format={(percent) => (
                    <span style={{ color: COLORS[riskColor].text, fontWeight: 700, fontSize: 20 }}>
                      {percent}
                    </span>
                  )}
                />
                <div style={{ marginTop: 8 }}>
                  <RiskBadge riskColor={riskColor} riskLabel={riskLabel} />
                </div>
              </Card>
            </Col>
          </Row>

          {/* AI Suggestions */}
          {(bestContactTime || commStyle) && (
            <div style={{ borderTop: `1px solid ${T.colorBorderSecondary || '#e5e7eb'}`, paddingTop: 20 }}>
              {bestContactTime && (
                <Card
                  size="small"
                  style={{ marginBottom: 10, borderLeft: '3px solid #6366f1', background: T.colorBgLayout || '#f9fafb' }}
                  bodyStyle={{ padding: 12 }}
                >
                  <Space>
                    <Badge
                      count="⏰"
                      style={{ backgroundColor: 'rgba(99, 102, 241, 0.2)', color: '#6366f1' }}
                    />
                    <div>
                      <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t('Best Contact Time')}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{bestContactTime}</Text>
                    </div>
                  </Space>
                </Card>
              )}
              {commStyle && (
                <Card
                  size="small"
                  style={{ borderLeft: '3px solid #6366f1', background: T.colorBgLayout || '#f9fafb' }}
                  bodyStyle={{ padding: 12 }}
                >
                  <Space>
                    <Badge
                      count="💬"
                      style={{ backgroundColor: 'rgba(99, 102, 241, 0.2)', color: '#6366f1' }}
                    />
                    <div>
                      <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>{t('Communication Strategy')}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{commStyle}</Text>
                    </div>
                  </Space>
                </Card>
              )}
            </div>
          )}
        </div>
      </Badge.Ribbon>
    </Card>
  );
};

ctx.render(<AIProfile />);
