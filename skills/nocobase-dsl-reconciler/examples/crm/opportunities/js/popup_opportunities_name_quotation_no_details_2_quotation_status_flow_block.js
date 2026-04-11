/**
 * Quotation Status Flow Block
 * Table: nb_crm_quotations
 *
 * Displays quotation status with clickable steps to switch status.
 * Status flow: draft → pending_approval → approved → sent → accepted
 * Terminal states: rejected, expired
 *
 * Data source: ctx.record (popup/drawer detail page)
 */

const { React } = ctx;
const { useState, useEffect, useMemo } = React;
const { Steps, Tag, Space, message, Spin, Modal } = ctx.antd;
// Theme detection
const algorithm = ctx.antdConfig?.theme?.algorithm;
const darkAlgo = ctx.antd.theme.darkAlgorithm;
const isDark = Array.isArray(algorithm)
  ? algorithm.some(fn => fn === darkAlgo)
  : algorithm === darkAlgo;
const T = ctx.themeToken || {};

// i18n
const t = (key, opts) => ctx.t(key, { ns: 'nb_crm.quotes', ...opts });

// ==================== Config ====================

const STATUS_FLOW = [
  { code: 'draft', label: t('Draft'), color: 'default' },
  { code: 'pending_approval', label: t('Pending Approval'), color: 'orange' },
  { code: 'approved', label: t('Approved'), color: 'blue' },
  { code: 'sent', label: t('Sent'), color: 'cyan' },
  { code: 'accepted', label: t('Accepted'), color: 'green', isWon: true },
];

const TERMINAL_STATUSES = {
  rejected: { label: t('Rejected'), color: 'red', isLost: true },
  expired: { label: t('Expired'), color: 'default', isLost: true },
};

// ==================== Helper Functions ====================

function getStatusIndex(statusCode) {
  return STATUS_FLOW.findIndex((s) => s.code === statusCode);
}

function getStepsStatus(status, isWon, isLost) {
  if (isWon) return 'finish';
  if (isLost) return 'error';
  return 'process';
}

// ==================== Main Component ====================

const QuotationStatusFlow = () => {
  const record = ctx.record || ctx.popup?.record || {};
  const initialStatus = record.status || 'draft';
  const recordId = record.id;

  const [updating, setUpdating] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(initialStatus);

  // Sync with record changes
  useEffect(() => {
    setCurrentStatus(record.status || 'draft');
  }, [record.status]);

  // Current status info
  const currentStatusInfo = useMemo(() => {
    const found = STATUS_FLOW.find(s => s.code === currentStatus);
    if (found) return found;
    if (TERMINAL_STATUSES[currentStatus]) {
      return { code: currentStatus, ...TERMINAL_STATUSES[currentStatus] };
    }
    return STATUS_FLOW[0];
  }, [currentStatus]);

  const isTerminal = currentStatusInfo.isWon || currentStatusInfo.isLost;
  const currentIndex = getStatusIndex(currentStatus);

  // Handle status click
  const handleStepClick = async (stepIndex) => {
    if (isTerminal || !recordId || updating) return;

    const targetStatus = STATUS_FLOW[stepIndex];
    if (!targetStatus || targetStatus.code === currentStatus) return;

    // Confirm if moving to terminal status
    if (targetStatus.isWon) {
      Modal.confirm({
        title: t('Mark as "{{label}}"?', { label: targetStatus.label }),
        content: t('This will mark the quotation as accepted by customer.'),
        okText: t('Confirm'),
        cancelText: t('Cancel'),
        onOk: () => updateStatus(targetStatus),
      });
      return;
    }

    await updateStatus(targetStatus);
  };

  // Handle terminal status (rejected/expired)
  const handleTerminalClick = (terminalCode) => {
    if (isTerminal || !recordId || updating) return;

    const terminalInfo = TERMINAL_STATUSES[terminalCode];
    Modal.confirm({
      title: t('Mark as "{{label}}"?', { label: terminalInfo.label }),
      content: terminalCode === 'rejected'
        ? 'This will mark the quotation as rejected by customer.'
        : 'This will mark the quotation as expired.',
      okText: t('Confirm'),
      cancelText: t('Cancel'),
      okButtonProps: { danger: true },
      onOk: () => updateStatus({ code: terminalCode, ...terminalInfo }),
    });
  };

  const updateStatus = async (targetStatus) => {
    setUpdating(true);
    try {
      const updateData = {
        status: targetStatus.code,
      };

      // Add timestamp for certain statuses
      if (targetStatus.code === 'sent') {
        updateData.sent_at = new Date().toISOString();
      } else if (targetStatus.code === 'accepted') {
        updateData.accepted_at = new Date().toISOString();
      }

      await ctx.api.request({
        url: `nb_crm_quotations:update`,
        method: 'POST',
        params: { filterByTk: recordId },
        data: updateData,
      });

      // Immediately update local state for instant feedback
      setCurrentStatus(targetStatus.code);

      message.success(`Status updated to "${targetStatus.label}"`);

      // Refresh record
      if (ctx.refresh) {
        ctx.refresh();
      } else if (ctx.service?.refresh) {
        ctx.service.refresh();
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      message.error(t('Failed to update status'));
    } finally {
      setUpdating(false);
    }
  };

  // Build display steps
  const displayIndex = currentIndex >= 0 ? currentIndex : STATUS_FLOW.length;

  const stepsItems = STATUS_FLOW.map((status, index) => {
    let stepStatus = 'wait';

    if (isTerminal && currentStatusInfo.isLost) {
      // Show progress up to where it was before terminal
      stepStatus = index <= displayIndex ? 'finish' : 'wait';
    } else if (index < displayIndex) {
      stepStatus = 'finish';
    } else if (index === displayIndex) {
      stepStatus = getStepsStatus(status, status.isWon, false);
    }

    const isClickable = !isTerminal && status.code !== currentStatus;

    return {
      title: (
        <Space size={4}>
          <span>{status.label}</span>
          {status.code === currentStatus && (
            <Tag color="blue" style={{ fontSize: 10 }}>{t('Current')}</Tag>
          )}
        </Space>
      ),
      status: stepStatus,
      style: isClickable ? { cursor: 'pointer' } : {},
    };
  });

  // Add terminal status if current
  if (TERMINAL_STATUSES[currentStatus]) {
    stepsItems.push({
      title: (
        <Space size={4}>
          <span>{TERMINAL_STATUSES[currentStatus].label}</span>
          <Tag color="red" style={{ fontSize: 10 }}>{t('Current')}</Tag>
        </Space>
      ),
      status: 'error',
    });
  }

  return (
    <div style={{ position: 'relative' }}>
      {updating && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
        }}>
          <Spin size="small" />
        </div>
      )}

      <Steps
        size="small"
        current={displayIndex}
        items={stepsItems}
        onChange={handleStepClick}
      />

      {/* Terminal actions */}
      {!isTerminal && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Tag
            color="red"
            style={{ cursor: 'pointer' }}
            onClick={() => handleTerminalClick('rejected')}
          >{t('Mark as Rejected')}</Tag>
          <Tag
            color="default"
            style={{ cursor: 'pointer' }}
            onClick={() => handleTerminalClick('expired')}
          >{t('Mark as Expired')}</Tag>
        </div>
      )}
    </div>
  );
};

ctx.render(<QuotationStatusFlow />);
