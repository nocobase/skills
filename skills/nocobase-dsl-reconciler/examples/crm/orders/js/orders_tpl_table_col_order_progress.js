/**
 * Order Progress Column
 * Table: nb_crm_orders
 *
 * Displays order status as a visual progress indicator with dots and lines.
 * Status flow: pending → confirmed → processing → shipped → completed
 * Terminal: cancelled
 *
 * Design reference: order.html - Order Progress column
 */

const { Tooltip } = ctx.antd;

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

const STATUS_FLOW = [
  { code: 'pending', label: t('Pending'), step: 1 },
  { code: 'confirmed', label: t('Confirmed'), step: 2 },
  { code: 'processing', label: t('Processing'), step: 3 },
  { code: 'shipped', label: t('Shipped'), step: 4 },
  { code: 'completed', label: t('Completed'), step: 5 },
];

// ==================== Styles ====================

const dotBase = {
  width: 18,
  height: 18,
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10,
  fontWeight: 600,
  flexShrink: 0,
};

const lineBase = {
  width: 20,
  height: 2,
  display: 'inline-block',
  verticalAlign: 'middle',
};

const styles = {
  container: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  },
  dotPending: {
    ...dotBase,
    background: T.colorBorderSecondary || '#e5e7eb',
    color: T.colorTextSecondary || '#6b7280',
  },
  dotCompleted: {
    ...dotBase,
    background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
    color: 'white',
  },
  dotCurrent: {
    ...dotBase,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    boxShadow: '0 0 10px rgba(102, 126, 234, 0.5)',
  },
  dotCancelled: {
    ...dotBase,
    background: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
    color: 'white',
  },
  linePending: {
    ...lineBase,
    background: T.colorBorderSecondary || '#e5e7eb',
  },
  lineCompleted: {
    ...lineBase,
    background: 'linear-gradient(90deg, #10b981, #34d399)',
  },
  cancelledText: {
    fontSize: 12,
    color: T.colorError || '#ef4444',
    marginLeft: 4,
    fontWeight: 500,
  },
};

// ==================== Main Component ====================

const OrderProgress = () => {
  const record = ctx.record || {};
  const status = record.status || 'pending';

  // Handle cancelled orders
  if (status === 'cancelled') {
    return (
      <Tooltip title={t('Order Cancelled')}>
        <div style={styles.container}>
          <span style={styles.dotCancelled}>✕</span>
          <span style={styles.cancelledText}>{t('Cancelled')}</span>
        </div>
      </Tooltip>
    );
  }

  // Find current step index
  const currentIndex = STATUS_FLOW.findIndex(s => s.code === status);
  const currentStep = currentIndex >= 0 ? currentIndex : 0;

  // Build tooltip showing all steps
  const tooltipContent = (
    <div style={{ fontSize: 12 }}>
      {STATUS_FLOW.map((item, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        return (
          <div key={item.code} style={{
            color: isCurrent ? '#667eea' : isCompleted ? '#10b981' : (T.colorTextTertiary || '#9ca3af'),
            fontWeight: isCurrent ? 600 : 400,
          }}>
            {isCompleted ? '✓' : isCurrent ? '●' : '○'} {item.label}
          </div>
        );
      })}
    </div>
  );

  return (
    <Tooltip title={tooltipContent}>
      <div style={styles.container}>
        {STATUS_FLOW.map((item, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;

          // Determine dot style
          let dotStyle = styles.dotPending;
          if (isCompleted) {
            dotStyle = styles.dotCompleted;
          } else if (isCurrent) {
            dotStyle = styles.dotCurrent;
          }

          // Determine line style (line comes after dot, except for last)
          const lineStyle = isCompleted ? styles.lineCompleted : styles.linePending;

          return (
            <ctx.React.Fragment key={item.code}>
              <span style={dotStyle}>
                {isCompleted ? '✓' : item.step}
              </span>
              {index < STATUS_FLOW.length - 1 && (
                <span style={lineStyle} />
              )}
            </ctx.React.Fragment>
          );
        })}
      </div>
    </Tooltip>
  );
};

ctx.render(<OrderProgress />);
