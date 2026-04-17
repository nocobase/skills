/**
 * Opportunity Stage Flow Block
 * Table: nb_crm_opportunities
 *
 * Displays current opportunity stage with clickable steps to switch stages.
 * Stages are fetched from nb_crm_opportunity_stages table dynamically.
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
const t = (key, opts) => ctx.t(key, { ns: 'nb_crm.pipeline', ...opts });

// ==================== Config ====================

// Fallback stages if API fails (matching fields enum)
const FALLBACK_STAGES = [
  { code: 'prospecting', name: 'Initial Contact', sort_order: 1, win_probability: 10, is_won: false, is_lost: false },
  { code: 'analysis', name: 'Needs Analysis', sort_order: 2, win_probability: 30, is_won: false, is_lost: false },
  { code: 'proposal', name: 'Proposal', sort_order: 3, win_probability: 60, is_won: false, is_lost: false },
  { code: 'negotiation', name: 'Negotiation', sort_order: 4, win_probability: 80, is_won: false, is_lost: false },
  { code: 'won', name: 'Won', sort_order: 5, win_probability: 100, is_won: true, is_lost: false },
  { code: 'lost', name: 'Lost', sort_order: 6, win_probability: 0, is_won: false, is_lost: true },
];

// ==================== Helper Functions ====================

function getStageIndex(stages, stageCode) {
  return stages.findIndex((s) => s.code === stageCode);
}

function getStepsStatus(stage, isWon, isLost) {
  if (isWon) return 'finish';
  if (isLost) return 'error';
  return 'process';
}

// ==================== Main Component ====================

const OpportunityStageFlow = () => {
  const record = ctx.record || ctx.popup?.record || {};
  const initialStage = record.stage || 'prospecting';
  const recordId = record.id;
  const spaceName = ctx.space?.selected;

  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [currentStage, setCurrentStage] = useState(initialStage);

  // Sync with record changes
  useEffect(() => {
    setCurrentStage(record.stage || 'prospecting');
  }, [record.stage]);

  // Fetch stages from database
  useEffect(() => {
    const fetchStages = async () => {
      if (!ctx.api) {
        setStages(FALLBACK_STAGES);
        setLoading(false);
        return;
      }

      try {
        const params = {
          filter: { is_active: true },
          sort: ['sort_order'],
          fields: ['id', 'code', 'name', 'sort_order', 'win_probability', 'is_won', 'is_lost', 'color'],
        };

        // Add space filter if available
        if (spaceName) {
          params.filter.spaceName = spaceName;
        }

        const res = await ctx.api.request({
          url: 'nb_crm_opportunity_stages:list',
          method: 'GET',
          params,
        });

        const stagesData = res?.data?.data || [];
        setStages(stagesData.length > 0 ? stagesData : FALLBACK_STAGES);
      } catch (error) {
        console.error('Failed to fetch stages:', error);
        setStages(FALLBACK_STAGES);
      } finally {
        setLoading(false);
      }
    };

    fetchStages();
  }, [spaceName]);

  // Current stage info
  const currentStageInfo = useMemo(() => {
    return stages.find(s => s.code === currentStage) || {};
  }, [stages, currentStage]);

  const isTerminal = currentStageInfo.is_won || currentStageInfo.is_lost;
  const currentIndex = getStageIndex(stages, currentStage);

  // Handle stage click
  const handleStepClick = async (stepIndex) => {
    if (isTerminal || !recordId || updating) return;

    const targetStage = stages[stepIndex];
    if (!targetStage || targetStage.code === currentStage) return;

    // Confirm if moving to terminal stage
    if (targetStage.is_won || targetStage.is_lost) {
      Modal.confirm({
        title: t('Move to "{{name}}"?', { name: targetStage.name }),
        content: targetStage.is_won
          ? 'This will mark the opportunity as Won. This action may trigger related workflows.'
          : 'This will mark the opportunity as Lost. Please ensure you have recorded the reason.',
        okText: t('Confirm'),
        cancelText: t('Cancel'),
        onOk: () => updateStage(targetStage),
      });
      return;
    }

    await updateStage(targetStage);
  };

  const updateStage = async (targetStage) => {
    setUpdating(true);
    try {
      await ctx.api.request({
        url: `nb_crm_opportunities:update`,
        method: 'POST',
        params: { filterByTk: recordId },
        data: {
          stage: targetStage.code,
          stage_sort: targetStage.sort_order,
          stage_entered_at: new Date().toISOString(),
        },
      });

      // Immediately update local state for instant feedback
      setCurrentStage(targetStage.code);

      message.success(`Stage updated to "${targetStage.name}"`);

      // Also try to refresh the record for other components
      if (ctx.refresh) {
        ctx.refresh();
      } else if (ctx.service?.refresh) {
        ctx.service.refresh();
      }
    } catch (error) {
      console.error('Failed to update stage:', error);
      message.error(t('Failed to update stage'));
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <Space style={{ padding: 16, justifyContent: 'center', width: '100%' }}>
        <Spin size="small" />
      </Space>
    );
  }

  // Separate won and lost stages from progress stages
  const progressStages = stages.filter(s => !s.is_won && !s.is_lost);
  const wonStage = stages.find(s => s.is_won);
  const lostStage = stages.find(s => s.is_lost);

  // Build display stages: progress stages + won + lost (like leads: new -> working -> converted -> lost)
  const displayStages = [...progressStages];
  if (wonStage) displayStages.push(wonStage);
  if (lostStage) displayStages.push(lostStage);

  // Calculate current display index
  let displayIndex = displayStages.findIndex(s => s.code === currentStage);
  if (displayIndex < 0) displayIndex = 0;

  // Build steps items
  const stepsItems = displayStages.map((stage, index) => {
    let status = 'wait';

    if (index < displayIndex) {
      status = 'finish';
    } else if (index === displayIndex) {
      status = getStepsStatus(stage, stage.is_won, stage.is_lost);
    }

    const isClickable = !isTerminal && stage.code !== currentStage;

    return {
      title: (
        <Space size={4}>
          <span>{stage.name}</span>
          {stage.code === currentStage && (
            <Tag color="blue" style={{ fontSize: 10 }}>{t('Current')}</Tag>
          )}
        </Space>
      ),
      description: stage.win_probability != null ? `${stage.win_probability}%` : undefined,
      status,
      onClick: isClickable ? () => handleStepClick(stages.indexOf(stage)) : undefined,
      style: isClickable ? { cursor: 'pointer' } : {},
    };
  });

  return (
    <div style={{ position: 'relative' }}>
      {updating && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.7)',
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
      />
    </div>
  );
};

ctx.render(<OpportunityStageFlow />);
