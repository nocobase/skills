/**
 * Contact Row Column - Customer 360
 *
 * Displays a contact row in a business style.
 * Shows: Name, Title, Role Tag
 * Clickable to open contact detail popup.
 *
 * Table: nb_crm_contacts (related to customer)
 * Fields: name, title, role, is_primary
 */

// i18n
const t = (key, opts) => ctx.t(key, { ns: 'nb_crm', ...opts });


const { Space, Tag, Typography } = ctx.antd;
const { Text } = Typography;

// Role tag configuration
const ROLE_TAGS = {
  decision_maker: { label: t('Decision Maker'), color: 'orange' },
  influencer: { label: t('Influencer'), color: 'green' },
  technical_evaluator: { label: t('Technical'), color: 'blue' },
  procurement: { label: t('Procurement'), color: 'cyan' },
  executor: { label: t('Executor'), color: 'default' },
};

// Configure popup UID
const VIEW_CONFIG = {
  contactDetailPopup: 'zxsog8ixwmu',
};

const ContactRow = () => {
  const record = ctx.record || {};
  const name = record.name || 'Unknown';
  const title = record.title || '';
  const role = record.role?.toLowerCase()?.replace(/\s+/g, '_') || '';
  const isPrimary = record.is_primary;

  const roleTag = ROLE_TAGS[role];

  const handleClick = async () => {
    if (!ctx.openView || !record.id) return;

    const viewUid = VIEW_CONFIG.contactDetailPopup;
    if (!viewUid || viewUid.startsWith('REPLACE_WITH')) {
      console.warn('Configure VIEW_CONFIG.contactDetailPopup');
      return;
    }

    try {
      await ctx.openView(viewUid, {
        mode: 'drawer',
        size: 'medium',
        filterByTk: record.id,
      });
    } catch (error) {
      console.error('Failed to open contact detail:', error);
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{
        padding: '8px 0',
        cursor: 'pointer',
      }}
    >
      <Space align="center" style={{ width: '100%' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space size={6}>
            <Text strong style={{ fontSize: 14 }}>{name}</Text>
            {isPrimary && <Tag color="gold">{t('Primary')}</Tag>}
          </Space>
          {title && (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
              {title}
            </Text>
          )}
        </div>
        {roleTag && <Tag color={roleTag.color}>{roleTag.label}</Tag>}
      </Space>
    </div>
  );
};

ctx.render(<ContactRow />);
