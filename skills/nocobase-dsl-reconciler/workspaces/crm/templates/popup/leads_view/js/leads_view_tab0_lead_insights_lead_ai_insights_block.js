/**
 * Lead AI Insights Block
 */

const { React } = ctx;
const { Typography, Tag, Row, Col, Space, Alert, Progress } = ctx.antd;
const { Text } = Typography;

// Theme detection
const algorithm = ctx.antdConfig?.theme?.algorithm;
const darkAlgo = ctx.antd.theme.darkAlgorithm;
const isDark = Array.isArray(algorithm)
  ? algorithm.some(fn => fn === darkAlgo)
  : algorithm === darkAlgo;
const T = ctx.themeToken || {};

// i18n
const t = (key, opts) => ctx.t(key, { ns: 'nb_crm.leads', ...opts });

// ==================== Config ====================

const TAG_COLORS = ['blue', 'purple', 'cyan', 'green', 'orange', 'magenta'];

// ==================== Styles ====================

const styles = {
  actionItem: {
    padding: '10px 12px',
    background: isDark ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.08)',
    borderRadius: 8,
    marginBottom: 8,
  },
};

// ==================== Helper Functions ====================

function getProbabilityColor(prob) {
  if (prob >= 70) return T.colorSuccess || '#52c41a';
  if (prob >= 40) return T.colorWarning || '#faad14';
  return T.colorError || '#ff4d4f';
}

function parseAiTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string') {
    try {
      return JSON.parse(tags);
    } catch {
      return tags.split(',').map((t) => t.trim()).filter(Boolean);
    }
  }
  return [];
}

// ==================== Components ====================

const ActionItem = ({ text }) => (
  <div style={styles.actionItem}>
    <Text style={{ fontSize: 13, color: T.colorSuccess || '#15803d' }}>{text}</Text>
  </div>
);

// ==================== Main Component ====================

const LeadAIInsights = () => {
  const record = ctx.record || ctx.popup?.record || {};

  const aiScore = record.ai_score;
  const aiConvertProb = record.ai_convert_prob;
  const aiBestContactTime = record.ai_best_contact_time;
  const aiTags = parseAiTags(record.ai_tags);

  const hasAiData = aiScore || aiConvertProb || (aiTags && aiTags.length > 0);

  if (!hasAiData) {
    return null;
  }

  // Build suggestions
  const suggestions = [];
  if (aiConvertProb && aiConvertProb >= 60) {
    suggestions.push('Schedule a discovery call within 24 hours');
  }
  if (aiBestContactTime) {
    suggestions.push(t('Best time to contact: {{aiBestContactTime}}', { aiBestContactTime: aiBestContactTime }));
  }
  if (aiScore && aiScore >= 70) {
    suggestions.push('Share case study from similar industry');
  }
  if (suggestions.length === 0) {
    suggestions.push('Send introductory email to establish contact');
  }

  return (
    <Row gutter={[16, 16]}>
        {/* Conversion Probability */}
        {aiConvertProb !== undefined && aiConvertProb !== null && (
          <Col xs={24} sm={8}>
            <div style={{ textAlign: 'center' }}>
              <Progress
                type="circle"
                percent={aiConvertProb}
                size={100}
                strokeColor={getProbabilityColor(aiConvertProb)}
                format={(percent) => (
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{percent}%</div>
                    <div style={{ fontSize: 11, color: T.colorTextSecondary || '#666' }}>{t('Conversion')}</div>
                  </div>
                )}
              />
              {aiScore && (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                  AI Score: {aiScore}/100
                </Text>
              )}
            </div>
          </Col>
        )}

        {/* Next Best Actions */}
        <Col xs={24} sm={aiConvertProb !== undefined ? 8 : 12}>
          <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>{t('Next Best Actions')}</Text>
          {suggestions.map((text, index) => (
            <ActionItem key={index} text={text} />
          ))}
        </Col>

        {/* AI Tags */}
        <Col xs={24} sm={aiConvertProb !== undefined ? 8 : 12}>
          <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>{t('AI Tags')}</Text>
          {aiTags.length > 0 ? (
            <Space size={[6, 6]} wrap>
              {aiTags.map((tag, index) => (
                <Tag key={index} color={TAG_COLORS[index % TAG_COLORS.length]}>
                  {tag}
                </Tag>
              ))}
            </Space>
          ) : (
            <Text type="secondary" style={{ fontSize: 13 }}>{t('No tags')}</Text>
          )}

          {aiConvertProb && aiConvertProb < 40 && (
            <Alert
              type="warning"
              showIcon
              message={t('Low conversion probability')}
              style={{ marginTop: 12 }}
            />
          )}
        </Col>
    </Row>
  );
};

ctx.render(<LeadAIInsights />);
