/**
 * AI Risk Analysis
 *
 * AI Risk Analysis Item Block
 *
 * Displays: Win Probability Circle, Risk Factors List, Recommended Actions
 * Uses Antd Progress, Card, Tag, and Typography components
 * NocoBase Table: nb_crm_opportunities
 *
 * Note: AI analysis data may come from record.ai_analysis or be fetched asynchronously via API
 */

const { useState, useEffect } = ctx.React;
const { Row, Col, Typography, Tag, Spin, Progress, Empty, Tooltip, Card, Space, List, Badge, Alert } = ctx.antd;
const { Text, Title } = Typography;
const { RobotOutlined } = ctx.antdIcons || {};

// Theme detection
const algorithm = ctx.antdConfig?.theme?.algorithm;
const darkAlgo = ctx.antd.theme.darkAlgorithm;
const isDark = Array.isArray(algorithm)
  ? algorithm.some(fn => fn === darkAlgo)
  : algorithm === darkAlgo;
const T = ctx.themeToken || {};

// i18n
const t = (key, opts) => ctx.t(key, { ns: 'nb_crm.pipeline', ...opts });

// ==================== Config ====================
const RISK_LEVEL_CONFIG = {
  high: { color: 'error', bgColor: 'rgba(245, 34, 45, 0.1)', label: t('High Risk') },
  medium: { color: 'warning', bgColor: 'rgba(250, 173, 20, 0.1)', label: t('Medium Risk') },
  low: { color: 'success', bgColor: 'rgba(82, 196, 26, 0.1)', label: t('Low Risk') },
};

// ==================== Helper Functions ====================
function getProbabilityColor(probability) {
  if (probability >= 80) return T.colorSuccess || '#52c41a';
  if (probability >= 60) return T.colorWarning || '#faad14';
  if (probability >= 40) return T.colorPrimary || '#1890ff';
  return T.colorTextSecondary || '#8c8c8c';
}

// ==================== Components ====================
const ProbabilityCircle = ({ probability, trend, trendValue }) => {
  const color = getProbabilityColor(probability);

  return (
    <div style={{ textAlign: 'center' }}>
      <Progress
        type="circle"
        percent={probability}
        width={140}
        strokeWidth={10}
        strokeColor={{
          '0%': color,
          '100%': `${color}99`,
        }}
        trailColor={T.colorBorderSecondary || "#e8e8e8"}
        format={(p) => (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 700, color }}>{p}%</div>
            <div style={{ fontSize: 12, color: T.colorTextSecondary || '#8c8c8c' }}>{t('AI Win Probability')}</div>
          </div>
        )}
      />
      {trend && (
        <div style={{ marginTop: 12 }}>
          <Tag color={trend === 'up' ? 'success' : 'error'}>
            {trend === 'up' ? 'Up' : 'Down'} {trendValue || 0}% from last week
          </Tag>
        </div>
      )}
    </div>
  );
};

const RiskItem = ({ risk }) => {
  const levelConfig = RISK_LEVEL_CONFIG[risk.level] || RISK_LEVEL_CONFIG.medium;

  return (
    <Alert
      type={levelConfig.color}
      showIcon
      icon={<span style={{ fontSize: 14 }}>{risk.icon || '!'}</span>}
      message={
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Text style={{ fontSize: 13 }}>{risk.description}</Text>
            <Tag color={levelConfig.color} style={{ fontSize: 10 }}>
              {levelConfig.label}
            </Tag>
          </Space>
          {risk.detail && (
            <Text type="secondary" style={{ fontSize: 12 }}>{risk.detail}</Text>
          )}
        </Space>
      }
      style={{ marginBottom: 8 }}
    />
  );
};

const SuggestionItem = ({ suggestion }) => {
  return (
    <Alert
      type="success"
      showIcon
      message={
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Text style={{ fontSize: 13, color: T.colorSuccess || '#389e0d' }}>{suggestion.action}</Text>
            {suggestion.priority === 'high' && (
              <Tag color="green" style={{ fontSize: 10 }}>{t('Priority')}</Tag>
            )}
          </Space>
          {suggestion.impact && (
            <Text style={{ fontSize: 12, color: T.colorSuccess || '#52c41a' }}>
              Expected win rate improvement: +{suggestion.impact}%
            </Text>
          )}
        </Space>
      }
      style={{ marginBottom: 8 }}
    />
  );
};

// ==================== Main Component ====================
const AIRiskAnalysis = () => {
  const record = ctx.record || {};
  const [loading, setLoading] = useState(false);
  const [aiData, setAiData] = useState(null);

  // Get AI analysis data from record, or use mock data
  useEffect(() => {
    // If AI analysis data exists in record
    if (record.ai_analysis) {
      setAiData(record.ai_analysis);
      return;
    }

    // If no AI data, use mock data based on record
    const mockAiData = {
      probability: record.win_probability || 60,
      trend: 'up',
      trendValue: 8,
      risks: [
        {
          level: 'medium',
          icon: 'clock',
          description: t('Current stage duration exceeds 7 days, above average cycle'),
          type: 'duration',
        },
        {
          level: 'high',
          icon: 'warning',
          description: t('Competitor recently contacted this customer'),
          detail: 'Recommend scheduling a visit soon to understand competitive situation',
          type: 'competitor',
        },
        {
          level: 'medium',
          icon: 'calendar',
          description: t('Customer budget approval may be delayed until next month'),
          type: 'budget',
        },
      ],
      suggestions: [
        {
          type: 'call',
          action: 'Contact Director Wang this afternoon to confirm quote feedback',
          priority: 'high',
          impact: 5,
        },
        {
          type: 'document',
          action: 'Prepare competitive analysis materials highlighting our technical advantages',
          priority: 'medium',
          impact: 8,
        },
        {
          type: 'discount',
          action: 'Consider offering a 15% discount proposal',
          impact: 13,
        },
      ],
      lastUpdated: new Date().toISOString(),
    };

    setAiData(mockAiData);
  }, [record]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin tip="AI analyzing..." />
      </div>
    );
  }

  if (!aiData) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="No AI analysis data available"
        style={{ padding: 40 }}
      />
    );
  }

  return (
    <div>
      <Row gutter={24}>
        {/* Probability Circle */}
        <Col span={6}>
          <ProbabilityCircle
            probability={aiData.probability}
            trend={aiData.trend}
            trendValue={aiData.trendValue}
          />
        </Col>

        {/* Risk Factors */}
        <Col span={9}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Space size={6}>
              <Badge status="error" />
              <Text strong style={{ fontSize: 14 }}>{t('Risk Alerts')}</Text>
            </Space>
            {aiData.risks && aiData.risks.length > 0 ? (
              aiData.risks.map((risk, index) => <RiskItem key={index} risk={risk} />)
            ) : (
              <Text type="secondary">{t('No risk alerts')}</Text>
            )}
          </Space>
        </Col>

        {/* Suggestions */}
        <Col span={9}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Space size={6}>
              <Badge status="success" />
              <Text strong style={{ fontSize: 14 }}>{t('Recommended Actions')}</Text>
            </Space>
            {aiData.suggestions && aiData.suggestions.length > 0 ? (
              aiData.suggestions.map((suggestion, index) => (
                <SuggestionItem key={index} suggestion={suggestion} />
              ))
            ) : (
              <Text type="secondary">{t('No recommendations')}</Text>
            )}
          </Space>
        </Col>
      </Row>

      {/* Last Updated */}
      {aiData.lastUpdated && (
        <div style={{ textAlign: 'right', marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Analysis updated at: {new Date(aiData.lastUpdated).toLocaleString('en-US')}
          </Text>
        </div>
      )}
    </div>
  );
};

ctx.render(<AIRiskAnalysis />);
