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
  assert.deepEqual(result.metricOrDimension, ['createdAt']);
});

test('buildChartBlockFromSqlSpec creates chart public-use block with normalized visualizationSpec', () => {
  const block = buildChartBlockFromSqlSpec({
    title: '资产 SQL 图表',
    collectionName: 'pam_assets',
    metricOrDimension: ['status'],
    sql: 'select status, count(*) as total from pam_assets group by status',
    optionMode: 'custom',
    raw: 'return option;',
  });

  assert.equal(block.kind, 'PublicUse');
  assert.equal(block.use, 'ChartBlockModel');
  assert.equal(block.visualizationSpec.queryMode, 'sql');
  assert.equal(block.visualizationSpec.optionMode, 'custom');
  assert.equal(block.visualizationSpec.sqlDatasource, 'main');
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
    metricOrDimension: ['status', 'status', 'category'],
  });

  assert.equal(result.fallbackBlockUse, 'TableBlockModel');
  assert.deepEqual(result.metricOrDimension, ['status', 'category']);
});

test('buildChartBlockFromBuilderSpec produces high-confidence builder chart block', () => {
  const block = buildChartBlockFromBuilderSpec({
    title: '状态分布',
    collectionName: 'pam_assets',
    metricOrDimension: ['status'],
  });

  assert.equal(block.use, 'ChartBlockModel');
  assert.deepEqual(block.visualizationSpec.collectionPath, ['pam_assets']);
  assert.equal(block.visualizationSpec.confidence, 'high');
});
