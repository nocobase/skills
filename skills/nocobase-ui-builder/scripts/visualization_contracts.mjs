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
export const DEFAULT_CHART_DATA_SOURCE_KEY = 'main';
export const VISUALIZATION_BLOCK_USES = new Set([CHART_BLOCK_USE, GRID_CARD_BLOCK_USE]);
export const VISUALIZATION_QUERY_MODES = new Set(['builder', 'sql']);
export const VISUALIZATION_OPTION_MODES = new Set(['basic', 'custom']);

function normalizeStringArray(values, { dedupe = true, maxItems = Number.POSITIVE_INFINITY } = {}) {
  const normalized = [];
  const seen = new Set();
  for (const item of Array.isArray(values) ? values : []) {
    if (typeof item !== 'string') {
      continue;
    }
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    if (dedupe) {
      if (seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
    }
    normalized.push(trimmed);
    if (normalized.length >= maxItems) {
      break;
    }
  }
  return normalized;
}

function normalizeCollectionPath(value) {
  return normalizeStringArray(value, { dedupe: false, maxItems: 2 });
}

function normalizeFieldPathSegments(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeVisualizationFieldPath(value) {
  if (Array.isArray(value)) {
    const segments = normalizeFieldPathSegments(value);
    if (segments.length === 0) {
      return null;
    }
    if (segments.length === 1) {
      return segments[0];
    }
    if (segments.length === 2) {
      return segments;
    }
    return null;
  }
  const normalized = normalizeText(value);
  return normalized || null;
}

export function serializeVisualizationFieldPath(value) {
  if (Array.isArray(value)) {
    return normalizeFieldPathSegments(value).join('.');
  }
  return normalizeText(value);
}

function normalizeVisualizationFieldList(values) {
  const normalized = [];
  const seen = new Set();
  for (const item of Array.isArray(values) ? values : []) {
    const fieldPath = normalizeVisualizationFieldPath(item);
    const serialized = serializeVisualizationFieldPath(fieldPath);
    if (!serialized || seen.has(serialized)) {
      continue;
    }
    seen.add(serialized);
    normalized.push(serialized);
  }
  return normalized;
}

function normalizeFieldDescriptorList(values, type) {
  const normalized = [];
  const seen = new Set();
  for (const item of Array.isArray(values) ? values : []) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const field = normalizeVisualizationFieldPath(item.field);
    const serializedField = serializeVisualizationFieldPath(field);
    if (!serializedField) {
      continue;
    }
    const aggregation = type === 'measure' ? normalizeText(item.aggregation) : '';
    const alias = normalizeText(item.alias);
    const format = type === 'dimension' ? normalizeText(item.format) : '';
    const dedupeKey = [
      serializedField,
      aggregation,
      alias,
      format,
    ].join('|');
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    normalized.push({
      field,
      ...(aggregation ? { aggregation } : {}),
      ...(alias ? { alias } : {}),
      ...(format ? { format } : {}),
    });
  }
  return normalized;
}

function normalizeBuilder(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : null;
}

function normalizeAliasSegment(value, fallback = 'value') {
  const normalized = normalizeText(value)
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return normalized || fallback;
}

function buildMeasureAlias(field, aggregation = 'count') {
  return `${normalizeAliasSegment(aggregation, 'agg')}_${normalizeAliasSegment(serializeVisualizationFieldPath(field), 'value')}`;
}

function chooseMetricField(availableFields, request = '') {
  const preferred = hasAnyKeyword(request, ['资产', '金额', 'value', 'amount', 'balance', 'price', 'cost'])
    ? ['current_value', 'amount', 'total', 'value', 'balance', 'price', 'cost', 'score', 'quantity']
    : ['current_value', 'amount', 'total', 'value', 'balance', 'price', 'cost', 'score', 'quantity'];
  return chooseFirstAvailable(preferred, availableFields);
}

function chooseCountField(availableFields, fallback = '') {
  return chooseFirstAvailable(['id', 'title', 'name', 'status', 'createdAt', fallback], availableFields);
}

function buildDefaultChartBuilder({ chartType = 'bar', dimensionField = '', measureAlias = '' } = {}) {
  if (!dimensionField || !measureAlias) {
    return null;
  }
  switch (chartType) {
    case 'pie':
      return {
        type: 'pie',
        pieCategory: dimensionField,
        pieValue: measureAlias,
      };
    case 'doughnut':
      return {
        type: 'doughnut',
        doughnutCategory: dimensionField,
        doughnutValue: measureAlias,
      };
    case 'area':
      return {
        type: 'area',
        xField: dimensionField,
        yField: measureAlias,
      };
    case 'barHorizontal':
      return {
        type: 'barHorizontal',
        xField: dimensionField,
        yField: measureAlias,
      };
    case 'line':
    case 'bar':
    default:
      return {
        type: chartType || 'bar',
        xField: dimensionField,
        yField: measureAlias,
      };
  }
}

export function getVisualizationCollectionName(input = {}) {
  const spec = input?.visualizationSpec && typeof input.visualizationSpec === 'object'
    ? normalizeVisualizationSpec(input.visualizationSpec, input)
    : normalizeVisualizationSpec(input);
  if (spec.collectionPath.length >= 2) {
    return spec.collectionPath[1];
  }
  return spec.collectionPath[0] || '';
}

function normalizeVisualizationSpecCore(input = {}, options = {}) {
  const sourceInput = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const sourceOptions = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const blockUseCandidate = normalizeText(sourceInput.blockUse) || normalizeText(sourceOptions.blockUse);
  const blockUse = VISUALIZATION_BLOCK_USES.has(blockUseCandidate)
    ? blockUseCandidate
    : normalizeText(sourceOptions.blockUse);
  const queryModeCandidate = normalizeText(sourceInput.queryMode) || normalizeText(sourceOptions.queryMode);
  const optionModeCandidate = normalizeText(sourceInput.optionMode) || normalizeText(sourceOptions.optionMode);
  const queryMode = VISUALIZATION_QUERY_MODES.has(queryModeCandidate) ? queryModeCandidate : '';
  const optionMode = VISUALIZATION_OPTION_MODES.has(optionModeCandidate) ? optionModeCandidate : '';
  const collectionPath = normalizeCollectionPath(sourceInput.collectionPath);
  const dataSource = blockUse === CHART_BLOCK_USE
    ? (collectionPath[0] || normalizeText(sourceInput.dataSource) || DEFAULT_CHART_DATA_SOURCE_KEY)
    : (normalizeText(sourceInput.dataSource) || normalizeText(sourceOptions.dataSource));
  const fallbackBlockUse = normalizeText(sourceInput.fallbackBlockUse) || normalizeText(sourceOptions.fallbackBlockUse) || TABLE_BLOCK_USE;
  const metricOrDimension = normalizeVisualizationFieldList(sourceInput.metricOrDimension);
  const metrics = normalizeVisualizationFieldList(sourceInput.metrics);
  const measures = normalizeFieldDescriptorList(sourceInput.measures, 'measure');
  const dimensions = normalizeFieldDescriptorList(sourceInput.dimensions, 'dimension');
  const chartType = normalizeText(sourceInput.chartType) || normalizeText(sourceOptions.chartType);
  const goal = normalizeText(sourceInput.goal) || normalizeText(sourceOptions.goal);
  const sqlDatasource = normalizeText(sourceInput.sqlDatasource) || (queryMode === 'sql' ? DEFAULT_CHART_DATA_SOURCE_KEY : '');
  const sql = typeof sourceInput.sql === 'string' ? sourceInput.sql.trim() : '';
  const raw = typeof sourceInput.raw === 'string' ? sourceInput.raw.trim() : '';
  const eventsRaw = typeof sourceInput.eventsRaw === 'string' ? sourceInput.eventsRaw.trim() : '';
  const optionBuilder = normalizeBuilder(sourceInput.optionBuilder ?? sourceInput.builder);
  return {
    blockUse,
    goal,
    queryMode,
    optionMode,
    dataSource,
    metricOrDimension,
    metrics,
    measures,
    dimensions,
    chartType,
    collectionPath,
    sqlDatasource,
    sql,
    optionBuilder,
    raw,
    eventsRaw,
    fallbackBlockUse,
  };
}

function isRenderableChartSpecSnapshot(spec = {}) {
  if (spec.blockUse !== CHART_BLOCK_USE) {
    return false;
  }
  if (spec.queryMode === 'sql') {
    if (!spec.sqlDatasource || !spec.sql) {
      return false;
    }
  } else if (spec.queryMode === 'builder') {
    if (spec.collectionPath.length !== 2 || spec.measures.length === 0) {
      return false;
    }
  } else {
    return false;
  }
  if (spec.optionMode === 'basic') {
    return Boolean(spec.optionBuilder && Object.keys(spec.optionBuilder).length > 0);
  }
  if (spec.optionMode === 'custom') {
    return Boolean(spec.raw);
  }
  return false;
}

export function isRenderableChartSpec(input = {}) {
  const spec = input?.visualizationSpec && typeof input.visualizationSpec === 'object'
    ? normalizeVisualizationSpecCore(input.visualizationSpec, input)
    : normalizeVisualizationSpecCore(input);
  return isRenderableChartSpecSnapshot(spec);
}

export const SUPPORTED_VISUALIZATION_CONTEXT_REQUIREMENTS = {
  [CHART_BLOCK_USE]: new Set(['collection metadata', 'query builder', 'optional SQL resource', 'chart builder', 'RunJS']),
  [GRID_CARD_BLOCK_USE]: new Set(),
};

export const SUPPORTED_VISUALIZATION_UNRESOLVED_REASONS = {
  [CHART_BLOCK_USE]: new Set(['runtime-chart-query-config', 'runtime-chart-option-builder']),
  [GRID_CARD_BLOCK_USE]: new Set(['runtime-grid-card-actions']),
};

export function guessVisualizationConfidence(input = {}) {
  const spec = input?.visualizationSpec && typeof input.visualizationSpec === 'object'
    ? normalizeVisualizationSpecCore(input.visualizationSpec, input)
    : normalizeVisualizationSpecCore(input);
  const hasEvents = Boolean(spec.eventsRaw);

  if (spec.blockUse === GRID_CARD_BLOCK_USE) {
    return 'high';
  }
  if (spec.blockUse !== CHART_BLOCK_USE) {
    return 'unknown';
  }
  if (!isRenderableChartSpecSnapshot(spec)) {
    return 'low';
  }
  if (spec.optionMode === 'custom' || hasEvents) {
    return 'low';
  }
  if (spec.queryMode === 'sql') {
    return 'medium';
  }
  return 'high';
}

export function normalizeVisualizationSpec(input = {}, options = {}) {
  const sourceInput = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const core = normalizeVisualizationSpecCore(input, options);
  const confidence = normalizeText(sourceInput.confidence) || guessVisualizationConfidence({
    ...core,
  });

  return {
    ...core,
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
  const metricField = chooseMetricField(availableFields, request);
  const measureField = metricField || chooseCountField(availableFields, dimension);
  const aggregation = metricField ? 'sum' : 'count';
  const measureAlias = measureField ? buildMeasureAlias(measureField, aggregation) : '';
  const measures = measureField
    ? [{ field: measureField, aggregation, alias: measureAlias }]
    : [];
  const dimensions = dimension ? [{ field: dimension }] : [];
  const optionBuilder = optionMode === 'basic'
    ? buildDefaultChartBuilder({
      chartType,
      dimensionField: dimension,
      measureAlias,
    })
    : null;
  const sqlMeasureExpression = measureField
    ? (metricField ? `sum(${measureField})` : `count(${measureField})`)
    : 'count(*)';
  const sqlSelect = dimension
    ? `${dimension}, ${sqlMeasureExpression} as ${measureAlias || 'metric_value'}`
    : `${sqlMeasureExpression} as ${measureAlias || 'metric_value'}`;
  const sqlGroupBy = dimension ? ` group by ${dimension}` : '';

  return normalizeVisualizationSpec({
    blockUse: CHART_BLOCK_USE,
    goal,
    queryMode,
    optionMode,
    dataSource: DEFAULT_CHART_DATA_SOURCE_KEY,
    metricOrDimension: dimension ? [dimension] : [],
    measures,
    dimensions,
    chartType,
    collectionPath: collectionName ? [DEFAULT_CHART_DATA_SOURCE_KEY, collectionName] : [],
    sqlDatasource: queryMode === 'sql' ? DEFAULT_CHART_DATA_SOURCE_KEY : '',
    sql: queryMode === 'sql'
      ? `SELECT ${sqlSelect} FROM ${collectionName || 'your_collection'}${sqlGroupBy}`
      : '',
    optionBuilder,
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
    fields: normalizeVisualizationFieldList(fields),
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
  measures = [],
  dimensions = [],
  chartType = 'bar',
  goal = 'distribution',
  optionMode = 'basic',
  optionBuilder = null,
  raw = '',
  eventsRaw = '',
} = {}) {
  const normalizedCollectionPath = collectionPath.length > 0
    ? collectionPath
    : (collectionName ? [DEFAULT_CHART_DATA_SOURCE_KEY, collectionName] : []);
  const normalizedMeasures = normalizeFieldDescriptorList(measures, 'measure');
  const normalizedDimensions = normalizeFieldDescriptorList(dimensions, 'dimension');
  const normalizedBuilder = normalizeBuilder(optionBuilder) || buildDefaultChartBuilder({
    chartType,
    dimensionField: normalizedDimensions[0]?.alias || serializeVisualizationFieldPath(normalizedDimensions[0]?.field),
    measureAlias: normalizedMeasures[0]?.alias || serializeVisualizationFieldPath(normalizedMeasures[0]?.field),
  });
  return buildVisualizationBlock({
    use: CHART_BLOCK_USE,
    title,
    collectionName: '',
    fields: [
      ...metricOrDimension,
      ...normalizedMeasures.map((item) => item.field),
      ...normalizedDimensions.map((item) => item.field),
    ],
    visualizationSpec: {
      blockUse: CHART_BLOCK_USE,
      goal,
      queryMode: 'builder',
      optionMode,
      dataSource: normalizedCollectionPath[0] || DEFAULT_CHART_DATA_SOURCE_KEY,
      metricOrDimension,
      measures: normalizedMeasures,
      dimensions: normalizedDimensions,
      chartType,
      collectionPath: normalizedCollectionPath,
      optionBuilder: normalizedBuilder,
      raw,
      eventsRaw,
    },
  });
}

export function buildChartBlockFromSqlSpec({
  title = '',
  collectionName = '',
  metricOrDimension = [],
  measures = [],
  dimensions = [],
  chartType = 'bar',
  goal = 'distribution',
  optionMode = 'basic',
  sqlDatasource = DEFAULT_CHART_DATA_SOURCE_KEY,
  sql = '',
  optionBuilder = null,
  raw = '',
  eventsRaw = '',
} = {}) {
  const normalizedMeasures = normalizeFieldDescriptorList(measures, 'measure');
  const normalizedDimensions = normalizeFieldDescriptorList(dimensions, 'dimension');
  return buildVisualizationBlock({
    use: CHART_BLOCK_USE,
    title,
    collectionName: '',
    fields: [
      ...metricOrDimension,
      ...normalizedMeasures.map((item) => item.field),
      ...normalizedDimensions.map((item) => item.field),
    ],
    visualizationSpec: {
      blockUse: CHART_BLOCK_USE,
      goal,
      queryMode: 'sql',
      optionMode,
      dataSource: sqlDatasource || DEFAULT_CHART_DATA_SOURCE_KEY,
      metricOrDimension,
      measures: normalizedMeasures,
      dimensions: normalizedDimensions,
      chartType,
      sqlDatasource,
      sql,
      optionBuilder: normalizeBuilder(optionBuilder) || buildDefaultChartBuilder({
        chartType,
        dimensionField: normalizedDimensions[0]?.alias || serializeVisualizationFieldPath(normalizedDimensions[0]?.field),
        measureAlias: normalizedMeasures[0]?.alias || serializeVisualizationFieldPath(normalizedMeasures[0]?.field),
      }),
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
