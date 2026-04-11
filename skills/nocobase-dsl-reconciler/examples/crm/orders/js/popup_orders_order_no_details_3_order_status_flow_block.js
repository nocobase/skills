/**
 * Order Status Flow Block
 * Table: nb_crm_orders
 *
 * Displays order status with clickable steps to switch status.
 * Status flow: pending → confirmed → processing → shipped → completed
 * Terminal: cancelled
 */

const { useState, useEffect } = ctx.React;
const { Steps, Tag, Space, message, Spin, Modal } = ctx.antd;

// ==================== Config ====================

const STATUS_FLOW = [
  { code: 'pending', label: 'Pending', color: 'default' },
  { code: 'confirmed', label: 'Confirmed', color: 'blue' },
  { code: 'processing', label: 'Processing', color: 'orange' },
  { code: 'shipped', label: 'Shipped', color: 'cyan' },
  { code: 'completed', label: 'Completed', color: 'green', isTerminal: true },
];

// ==================== Main Component ====================

const OrderStatusFlow = () => {
  const record = ctx.record || {};
  const initialStatus = record.status || 'pending';
  const recordId = record.id;

  const [updating, setUpdating] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(initialStatus);

  useEffect(() => {
    setCurrentStatus(record.status || 'pending');
  }, [record.status]);

  const currentIndex = STATUS_FLOW.findIndex(s => s.code === currentStatus);
  const isCancelled = currentStatus === 'cancelled';
  const isCompleted = currentStatus === 'completed';
  const isTerminal = isCancelled || isCompleted;

  const handleStepClick = async (stepIndex) => {
    if (isTerminal || !recordId || updating) return;

    const targetStatus = STATUS_FLOW[stepIndex];
    if (!targetStatus || targetStatus.code === currentStatus) return;

    // Confirm if completing
    if (targetStatus.isTerminal) {
      Modal.confirm({
        title: `Mark as "${targetStatus.label}"?`,
        content: 'This will mark the order as completed.',
        okText: 'Confirm',
        cancelText: 'Cancel',
        onOk: () => updateStatus(targetStatus),
      });
      return;
    }

    await updateStatus(targetStatus);
  };

  const handleCancel = () => {
    if (isTerminal || !recordId || updating) return;

    Modal.confirm({
      title: 'Cancel this order?',
      content: 'This action cannot be undone.',
      okText: 'Yes, Cancel Order',
      cancelText: 'No',
      okButtonProps: { danger: true },
      onOk: () => updateStatus({ code: 'cancelled', label: 'Cancelled' }),
    });
  };

  const updateStatus = async (targetStatus) => {
    setUpdating(true);
    try {
      const updateData = { status: targetStatus.code };

      if (targetStatus.code === 'shipped') {
        updateData.shipped_at = new Date().toISOString();
      } else if (targetStatus.code === 'completed') {
        updateData.actual_delivery_date = new Date().toISOString().split('T')[0];
      }

      await ctx.api.request({
        url: 'nb_crm_orders:update',
        method: 'POST',
        params: { filterByTk: recordId },
        data: updateData,
      });

      setCurrentStatus(targetStatus.code);
      message.success(`Status updated to "${targetStatus.label}"`);

      if (ctx.refresh) ctx.refresh();
      else if (ctx.service?.refresh) ctx.service.refresh();
    } catch (error) {
      console.error('Failed to update status:', error);
      message.error('Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  // Build steps items
  const stepsItems = STATUS_FLOW.map((status, index) => {
    let stepStatus = 'wait';

    if (isCancelled) {
      stepStatus = 'error';
    } else if (index < currentIndex) {
      stepStatus = 'finish';
    } else if (index === currentIndex) {
      stepStatus = status.isTerminal ? 'finish' : 'process';
    }

    const isClickable = !isTerminal && status.code !== currentStatus;

    return {
      title: (
        <Space size={4}>
          <span>{status.label}</span>
          {status.code === currentStatus && !isCancelled && (
            <Tag color="blue" style={{ fontSize: 10 }}>Current</Tag>
          )}
        </Space>
      ),
      status: stepStatus,
      style: isClickable ? { cursor: 'pointer' } : {},
    };
  });

  // Add cancelled if current
  if (isCancelled) {
    stepsItems.push({
      title: (
        <Space size={4}>
          <span>Cancelled</span>
          <Tag color="red" style={{ fontSize: 10 }}>Current</Tag>
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
          inset: 0,
          background: 'rgba(255,255,255,0.7)',
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
        current={currentIndex >= 0 ? currentIndex : 0}
        items={stepsItems}
        onChange={handleStepClick}
      />

      {!isTerminal && (
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Tag color="red" style={{ cursor: 'pointer' }} onClick={handleCancel}>
            Cancel Order
          </Tag>
        </div>
      )}
    </div>
  );
};

ctx.render(<OrderStatusFlow />);
