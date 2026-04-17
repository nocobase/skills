/**
 * Lead Profile Header Block
 * Table: nb_crm_leads
 *
 * Simple header displaying lead name, company, and title.
 *
 * Data source: ctx.record (popup/drawer detail page)
 */

const { React } = ctx;
const { Typography, Avatar, Space } = ctx.antd;
const { Title, Text } = Typography;

// ==================== Config ====================

const AVATAR_BG = '#6366f1';

// ==================== Styles ====================

const styles = {
  container: {
    padding: '12px 16px',
  },
  avatar: {
    backgroundColor: AVATAR_BG,
    color: '#fff',
    fontSize: 24,
    fontWeight: 600,
  },
};

// ==================== Helper Functions ====================

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// ==================== Main Component ====================

const LeadProfileHeader = () => {
  const record = ctx.record || ctx.popup?.record || {};

  const name = record.name || 'Unknown Lead';
  const company = record.company || '';
  const title = record.title || '';
  const leadCode = record.lead_code || '';

  let subtitle = '';
  if (title && company) {
    subtitle = `${title} at ${company}`;
  } else if (title) {
    subtitle = title;
  } else if (company) {
    subtitle = company;
  }

  return (
    <div style={styles.container}>
      <Space size={16} align="start">
        <Avatar size={64} style={styles.avatar}>
          {getInitials(name)}
        </Avatar>
        <div>
          <Title level={4} style={{ margin: 0, marginBottom: 4 }}>
            {name}
          </Title>
          {subtitle && (
            <Text type="secondary" style={{ fontSize: 14, display: 'block' }}>
              {subtitle}
            </Text>
          )}
          {leadCode && (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
              {leadCode}
            </Text>
          )}
        </div>
      </Space>
    </div>
  );
};

ctx.render(<LeadProfileHeader />);
