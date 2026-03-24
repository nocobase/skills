#!/usr/bin/env node

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function hasAnyKeyword(text, keywords) {
  const normalizedText = normalizeText(text).toLowerCase();
  if (!normalizedText) {
    return false;
  }
  return (Array.isArray(keywords) ? keywords : []).some((keyword) => normalizedText.includes(normalizeText(keyword).toLowerCase()));
}

function chooseFirstAvailable(candidates, availableFields) {
  for (const candidate of candidates) {
    if (availableFields.includes(candidate)) {
      return candidate;
    }
  }
  return availableFields[0] || '';
}

export const CHART_BLOCK_USE = 'ChartBlockModel';
export const GRID_CARD_BLOCK_USE = 'GridCardBlockModel';
export const TABLE_BLOCK_USE = 'TableBlockModel';
export const VISUALIZATION_BLOCK_USES = new Set([CHART_BLOCK_USE, GRID_CARD_BLOCK_USE]);
export const VISUALIZATION_QUERY_MODES = new Set(['builder', 'sql']);
export const VISUALIZATION_OPTION_MODES = new Set(['basic', 'custom']);

export const SUPPORTED_VISUALIZATION_CONTEXT_REQUIREMENTS = {
  [CHART_BLOCK_USE]: new Set(['collection metadata', 'query builder', 'optional SQL resource', 'chart builder', 'RunJS']),
  [GRID_CARD_BLOCK_USE]: new Set(),
};

export const SUPPORTED_VISUALIZATION_UNRESOLVED_REASONS = {
  [CHART_BLOCK_USE]: new Set(['runtime-chart-query-config', 'runtime-chart-option-builder']),
  [GRID_CARD_BLOCK_USE]: new Set(['runtime-grid-card-actions']),
};

export function guessVisualizationConfidence(input = {}) {
  const blockUse = normalizeText(input.blockUse);
  const queryMode = normalizeText(input.queryMode);
  const optionMode = normalizeText(input.optionMode);
  const hasEvents = Boolean(normalizeText(input.eventsRaw));

  if (blockUse === GRID_CARD_BLOCK_USE) {
    return 'high';
  }
  if (blockUse !== CHART_BLOCK_USE) {
    return 'unknown';
  }
  if (optionMode === 'custom' || hasEvents) {
    return 'low';
  }
  if (queryMode === 'sql') {
    return 'medium';
  }
  return 'high';
}

export function normalizeVisualizationSpec(input = {}, options = {}) {
  const blockUseCandidate = normalizeText(input.blockUse) || normalizeText(options.blockUse);
  const blockUse = VISUALIZATION_BLOCK_USES.has(blockUseCandidate)
    ? blockUseCandidate
    : normalizeText(options.blockUse);
  const queryModeCandidate = normalizeText(input.queryMode) || normalizeText(options.queryMode);
  const optionModeCandidate = normalizeText(input.optionMode) || normalizeText(options.optionMode);
  const queryMode = VISUALIZATION_QUERY_MODES.has(queryModeCandidate) ? queryModeCandidate : '';
  const optionMode = VISUALIZATION_OPTION_MODES.has(optionModeCandidate) ? optionModeCandidate : '';
  const dataSource = normalizeText(input.dataSource) || normalizeText(options.dataSource);
  const fallbackBlockUse = normalizeText(input.fallbackBlockUse) || normalizeText(options.fallbackBlockUse) || TABLE_BLOCK_USE;
  const collectionPath = uniqueStrings(input.collectionPath);
  const metricOrDimension = uniqueStrings(input.metricOrDimension);
  const metrics = uniqueStrings(input.metrics);
  const chartType = normalizeText(input.chartType) || normalizeText(options.chartType);
  const goal = normalizeText(input.goal) || normalizeText(options.goal);
  const sqlDatasource = normalizeText(input.sqlDatasource);
  const sql = typeof input.sql === 'string' ? input.sql.trim() : '';
  const raw = typeof input.raw === 'string' ? input.raw.trim() : '';
  const eventsRaw = typeof input.eventsRaw === 'string' ? input.eventsRaw.trim() : '';
  const confidence = normalizeText(input.confidence) || guessVisualizationConfidence({
    blockUse,
    queryMode,
    optionMode,
    eventsRaw,
  });

  return {
    blockUse,
    goal,
    queryMode,
    optionMode,
    dataSource,
    metricOrDimension,
    metrics,
    chartType,
    collectionPath,
    sqlDatasource,
    sql,
    raw,
    eventsRaw,
    fallbackBlockUse,
    confidence,
  };
}

export function isVisualizationRuntimeSensitive(input = {}) {
  const spec = input?.visualizationSpec && typeof input.visualizationSpec === 'object'
    ? normalizeVisualizationSpec(input.visualizationSpec, input)
    : normalizeVisualizationSpec(input);
  return spec.confidence === 'medium' || spec.confidence === 'low';
}

export function evaluateVisualizationUseEligibility({
  use,
  contextRequirements = [],
  unresolvedReasons = [],
  collectionMeta = null,
} = {}) {
  const normalizedUse = normalizeText(use);
  if (!VISUALIZATION_BLOCK_USES.has(normalizedUse)) {
    return {
      eligible: false,
      reason: 'unsupported-visualization-use',
      confidence: 'unknown',
    };
  }

  if (normalizedUse === GRID_CARD_BLOCK_USE && !collectionMeta) {
    return {
      eligible: false,
      reason: 'collection-required',
      confidence: 'unknown',
    };
  }

  const supportedRequirements = SUPPORTED_VISUALIZATION_CONTEXT_REQUIREMENTS[normalizedUse] || new Set();
  const supportedReasons = SUPPORTED_VISUALIZATION_UNRESOLVED_REASONS[normalizedUse] || new Set();
  const unsupportedRequirements = uniqueStrings(contextRequirements)
    .filter((item) => !supportedRequirements.has(item));
  const unsupportedReasons = uniqueStrings(unresolvedReasons)
    .filter((item) => !supportedReasons.has(item));

  return {
    eligible: unsupportedRequirements.length === 0 && unsupportedReasons.length === 0,
    reason: unsupportedRequirements.length > 0
      ? 'unsupported-context-requirement'
      : (unsupportedReasons.length > 0 ? 'unsupported-unresolved-reason' : ''),
    unsupportedRequirements,
    unsupportedReasons,
    confidence: normalizedUse === GRID_CARD_BLOCK_USE ? 'high' : 'medium',
  };
}

export function inferChartSpecFromCollection({
  requestText = '',
  collectionMeta = null,
  requestedFields = [],
  resolvedFields = [],
} = {}) {
  const collectionName = normalizeText(collectionMeta?.name);
  const availableFields = uniqueStrings([
    ...(Array.isArray(resolvedFields) ? resolvedFields : []),
    ...(Array.isArray(requestedFields) ? requestedFields : []),
    ...(Array.isArray(collectionMeta?.scalarFieldNames) ? collectionMeta.scalarFieldNames : []),
    ...(Array.isArray(collectionMeta?.fieldNames) ? collectionMeta.fieldNames : []),
  ]);
  const request = normalizeText(requestText);
  const wantsTrend = hasAnyKeyword(request, ['趋势', 'trend', 'time series', '时间']);
  const wantsShare = hasAnyKeyword(request, ['占比', '比例', 'pie', '饼图']);
  const wantsDistribution = wantsShare || hasAnyKeyword(request, ['分布', 'distribution', 'status', '状态', 'category', '分类']);
  const wantsSql = hasAnyKeyword(request, ['sql', '查询语句', '原生查询']);
  const wantsCustom = hasAnyKeyword(request, ['custom', '自定义 option', '自定义图表', 'echarts']);
  const wantsEvents = hasAnyKeyword(request, ['点击事件', 'event', '交互', '联动']);

  const trendDimension = chooseFirstAvailable(['createdAt', 'updatedAt', 'date', 'created_at'], availableFields);
  const categoryDimension = chooseFirstAvailable(['status', 'category', 'type', 'applicant'], availableFields);
  const dimension = wantsTrend ? trendDimension : categoryDimension;
  const goal = wantsTrend ? 'trend' : (wantsDistribution ? 'distribution' : 'summary');
  const chartType = wantsTrend ? 'line' : (wantsShare ? 'pie' : 'bar');
  const queryMode = wantsSql ? 'sql' : 'builder';
  const optionMode = wantsCustom ? 'custom' : 'basic';

  return normalizeVisualizationSpec({
    blockUse: CHART_BLOCK_USE,
    goal,
    queryMode,
    optionMode,
    dataSource: collectionName,
    metricOrDimension: dimension ? [dimension] : [],
    chartType,
    collectionPath: collectionName ? [collectionName] : [],
    sqlDatasource: queryMode === 'sql' ? 'main' : '',
    sql: queryMode === 'sql'
      ? `SELECT ${dimension || '*'} FROM ${collectionName || 'your_collection'}`
      : '',
    raw: optionMode === 'custom' ? 'return option;' : '',
    eventsRaw: wantsEvents ? 'return {};' : '',
  });
}

function buildVisualizationBlock({
  use,
  title = '',
  collectionName = '',
  fields = [],
  visualizationSpec = {},
}) {
  return {
    kind: 'PublicUse',
    use,
    title,
    collectionName,
    fields: uniqueStrings(fields),
    actions: [],
    rowActions: [],
    blocks: [],
    visualizationSpec: normalizeVisualizationSpec(visualizationSpec, {
      blockUse: use,
      dataSource: collectionName,
    }),
  };
}

export function buildChartBlockFromBuilderSpec({
  title = '',
  collectionName = '',
  collectionPath = [],
  metricOrDimension = [],
  chartType = 'bar',
  goal = 'distribution',
  optionMode = 'basic',
  raw = '',
  eventsRaw = '',
} = {}) {
  return buildVisualizationBlock({
    use: CHART_BLOCK_USE,
    title,
    collectionName: '',
    fields: uniqueStrings(metricOrDimension),
    visualizationSpec: {
      blockUse: CHART_BLOCK_USE,
      goal,
      queryMode: 'builder',
      optionMode,
      dataSource: collectionName,
      metricOrDimension,
      chartType,
      collectionPath: collectionPath.length > 0 ? collectionPath : (collectionName ? [collectionName] : []),
      raw,
      eventsRaw,
    },
  });
}

export function buildChartBlockFromSqlSpec({
  title = '',
  collectionName = '',
  metricOrDimension = [],
  chartType = 'bar',
  goal = 'distribution',
  optionMode = 'basic',
  sqlDatasource = 'main',
  sql = '',
  raw = '',
  eventsRaw = '',
} = {}) {
  return buildVisualizationBlock({
    use: CHART_BLOCK_USE,
    title,
    collectionName: '',
    fields: uniqueStrings(metricOrDimension),
    visualizationSpec: {
      blockUse: CHART_BLOCK_USE,
      goal,
      queryMode: 'sql',
      optionMode,
      dataSource: collectionName,
      metricOrDimension,
      chartType,
      sqlDatasource,
      sql,
      raw,
      eventsRaw,
    },
  });
}

export function buildGridCardBlockFromMetrics({
  title = '',
  collectionName = '',
  metrics = [],
  goal = 'summary',
} = {}) {
  const normalizedMetrics = uniqueStrings(
    metrics.map((item) => (typeof item === 'string' ? item : normalizeText(item?.field))),
  );
  return buildVisualizationBlock({
    use: GRID_CARD_BLOCK_USE,
    title,
    collectionName,
    fields: normalizedMetrics,
    visualizationSpec: {
      blockUse: GRID_CARD_BLOCK_USE,
      goal,
      queryMode: 'builder',
      optionMode: 'basic',
      dataSource: collectionName,
      metricOrDimension: normalizedMetrics,
      metrics: normalizedMetrics,
      collectionPath: collectionName ? [collectionName] : [],
    },
  });
}
