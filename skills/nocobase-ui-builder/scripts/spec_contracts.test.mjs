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
    collectionPath: ['approvals'],
    metricOrDimension: ['createdAt', 'status'],
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
  assert.deepEqual(normalized.layout.blocks[0].visualizationSpec.collectionPath, ['approvals']);
  assert.equal(normalized.scenario.visualizationSpec[0].blockUse, 'ChartBlockModel');
  assert.equal(normalized.scenario.layoutCandidates[0].visualizationSpec[0].chartType, 'line');
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
