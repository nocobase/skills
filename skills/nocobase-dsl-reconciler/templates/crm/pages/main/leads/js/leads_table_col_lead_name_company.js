/**
 * Lead Info Column (Multi-field)
 *
 * Displays lead name with company in a combined cell.
 * - Primary: Lead name (bold)
 *   - If converted: clickable -> opens converted contact/customer detail
 *   - If not converted: plain text
 * - Secondary: Company name (gray, smaller)
 *
 * Table: nb_crm_leads
 * Fields: name, company, converted_contact_id, converted_customer_id
 */

const { Tooltip, Typography, Space } = ctx.antd;
const { Text, Link } = Typography;

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
const CONTACT_DETAIL_VIEW_UID = 'zxsog8ixwmu';  // Contact detail view
const CUSTOMER_DETAIL_VIEW_UID = 'wsb6b480gtj';  // Customer detail view

// ==================== Styles ====================
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 120,
  },
  placeholder: {
    fontSize: 13,
    color: T.colorTextTertiary || '#9ca3af',
    fontStyle: 'italic',
  },
};

// ==================== Component ====================
const LeadInfoColumn = () => {
  const record = ctx.record || {};
  const name = record.name || '';
  const company = record.company || '';

  // Check if converted
  const convertedContactId = record.converted_contact_id;
  const convertedCustomerId = record.converted_customer_id;
  const hasConvertedContact = !!convertedContactId;
  const hasConvertedCustomer = !!convertedCustomerId;

  // Click name to open contact detail (only clickable when converted to contact)
  const handleNameClick = async (e) => {
    e.stopPropagation();
    if (!hasConvertedContact || !convertedContactId) return;

    if (ctx.openView && CONTACT_DETAIL_VIEW_UID && CONTACT_DETAIL_VIEW_UID !== 'xxxxxxxxxx') {
      try {
        await ctx.openView(CONTACT_DETAIL_VIEW_UID, {
          mode: 'drawer',
          size: 'large',
          collectionName: 'nb_crm_contacts',
          dataSourceKey: 'main',
          filterByTk: convertedContactId,
        });
      } catch (err) {
        console.error('Failed to open contact detail:', err);
      }
    }
  };

  // Click company to open customer detail (only clickable when converted to customer)
  const handleCompanyClick = async (e) => {
    e.stopPropagation();
    if (!hasConvertedCustomer || !convertedCustomerId) return;

    if (ctx.openView && CUSTOMER_DETAIL_VIEW_UID && CUSTOMER_DETAIL_VIEW_UID !== 'xxxxxxxxxx') {
      try {
        await ctx.openView(CUSTOMER_DETAIL_VIEW_UID, {
          mode: 'drawer',
          size: 'large',
          collectionName: 'nb_crm_customers',
          dataSourceKey: 'main',
          filterByTk: convertedCustomerId,
        });
      } catch (err) {
        console.error('Failed to open customer detail:', err);
      }
    }
  };

  if (!name && !company) {
    return <span style={styles.placeholder}>—</span>;
  }

  const tooltipLines = [
    name && t('Name: {{name}}', { name: name }),
    company && t('Company: {{company}}', { company: company }),
  ];
  if (hasConvertedContact) {
    tooltipLines.push('Converted to Contact (click to view)');
  }
  if (hasConvertedCustomer) {
    tooltipLines.push('Converted to Customer (click to view)');
  }
  const tooltipContent = tooltipLines.filter(Boolean).join('\n');

  return (
    <Tooltip title={tooltipContent}>
      <div style={styles.container}>
        {name && (hasConvertedContact ? (
          <Link
            strong
            onClick={handleNameClick}
            style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {name}
          </Link>
        ) : (
          <Text
            strong
            style={{ fontSize: 14, color: T.colorText || '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {name}
          </Text>
        ))}
        {company && (hasConvertedCustomer ? (
          <Link
            onClick={handleCompanyClick}
            style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {company}
          </Link>
        ) : (
          <Text
            type="secondary"
            style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {company}
          </Text>
        ))}
      </div>
    </Tooltip>
  );
};

// ==================== Render ====================
ctx.render(<LeadInfoColumn />);
