/**
 * item_profile - Customer Profile Header
 *
 * Simplified profile display:
 * - Customer logo (first letter avatar with level color)
 * - Customer name
 * - Industry + Scale info line
 *
 * Data source: ctx.record (popup/drawer detail page)
 * Table: nb_crm_customers
 *
 * Database fields used:
 * - name: customer name
 * - level: normal (default) | important | vip
 * - industry: Technology | Finance | Retail | Hospitality | Entertainment | Media | Logistics
 * - scale: small | medium | large | enterprise | giant
 */

const { Typography, Space, Avatar } = ctx.antd;
const { Text, Title } = Typography;

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

// Level colors for avatar background
const LEVEL_CONFIG = {
  normal: { color: T.colorTextSecondary || '#6b7280', bg: T.colorTextSecondary || '#6b7280', label: t('Normal') },
  important: { color: '#f59e0b', bg: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)', label: t('Important') },
  vip: { color: '#eab308', bg: 'linear-gradient(135deg, #d97706 0%, #fbbf24 100%)', label: t('VIP') },
};

// Industry display config
const INDUSTRY_CONFIG = {
  Technology: { label: t('Technology'), icon: '💻' },
  Finance: { label: t('Finance'), icon: '🏦' },
  Retail: { label: t('Retail'), icon: '🛒' },
  Hospitality: { label: t('Hospitality'), icon: '🏨' },
  Entertainment: { label: t('Entertainment'), icon: '🎬' },
  Media: { label: t('Media'), icon: '📺' },
  Logistics: { label: t('Logistics'), icon: '🚚' },
  Manufacturing: { label: t('Manufacturing'), icon: '🏭' },
  Healthcare: { label: t('Healthcare'), icon: '🏥' },
  Education: { label: t('Education'), icon: '🎓' },
  Other: { label: t('Other'), icon: '📁' },
};

// Scale display config
const SCALE_CONFIG = {
  small: { label: t('< 50 Employees') },
  medium: { label: '50-200 Employees' },
  large: { label: '200-500 Employees' },
  enterprise: { label: '500-1000 Employees' },
  giant: { label: '1000+ Employees' },
};

// ==================== Components ====================

// Customer Logo - First letter avatar with level-based color
const CustomerLogo = ({ name, level }) => {
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const levelConfig = LEVEL_CONFIG[level] || LEVEL_CONFIG.normal;

  return (
    <Avatar
      size={64}
      style={{
        background: levelConfig.bg,
        fontSize: 26,
        fontWeight: 'bold',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
        borderRadius: 16,
      }}
    >
      {initial}
    </Avatar>
  );
};

// ==================== Main Component ====================
const CustomerProfile = () => {
  const record = ctx.record || {};

  // Return null if no data
  if (!record.id) {
    return null;
  }

  const { name, level, industry, scale } = record;

  const industryConfig = INDUSTRY_CONFIG[industry] || INDUSTRY_CONFIG.Other;
  const scaleConfig = SCALE_CONFIG[scale] || {};

  // Build info line: Industry + Scale
  const infoItems = [];
  if (industry) {
    infoItems.push(`${industryConfig.icon} ${industryConfig.label}`);
  }
  if (scale && scaleConfig.label) {
    infoItems.push(`👥 ${scaleConfig.label}`);
  }

  return (
    <Space size={16} align="center">
      {/* Customer Logo */}
      <CustomerLogo name={name} level={level} />

      {/* Customer Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Customer Name */}
        <Title
          level={4}
          ellipsis
          style={{
            margin: 0,
            marginBottom: 4,
          }}
        >
          {name || 'Unknown Customer'}
        </Title>

        {/* Industry + Scale Info Line */}
        {infoItems.length > 0 && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            {infoItems.join('  |  ')}
          </Text>
        )}
      </div>
    </Space>
  );
};

ctx.render(<CustomerProfile />);
