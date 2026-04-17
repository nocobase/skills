/**
 * Lead Stage Flow Block
 */

// i18n
const t = (key, opts) => ctx.t(key, { ns: 'nb_crm.leads', ...opts });


const { React } = ctx;
const { Steps, Tag, Space, message } = ctx.antd;

// ==================== View Configuration ====================

const VIEW_CONFIG = {
  convertPopup: '0544f02b155',
  lostPopup: '054fc25289c',
};

// ==================== Config ====================

const STAGES = [
  { key: 'new', label: t('New'), description: t('Lead captured') },
  { key: 'working', label: t('Working'), description: t('In qualification') },
  { key: 'converted', label: t('Converted'), description: t('Customer created'), popupKey: 'convertPopup' },
  { key: 'unqualified', label: t('Lost'), description: t('Not a fit'), popupKey: 'lostPopup' },
];

// ==================== Helper Functions ====================

function getStageIndex(status) {
  return STAGES.findIndex((s) => s.key === status);
}

function getStepsStatus(currentStatus) {
  if (currentStatus === 'converted') return 'finish';
  if (currentStatus === 'unqualified') return 'error';
  return 'process';
}

// ==================== Main Component ====================

const LeadStageFlow = () => {
  const record = ctx.record || ctx.popup?.record || {};
  const currentStatus = record.status || 'new';
  const recordId = record.id;

  const isTerminal = currentStatus === 'converted' || currentStatus === 'unqualified';
  const currentIndex = getStageIndex(currentStatus);

  // For converted/unqualified, show appropriate current step
  let displayIndex = currentIndex;
  if (currentStatus === 'converted') displayIndex = 2;
  if (currentStatus === 'unqualified') displayIndex = 3;

  const handleStepClick = async (stepIndex) => {
    const stage = STAGES[stepIndex];
    if (!stage.popupKey || isTerminal) return;

    if (!recordId) {
      message.warning(t('No record ID available'));
      return;
    }

    const viewUid = VIEW_CONFIG[stage.popupKey];
    if (!viewUid || viewUid.startsWith('REPLACE_WITH')) {
      message.warning(t('Popup not configured'));
      return;
    }

    try {
      if (ctx.openView) {
        await ctx.openView(viewUid, {
          mode: 'drawer',
          size: 'medium',
          filterByTk: recordId,
        });
      }
    } catch (error) {
      console.error('Failed to open popup:', error);
      message.error(t('Failed to open popup'));
    }
  };

  // Build steps items
  const stepsItems = STAGES.map((stage, index) => {
    let status = 'wait';
    if (index < displayIndex) status = 'finish';
    if (index === displayIndex) status = getStepsStatus(currentStatus);

    return {
      title: (
        <Space size={4}>
          <span>{stage.label}</span>
          {index === displayIndex && <Tag color="blue" style={{ fontSize: 10 }}>{t('Current')}</Tag>}
        </Space>
      ),
      description: stage.description,
      status,
      onClick: stage.popupKey && !isTerminal ? () => handleStepClick(index) : undefined,
      style: stage.popupKey && !isTerminal ? { cursor: 'pointer' } : {},
    };
  });

  return (
    <Steps
      size="small"
      current={displayIndex}
      items={stepsItems}
    />
  );
};

ctx.render(<LeadStageFlow />);
