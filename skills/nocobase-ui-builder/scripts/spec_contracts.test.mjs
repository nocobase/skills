import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileBuildSpec,
  normalizeBuildSpec,
} from './spec_contracts.mjs';

function makePagePlan(title = '审批分析页') {
  return {
    version: 'page-first-v1',
    title,
    structureKind: 'focus-stack',
    designRationale: [],
    sections: [],
    tabs: [],
  };
}

function makeBuildSpecInput({ visualizationSpec } = {}) {
  const chartSpec = visualizationSpec || {
    blockUse: 'ChartBlockModel',
    goal: 'trend',
    queryMode: 'builder',
    optionMode: 'basic',
    collectionPath: ['main', 'approvals'],
    metricOrDimension: ['createdAt', 'status'],
    measures: [{ field: 'title', aggregation: 'count', alias: 'count_title' }],
    dimensions: [{ field: 'createdAt' }],
    optionBuilder: { type: 'line', xField: 'createdAt', yField: 'count_title' },
    chartType: 'line',
    confidence: 'high',
  };

  return {
    target: {
      title: '审批分析页',
    },
    layout: {
      pageUse: 'RootPageModel',
      blocks: [
        {
          kind: 'PublicUse',
          use: 'ChartBlockModel',
          title: '审批趋势',
          visualizationSpec: chartSpec,
        },
      ],
      tabs: [],
    },
    dataBindings: {
      collections: [],
      relations: [],
    },
    requirements: {},
    scenario: {
      id: 'scenario:approvals:chart',
      title: '审批分析页',
      summary: '审批图表',
      planningMode: 'creative-first',
      creativeIntent: 'insight-first',
      selectedInsightStrategy: 'chart-js-mix',
      jsExpansionHints: ['interactive-insight-layer', 'selected-js-peer'],
      selectionMode: 'creative-first',
      primaryBlockType: 'ChartBlockModel',
      plannedCoverage: {
        blocks: ['ChartBlockModel'],
        patterns: ['insight-visualization'],
      },
      visualizationSpec: [chartSpec],
      actionPlan: [],
      planningBlockers: [],
      pagePlan: makePagePlan(),
      layoutCandidates: [
        {
          candidateId: 'selected-primary',
          title: '审批分析页',
          summary: '审批图表',
          selected: true,
          creativeIntent: 'insight-first',
          selectedInsightStrategy: 'chart-js-mix',
          jsExpansionHints: ['interactive-insight-layer', 'selected-js-peer'],
          primaryBlockType: 'ChartBlockModel',
          plannedCoverage: {
            blocks: ['ChartBlockModel'],
            patterns: ['insight-visualization'],
          },
          visualizationSpec: [chartSpec],
          pagePlan: makePagePlan(),
          layout: {
            pageUse: 'RootPageModel',
            blocks: [
              {
                kind: 'PublicUse',
                use: 'ChartBlockModel',
                title: '审批趋势',
                visualizationSpec: chartSpec,
              },
            ],
            tabs: [],
          },
        },
      ],
      selectedCandidateId: 'selected-primary',
    },
  };
}

test('normalizeBuildSpec preserves visualizationSpec on blocks, candidates and scenario', () => {
  const normalized = normalizeBuildSpec(makeBuildSpecInput());

  assert.equal(normalized.layout.blocks[0].visualizationSpec.blockUse, 'ChartBlockModel');
  assert.equal(normalized.layout.blocks[0].visualizationSpec.queryMode, 'builder');
  assert.deepEqual(normalized.layout.blocks[0].visualizationSpec.collectionPath, ['main', 'approvals']);
  assert.deepEqual(normalized.layout.blocks[0].visualizationSpec.measures, [{ field: 'title', aggregation: 'count', alias: 'count_title' }]);
  assert.equal(normalized.scenario.visualizationSpec[0].blockUse, 'ChartBlockModel');
  assert.equal(normalized.scenario.layoutCandidates[0].visualizationSpec[0].chartType, 'line');
});

test('normalizeBuildSpec preserves insight-first metadata on scenario and candidates', () => {
  const normalized = normalizeBuildSpec(makeBuildSpecInput());

  assert.equal(normalized.scenario.creativeIntent, 'insight-first');
  assert.equal(normalized.scenario.selectedInsightStrategy, 'chart-js-mix');
  assert.deepEqual(normalized.scenario.jsExpansionHints, ['interactive-insight-layer', 'selected-js-peer']);
  assert.equal(normalized.scenario.layoutCandidates[0].creativeIntent, 'insight-first');
  assert.equal(normalized.scenario.layoutCandidates[0].selectedInsightStrategy, 'chart-js-mix');
  assert.deepEqual(normalized.scenario.layoutCandidates[0].jsExpansionHints, ['interactive-insight-layer', 'selected-js-peer']);
});

test('compileBuildSpec marks runtime-sensitive visualization blocks and keeps visualization coverage', () => {
  const compiled = compileBuildSpec(makeBuildSpecInput({
    visualizationSpec: {
      blockUse: 'ChartBlockModel',
      goal: 'distribution',
      queryMode: 'sql',
      optionMode: 'custom',
      sqlDatasource: 'main',
      sql: 'select status, count(*) from approvals group by status',
      raw: 'return option;',
      chartType: 'bar',
      confidence: 'low',
    },
  }));

  assert.equal(compiled.compileArtifact.guardRequirements.metadataTrust.runtimeSensitive, 'unknown');
  assert.equal(compiled.compileArtifact.generatedCoverage.patterns.includes('insight-visualization'), true);
  assert.equal(compiled.compileArtifact.generatedCoverage.patterns.includes('chart-sql'), true);
  assert.equal(compiled.compileArtifact.generatedCoverage.patterns.includes('chart-custom-option'), true);
  assert.equal(compiled.compileArtifact.visualizationSpec[0].queryMode, 'sql');
});

test('compileBuildSpec keeps insight-first metadata in compile artifacts and candidate builds', () => {
  const compiled = compileBuildSpec(makeBuildSpecInput());
  const selectedCandidateBuild = compiled.compileArtifact.candidateBuilds.find((item) => item.candidateId === 'selected-primary');

  assert.equal(compiled.compileArtifact.creativeIntent, 'insight-first');
  assert.equal(compiled.compileArtifact.selectedInsightStrategy, 'chart-js-mix');
  assert.deepEqual(compiled.compileArtifact.jsExpansionHints, ['interactive-insight-layer', 'selected-js-peer']);
  assert.ok(selectedCandidateBuild);
  assert.equal(selectedCandidateBuild.compileArtifact.creativeIntent, 'insight-first');
  assert.equal(selectedCandidateBuild.compileArtifact.selectedInsightStrategy, 'chart-js-mix');
  assert.deepEqual(
    selectedCandidateBuild.compileArtifact.jsExpansionHints,
    ['interactive-insight-layer', 'selected-js-peer'],
  );
});

test('compileBuildSpec stringifies relation chart field refs into required metadata', () => {
  const compiled = compileBuildSpec(makeBuildSpecInput({
    visualizationSpec: {
      blockUse: 'ChartBlockModel',
      goal: 'distribution',
      queryMode: 'builder',
      optionMode: 'basic',
      collectionPath: ['main', 'mb_transactions'],
      metricOrDimension: ['category.category_type'],
      measures: [{ field: 'amount', aggregation: 'sum', alias: 'sum_amount' }],
      dimensions: [{ field: ['category', 'category_type'], alias: 'category_type' }],
      optionBuilder: { type: 'bar', xField: 'category_type', yField: 'sum_amount' },
      chartType: 'bar',
      confidence: 'high',
    },
  }));

  assert.equal(compiled.compileArtifact.requiredMetadataRefs.fields.includes('mb_transactions.amount'), true);
  assert.equal(compiled.compileArtifact.requiredMetadataRefs.fields.includes('mb_transactions.category.category_type'), true);
});
