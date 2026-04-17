/**
 * Lead Contact Column (Multi-field)
 *
 * Displays lead contact information with email and phone.
 * - Primary: Email (with icon)
 *   - If converted: clickable -> opens converted contact detail
 *   - If not converted: plain text
 * - Secondary: Phone/Mobile (with icon)
 * No masking - shows full contact details.
 *
 * Table: nb_crm_leads
 * Fields: email, phone, mobile_phone, converted_contact_id
 */

const { Tooltip, Typography, Space } = ctx.antd;
const { Text, Link } = Typography;
const { MailOutlined, PhoneOutlined } = ctx.antdIcons || {};

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
// Detail popup view UIDs
const CONTACT_DETAIL_VIEW_UID = 'qdh3tq95i8n';  // Contact detail view (converted)
const LEAD_DETAIL_VIEW_UID = 'c0xibd5v49r';     // Lead detail view (not converted)

// ==================== Styles ====================
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 150,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    opacity: 0.7,
    flexShrink: 0,
  },
  placeholder: {
    fontSize: 13,
    color: T.colorTextTertiary || '#9ca3af',
    fontStyle: 'italic',
  },
};

// ==================== SVG Icons (fallback if antdIcons not available) ====================
const EmailIcon = () => (
  <svg
    width={12}
    height={12}
    viewBox="0 0 24 24"
    fill="none"
    stroke={T.colorTextSecondary || '#6b7280'}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const PhoneIcon = () => (
  <svg
    width={12}
    height={12}
    viewBox="0 0 24 24"
    fill="none"
    stroke={T.colorTextSecondary || '#6b7280'}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

// ==================== Component ====================
const LeadContactColumn = () => {
  const record = ctx.record || {};
  const email = record.email || '';
  // Prefer mobile_phone over phone
  const phoneNumber = record.mobile_phone || record.phone || '';

  // Check if converted to contact
  const convertedContactId = record.converted_contact_id;
  const hasConvertedContact = !!convertedContactId;

  // Click to open detail view
  // - If converted: open contact detail with contact ID
  // - If not converted: open lead detail with lead ID
  const handleClick = async (e) => {
    e.stopPropagation();
    if (!ctx.openView) return;

    try {
      if (hasConvertedContact && convertedContactId) {
        // Open contact detail
        await ctx.openView(CONTACT_DETAIL_VIEW_UID, {
          mode: 'drawer',
          size: 'large',
          collectionName: 'nb_crm_contacts',
          dataSourceKey: 'main',
          filterByTk: convertedContactId,
        });
      } else if (record.id) {
        // Open lead detail
        await ctx.openView(LEAD_DETAIL_VIEW_UID, {
          mode: 'drawer',
          size: 'large',
          collectionName: 'nb_crm_leads',
          dataSourceKey: 'main',
          filterByTk: record.id,
        });
      }
    } catch (err) {
      console.error('Failed to open detail:', err);
    }
  };

  if (!email && !phoneNumber) {
    return <span style={styles.placeholder}>—</span>;
  }

  const tooltipLines = [
    email && t('Email: {{email}}', { email: email }),
    record.mobile_phone && t('Mobile: {{mobile_phone}}', { mobile_phone: record.mobile_phone }),
    record.phone && t('Phone: {{phone}}', { phone: record.phone }),
    hasConvertedContact ? 'Click to view Contact' : 'Click to view Lead',
  ];
  const tooltipContent = tooltipLines.filter(Boolean).join('\n');

  return (
    <Tooltip title={tooltipContent}>
      <div style={styles.container}>
        {email && (
          <div style={styles.row}>
            <span style={styles.icon}>
              {MailOutlined ? <MailOutlined style={{ fontSize: 12, color: T.colorTextSecondary || '#6b7280' }} /> : <EmailIcon />}
            </span>
            <Link
              onClick={handleClick}
              style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
            >
              {email}
            </Link>
          </div>
        )}
        {phoneNumber && (
          <div style={styles.row}>
            <span style={styles.icon}>
              {PhoneOutlined ? <PhoneOutlined style={{ fontSize: 12, color: T.colorTextSecondary || '#6b7280' }} /> : <PhoneIcon />}
            </span>
            <Text
              type="secondary"
              style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {phoneNumber}
            </Text>
          </div>
        )}
      </div>
    </Tooltip>
  );
};

// ==================== Render ====================
ctx.render(<LeadContactColumn />);
