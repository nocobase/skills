import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildChartBlockFromBuilderSpec,
  buildChartBlockFromSqlSpec,
  buildGridCardBlockFromMetrics,
  evaluateVisualizationUseEligibility,
  guessVisualizationConfidence,
  inferChartSpecFromCollection,
  isVisualizationRuntimeSensitive,
  normalizeVisualizationSpec,
} from './visualization_contracts.mjs';

test('inferChartSpecFromCollection infers builder/basic line chart for trend requests', () => {
  const result = inferChartSpecFromCollection({
    requestText: '做一个订单趋势图，按 createdAt 展示变化',
    collectionMeta: {
      name: 'orders',
      scalarFieldNames: ['status', 'createdAt', 'amount'],
    },
    requestedFields: ['createdAt'],
    resolvedFields: ['createdAt', 'status'],
  });

  assert.equal(result.blockUse, 'ChartBlockModel');
  assert.equal(result.queryMode, 'builder');
  assert.equal(result.optionMode, 'basic');
  assert.equal(result.chartType, 'line');
  assert.deepEqual(result.collectionPath, ['main', 'orders']);
  assert.deepEqual(result.metricOrDimension, ['createdAt']);
  assert.deepEqual(result.measures, [{ field: 'amount', aggregation: 'sum', alias: 'sum_amount' }]);
  assert.deepEqual(result.dimensions, [{ field: 'createdAt' }]);
  assert.deepEqual(result.optionBuilder, { type: 'line', xField: 'createdAt', yField: 'sum_amount' });
});

test('buildChartBlockFromSqlSpec creates chart public-use block with normalized visualizationSpec', () => {
  const block = buildChartBlockFromSqlSpec({
    title: '资产 SQL 图表',
    collectionName: 'pam_assets',
    metricOrDimension: ['status'],
    measures: [{ field: 'current_value', aggregation: 'sum', alias: 'sum_current_value' }],
    dimensions: [{ field: 'status' }],
    sql: 'select status, count(*) as total from pam_assets group by status',
    optionMode: 'custom',
    raw: 'return option;',
  });

  assert.equal(block.kind, 'PublicUse');
  assert.equal(block.use, 'ChartBlockModel');
  assert.equal(block.visualizationSpec.queryMode, 'sql');
  assert.equal(block.visualizationSpec.optionMode, 'custom');
  assert.equal(block.visualizationSpec.sqlDatasource, 'main');
  assert.deepEqual(block.visualizationSpec.measures, [{ field: 'current_value', aggregation: 'sum', alias: 'sum_current_value' }]);
  assert.equal(block.visualizationSpec.confidence, 'low');
});

test('buildGridCardBlockFromMetrics creates high-confidence metrics block', () => {
  const block = buildGridCardBlockFromMetrics({
    title: '资产概览',
    collectionName: 'pam_assets',
    metrics: ['status', 'current_value'],
  });

  assert.equal(block.use, 'GridCardBlockModel');
  assert.deepEqual(block.fields, ['status', 'current_value']);
  assert.equal(block.visualizationSpec.confidence, 'high');
  assert.equal(isVisualizationRuntimeSensitive(block.visualizationSpec), false);
});

test('evaluateVisualizationUseEligibility allows supported chart dynamic hints', () => {
  const result = evaluateVisualizationUseEligibility({
    use: 'ChartBlockModel',
    contextRequirements: ['collection metadata', 'query builder', 'chart builder'],
    unresolvedReasons: ['runtime-chart-query-config', 'runtime-chart-option-builder'],
    collectionMeta: { name: 'orders' },
  });

  assert.equal(result.eligible, true);
  assert.equal(result.confidence, 'medium');
});

test('guessVisualizationConfidence treats sql/basic as medium and custom/evented chart as low', () => {
  assert.equal(guessVisualizationConfidence({
    blockUse: 'ChartBlockModel',
    queryMode: 'sql',
    optionMode: 'basic',
    sqlDatasource: 'main',
    sql: 'select status, count(*) as count_title from orders group by status',
    optionBuilder: { type: 'bar', xField: 'status', yField: 'count_title' },
  }), 'medium');

  assert.equal(guessVisualizationConfidence({
    blockUse: 'ChartBlockModel',
    queryMode: 'builder',
    optionMode: 'custom',
  }), 'low');

  assert.equal(guessVisualizationConfidence({
    blockUse: 'ChartBlockModel',
    queryMode: 'builder',
    optionMode: 'basic',
    eventsRaw: 'return {};',
  }), 'low');
});

test('normalizeVisualizationSpec keeps fallback block use and normalizes arrays', () => {
  const result = normalizeVisualizationSpec({
    blockUse: 'ChartBlockModel',
    queryMode: 'builder',
    optionMode: 'basic',
    collectionPath: ['main', 'orders'],
    measures: [{ field: 'amount', aggregation: 'sum', alias: 'sum_amount' }],
    optionBuilder: { type: 'bar', xField: 'status', yField: 'sum_amount' },
    metricOrDimension: ['status', 'status', 'category'],
  });

  assert.equal(result.fallbackBlockUse, 'TableBlockModel');
  assert.deepEqual(result.collectionPath, ['main', 'orders']);
  assert.deepEqual(result.measures, [{ field: 'amount', aggregation: 'sum', alias: 'sum_amount' }]);
  assert.deepEqual(result.metricOrDimension, ['status', 'category']);
});

test('buildChartBlockFromBuilderSpec produces high-confidence builder chart block', () => {
  const block = buildChartBlockFromBuilderSpec({
    title: '状态分布',
    collectionName: 'pam_assets',
    metricOrDimension: ['status'],
    measures: [{ field: 'current_value', aggregation: 'sum', alias: 'sum_current_value' }],
    dimensions: [{ field: 'status' }],
    optionBuilder: { type: 'pie', pieCategory: 'status', pieValue: 'sum_current_value' },
  });

  assert.equal(block.use, 'ChartBlockModel');
  assert.deepEqual(block.visualizationSpec.collectionPath, ['main', 'pam_assets']);
  assert.deepEqual(block.visualizationSpec.measures, [{ field: 'current_value', aggregation: 'sum', alias: 'sum_current_value' }]);
  assert.equal(block.visualizationSpec.confidence, 'high');
});

test('buildChartBlockFromBuilderSpec preserves relation array paths and stringifies block fields', () => {
  const block = buildChartBlockFromBuilderSpec({
    title: '分类支出',
    collectionName: 'mb_transactions',
    metricOrDimension: [['category', 'category_type']],
    measures: [{ field: 'amount', aggregation: 'sum', alias: 'sum_amount' }],
    dimensions: [{ field: ['category', 'category_type'], alias: 'category_type' }],
    optionBuilder: { type: 'bar', xField: 'category_type', yField: 'sum_amount' },
  });

  assert.deepEqual(block.visualizationSpec.collectionPath, ['main', 'mb_transactions']);
  assert.deepEqual(block.visualizationSpec.dimensions, [{ field: ['category', 'category_type'], alias: 'category_type' }]);
  assert.deepEqual(block.fields, ['category.category_type', 'amount']);
});

test('guessVisualizationConfidence downgrades incomplete builder charts', () => {
  assert.equal(guessVisualizationConfidence({
    blockUse: 'ChartBlockModel',
    queryMode: 'builder',
    optionMode: 'basic',
    collectionPath: ['main', 'orders'],
  }), 'low');
});
