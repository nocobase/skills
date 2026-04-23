import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDynamicValidationScenario,
  splitValidationRequestIntoPageSpecs,
} from './validation_scenario_planner.mjs';

function collectLayoutUses(layout) {
  const uses = [];
  const visitBlocks = (blocks) => {
    for (const block of Array.isArray(blocks) ? blocks : []) {
      if (!block || typeof block !== 'object') {
        continue;
      }
      if (typeof block.use === 'string' && block.use.trim()) {
        uses.push(block.use.trim());
      }
      visitBlocks(block.blocks);
      if (Array.isArray(block.tabs)) {
        for (const tab of block.tabs) {
          visitBlocks(tab?.blocks);
        }
      }
    }
  };
  visitBlocks(layout?.blocks);
  if (Array.isArray(layout?.tabs)) {
    for (const tab of layout.tabs) {
      visitBlocks(tab?.blocks);
    }
  }
  return [...new Set(uses)];
}

function collectActionKinds(actionPlan = []) {
  return [...new Set((Array.isArray(actionPlan) ? actionPlan : []).map((item) => item?.kind).filter(Boolean))];
}

function makeInstanceInventory() {
  return {
    detected: true,
    flowSchema: {
      detected: true,
      rootPublicUses: [
        'TableBlockModel',
        'ListBlockModel',
        'DetailsBlockModel',
        'CreateFormModel',
        'EditFormModel',
        'GridCardBlockModel',
        'ChartBlockModel',
        'JSBlockModel',
        'MarkdownBlockModel',
        'CommentsBlockModel',
      ],
      publicUseCatalog: [
        {
          use: 'ListBlockModel',
          title: 'List',
          semanticTags: ['feed'],
          contextRequirements: [],
          unresolvedReasons: [],
        },
        {
          use: 'GridCardBlockModel',
          title: 'Grid card',
          semanticTags: ['metrics'],
          contextRequirements: [],
          unresolvedReasons: [],
        },
        {
          use: 'ChartBlockModel',
          title: 'Chart',
          semanticTags: ['analytics'],
          contextRequirements: [],
          unresolvedReasons: [],
        },
        {
          use: 'JSBlockModel',
          title: 'Custom JS',
          semanticTags: ['custom'],
          contextRequirements: [],
          unresolvedReasons: [],
        },
        {
          use: 'MarkdownBlockModel',
          title: 'Markdown',
          semanticTags: ['docs'],
          contextRequirements: [],
          unresolvedReasons: [],
        },
      ],
      missingUses: [],
      discoveryNotes: [],
    },
    collections: {
      detected: true,
      names: ['approvals'],
      byName: {
        approvals: {
          name: 'approvals',
          title: '审批单',
          titleField: 'title',
          fieldNames: ['title', 'status', 'applicant', 'createdAt'],
          scalarFieldNames: ['title', 'status', 'applicant', 'createdAt'],
          relationFields: [],
        },
      },
      discoveryNotes: [],
    },
  };
}

function buildPlannerResult({ caseRequest, caseId, planningMode } = {}) {
  const modeId = planningMode || 'dynamic';
  return buildDynamicValidationScenario({
    planningMode,
    caseRequest,
    sessionId: `sess-${caseId}-${modeId}`,
    baseSlug: `${caseId}-${modeId}`,
    candidatePageUrl: `http://localhost:23000/admin/${caseId}-${modeId}`,
    instanceInventory: makeInstanceInventory(),
  });
}

function collectFilterActionHostUses(result) {
  return [...new Set(
    (Array.isArray(result?.scenario?.actionPlan) ? result.scenario.actionPlan : [])
      .filter((item) => item?.kind === 'filter-action')
      .map((item) => item.hostUse)
      .filter(Boolean),
  )];
}

function assertFilterAction(result, expectedHostUses = [], exact = false) {
  assert.equal(collectActionKinds(result.scenario.actionPlan).includes('filter-action'), true);
  if (Array.isArray(expectedHostUses) && expectedHostUses.length > 0) {
    const actualHostUses = collectFilterActionHostUses(result);
    assert.equal(actualHostUses.some((hostUse) => expectedHostUses.includes(hostUse)), true);
    if (exact) {
      assert.deepEqual(actualHostUses, expectedHostUses);
    }
  }
}

function assertNoFilterAction(result) {
  assert.equal(collectActionKinds(result.scenario.actionPlan).includes('filter-action'), false);
}

test('dynamic scenario planner defaults to creative-first and emits five mixed recipe candidates', () => {
  const result = buildDynamicValidationScenario({
    caseRequest: '请生成 approvals 审批流程 validation 页面，展示 status applicant，并带筛选',
    sessionId: 'sess-approval',
    baseSlug: 'approvals',
    candidatePageUrl: 'http://localhost:23000/admin/approvals',
    instanceInventory: makeInstanceInventory(),
  });

  assert.equal(result.scenario.planningMode, 'creative-first');
  assert.equal(result.scenario.selectionMode, 'creative-first');
  assert.equal(result.scenario.planningStatus, 'ready');
  assert.deepEqual(result.scenario.targetCollections, ['approvals']);
  assert.deepEqual(result.scenario.explicitCollections, ['approvals']);
  assert.equal(result.scenario.primaryCollectionExplicit, true);
  assert.equal(result.scenario.layoutCandidates.length, 5);
  assert.deepEqual(
    result.scenario.layoutCandidates.map((item) => item.candidateId),
    ['keyword-anchor', 'content-control', 'collection-workbench', 'analytics-mix', 'tabbed-multi-surface'],
  );
  assert.equal(result.scenario.layoutCandidates.filter((item) => item.shape === 'single-main').length, 2);
  assert.equal(result.scenario.layoutCandidates.some((item) => item.shape === 'tabbed-multi-surface'), true);
  assert.equal(result.scenario.layoutCandidates.every((item) => Array.isArray(item.families) && item.families.length > 0), true);
  assert.equal(result.scenario.layoutCandidates.every((item) => Number.isFinite(item.score)), true);
  assert.equal(result.scenario.layoutCandidates.every((item) => Number.isFinite(item.semanticScore)), true);
  assert.equal(result.scenario.layoutCandidates.every((item) => Number.isFinite(item.creativeScore)), true);
  assert.equal(result.scenario.layoutCandidates.every((item) => Number.isFinite(item.stabilityScore)), true);
  assert.equal(result.scenario.eligibleUses.includes('GridCardBlockModel'), true);
  assert.equal(result.scenario.candidateShape['tabbed-multi-surface'], 'tabbed-multi-surface');
  assert.equal(result.scenario.candidateFamilies['collection-workbench'].includes('collection'), true);
  assert.equal(result.scenario.candidateScores['analytics-mix'].score > 0, true);
  assert.equal(result.scenario.selectedCandidateId.length > 0, true);
  assert.equal(Array.isArray(result.scenario.pagePlan.sections), true);
  assert.equal(result.scenario.pagePlan.sections.some((section) => section.role === 'controls'), false);
  assert.equal(result.scenario.layoutCandidates.every((item) => Array.isArray(item.pagePlan.sections)), true);
  assert.equal(
    result.scenario.layoutCandidates.find((item) => item.candidateId === 'tabbed-multi-surface')?.pagePlan?.tabs?.length,
    3,
  );
  assert.notEqual(result.buildSpecInput.layout.blocks[0].kind, 'Filter');
  assert.equal(collectActionKinds(result.scenario.actionPlan).includes('filter-action'), true);
  assert.equal(result.scenario.actionPlan.some((item) => item.kind === 'filter-action' && item.hostUse === 'GridCardBlockModel'), true);
  assert.equal(result.verifySpecInput.stages[0].trigger.text, '编辑审批单');
});

test('dynamic scenario planner only materializes FilterFormBlockModel for explicit filter-block intent', () => {
  const result = buildDynamicValidationScenario({
    caseRequest: '基于 approvals 做一个审批列表页，展示 status applicant，并增加筛选区块',
    sessionId: 'sess-filter-form',
    baseSlug: 'approvals-filter-form',
    candidatePageUrl: 'http://localhost:23000/admin/approvals-filter-form',
    instanceInventory: makeInstanceInventory(),
  });

  assert.equal(result.scenario.planningStatus, 'ready');
  assert.equal(result.buildSpecInput.layout.blocks[0].kind, 'Filter');
  assert.equal(result.scenario.pagePlan.sections[0].role, 'controls');
  assert.equal(collectActionKinds(result.scenario.actionPlan).includes('filter-action'), false);
});

const SEARCH_INTENT_CASES = [
  {
    caseId: 'search-form',
    caseRequest: '基于 approvals 做一个审批列表页，展示 status applicant，并增加搜索区块',
    expectation: 'filter-form',
  },
  {
    caseId: 'search-bound',
    caseRequest: '基于 approvals 做一个审批列表页，展示 status applicant，并增加搜索功能',
    expectation: 'filter-action',
    expectedHostUses: ['ListBlockModel'],
    exactHostUses: true,
    expectNoControlsSection: true,
  },
  {
    caseId: 'search-cross-sentence',
    caseRequest: '基于 approvals 做一个审批列表页。增加搜索功能，展示 status applicant',
    expectation: 'filter-action',
    expectedHostUses: ['ListBlockModel'],
    exactHostUses: true,
  },
  {
    caseId: 'search-page-table-action',
    caseRequest: '基于 approvals 做一个搜索结果页，用表格展示结果，并给表格增加搜索功能',
    expectation: 'filter-action',
    expectedHostUses: ['TableBlockModel'],
    exactHostUses: true,
  },
  {
    caseId: 'search-cross-sentence-bare-host',
    caseRequest: '基于 approvals 做一个审批列表。增加搜索功能，展示 status applicant',
    expectation: 'filter-action',
    expectedHostUses: ['ListBlockModel'],
    exactHostUses: true,
  },
  {
    caseId: 'search-list-view-cross-sentence',
    caseRequest: '基于 approvals 创建一个审批列表视图。增加搜索功能，展示 status applicant',
    expectation: 'filter-action',
    expectedHostUses: ['ListBlockModel'],
    exactHostUses: true,
  },
  {
    caseId: 'searchable-list-view',
    caseRequest: 'build an approvals list view. add search',
    expectation: 'filter-action',
    expectedHostUses: ['ListBlockModel'],
    exactHostUses: true,
  },
  {
    caseId: 'searchable-list',
    caseRequest: '做一个 searchable approvals list page，展示 status applicant',
    expectation: 'filter-action',
    expectedHostUses: ['ListBlockModel'],
    exactHostUses: true,
  },
  {
    caseId: 'search-card',
    caseRequest: '基于 approvals 做一个审批卡片页，展示 status applicant，并增加搜索功能',
    expectation: 'filter-action',
    expectedHostUses: ['GridCardBlockModel'],
    exactHostUses: true,
  },
  {
    caseId: 'search-results-table-action-english',
    caseRequest: 'build a search results list page for approvals, use a table for results, and add search to the table',
    expectation: 'filter-action',
    expectedHostUses: ['TableBlockModel'],
    exactHostUses: true,
  },
  {
    caseId: 'hostless-english-search',
    caseRequest: 'build a help center page with search for approvals',
    expectation: 'none',
  },
  {
    caseId: 'hostless-english-searchable',
    caseRequest: 'build a searchable help center page for approvals',
    expectation: 'none',
  },
  {
    caseId: 'search-page',
    caseRequest: '做一个搜索页，用来展示帮助文档入口',
    expectation: 'none',
  },
  {
    caseId: 'search-list-page',
    caseRequest: '做一个搜索页，用列表展示帮助文档入口',
    expectation: 'none',
  },
  {
    caseId: 'search-page-verb',
    caseRequest: '做一个搜索页，用列表展示帮助文档入口，并支持搜索',
    expectation: 'none',
  },
  {
    caseId: 'search-list-page-verb',
    caseRequest: '做一个搜索列表页，并支持搜索',
    expectation: 'none',
  },
  {
    caseId: 'search-results-list-page-verb',
    caseRequest: '做一个搜索结果列表页，并支持搜索',
    expectation: 'none',
  },
  {
    caseId: 'search-list-page-with-collection',
    caseRequest: '基于 approvals 做一个搜索列表页，并支持搜索',
    expectation: 'none',
  },
  {
    caseId: 'search-list-page-english',
    caseRequest: 'build a search list page and support search',
    expectation: 'none',
  },
  {
    caseId: 'search-results-list-page-english',
    caseRequest: 'build a search results list page with search',
    expectation: 'none',
  },
  {
    caseId: 'help-center-list-search',
    caseRequest: '基于 approvals 做一个帮助中心页面，用列表展示审批入口，并支持搜索',
    expectation: 'none',
  },
  {
    caseId: 'search-portal-searchable-list',
    caseRequest: 'build a search portal with a searchable approvals list',
    expectation: 'none',
  },
  {
    caseId: 'search-portal-searchable-list-cn',
    caseRequest: '做一个搜索门户，用可搜索列表展示审批入口',
    expectation: 'none',
  },
];

for (const planningMode of [undefined, 'stable-first']) {
  const planningModeLabel = planningMode || 'dynamic';
  for (const searchCase of SEARCH_INTENT_CASES) {
    test(`${planningModeLabel} scenario ${searchCase.caseId} keeps search-vs-filter intent stable`, () => {
      const result = buildPlannerResult({
        caseRequest: searchCase.caseRequest,
        caseId: searchCase.caseId,
        planningMode,
      });

      if (planningMode) {
        assert.equal(result.scenario.planningMode, planningMode);
      }
      assert.equal(result.scenario.planningStatus, 'ready');
      assert.equal(result.scenario.planningBlockers.some((item) => item.code === 'FILTER_COLLECTION_UNRESOLVED'), false);

      if (searchCase.expectation === 'filter-form') {
        assert.equal(result.buildSpecInput.layout.blocks[0].kind, 'Filter');
        assert.equal(result.scenario.pagePlan.sections[0].role, 'controls');
        assertNoFilterAction(result);
        return;
      }

      if (searchCase.expectation === 'filter-action') {
        assert.notEqual(result.buildSpecInput.layout.blocks[0].kind, 'Filter');
        if (searchCase.expectNoControlsSection) {
          assert.equal(result.scenario.pagePlan.sections.some((section) => section.role === 'controls'), false);
        }
        assertFilterAction(result, searchCase.expectedHostUses, searchCase.exactHostUses === true);
        return;
      }

      assertNoFilterAction(result);
      assert.equal(result.scenario.layoutCandidates.length > 0, true);
    });
  }
}

test('dynamic scenario planner prefers explicit block keywords when the anchor block is eligible', () => {
  const result = buildDynamicValidationScenario({
    caseRequest: '基于 approvals 做一个 chart 分析页面，展示 status applicant，并带筛选',
    sessionId: 'sess-chart',
    baseSlug: 'approvals-chart',
    candidatePageUrl: 'http://localhost:23000/admin/approvals-chart',
    instanceInventory: makeInstanceInventory(),
  });

  const selectedCandidate = result.scenario.layoutCandidates.find((item) => item.selected);
  assert.ok(selectedCandidate);
  assert.equal(result.scenario.selectedCandidateId, selectedCandidate.candidateId);
  assert.equal(selectedCandidate.primaryBlockType, 'ChartBlockModel');
});

test('dynamic scenario planner keeps chart eligible when runtime hints are covered by visualization contracts', () => {
  const inventory = makeInstanceInventory();
  inventory.flowSchema.publicUseCatalog = inventory.flowSchema.publicUseCatalog.map((entry) => {
    if (entry.use !== 'ChartBlockModel') {
      return entry;
    }
    return {
      ...entry,
      contextRequirements: ['collection metadata', 'query builder', 'chart builder', 'RunJS'],
      unresolvedReasons: ['runtime-chart-query-config', 'runtime-chart-option-builder'],
    };
  });

  const result = buildDynamicValidationScenario({
    caseRequest: '基于 approvals 做一个趋势总览看板，展示 status applicant createdAt，并带筛选',
    sessionId: 'sess-chart-runtime-hints',
    baseSlug: 'approvals-chart-runtime-hints',
    candidatePageUrl: 'http://localhost:23000/admin/approvals-chart-runtime-hints',
    instanceInventory: inventory,
  });

  const selectedCandidate = result.scenario.layoutCandidates.find((item) => item.selected);
  assert.ok(selectedCandidate);
  assert.equal(result.scenario.eligibleUses.includes('ChartBlockModel'), true);
  assert.equal(result.scenario.discardedUses.some((item) => item.use === 'ChartBlockModel'), false);
  assert.equal(selectedCandidate.primaryBlockType, 'ChartBlockModel');
});

test('dynamic scenario planner emits visualizationSpec for selected chart layouts', () => {
  const result = buildDynamicValidationScenario({
    caseRequest: '基于 approvals 创建一个总览趋势分析看板，展示 status applicant createdAt，并带筛选',
    sessionId: 'sess-chart-visualization-spec',
    baseSlug: 'approvals-chart-visualization-spec',
    candidatePageUrl: 'http://localhost:23000/admin/approvals-chart-visualization-spec',
    instanceInventory: makeInstanceInventory(),
  });

  const selectedCandidate = result.scenario.layoutCandidates.find((item) => item.selected);
  assert.ok(selectedCandidate);
  assert.equal(Array.isArray(result.scenario.visualizationSpec), true);
  assert.equal(result.scenario.visualizationSpec.length > 0, true);
  assert.equal(selectedCandidate.visualizationSpec.length > 0, true);
  assert.equal(selectedCandidate.visualizationSpec[0].blockUse, 'ChartBlockModel');
  assert.equal(selectedCandidate.visualizationSpec[0].queryMode, 'builder');
  assert.equal(selectedCandidate.plannedCoverage.patterns.includes('insight-visualization'), true);
  assert.equal(selectedCandidate.plannedCoverage.patterns.includes('chart-builder'), true);
});

test('dynamic scenario planner keeps insight-first selection without forcing table or details and promotes JS as an insight peer', () => {
  const result = buildDynamicValidationScenario({
    caseRequest: '基于 approvals 做一个交互式总览页面，需要图表、指标卡和自定义说明层，并带筛选',
    sessionId: 'sess-insight-first-js-peer',
    baseSlug: 'approvals-insight-first-js-peer',
    candidatePageUrl: 'http://localhost:23000/admin/approvals-insight-first-js-peer',
    instanceInventory: makeInstanceInventory(),
  });

  const selectedCandidate = result.scenario.layoutCandidates.find((item) => item.selected);
  const selectedUses = collectLayoutUses(selectedCandidate?.layout);

  assert.ok(selectedCandidate);
  assert.equal(result.scenario.creativeIntent, 'insight-first');
  assert.equal(selectedCandidate.creativeIntent, 'insight-first');
  assert.equal(result.scenario.selectedInsightStrategy.includes('js'), true);
  assert.equal(selectedCandidate.selectedInsightStrategy.includes('js'), true);
  assert.equal(result.scenario.jsExpansionHints.includes('interactive-insight-layer'), true);
  assert.equal(result.scenario.jsExpansionHints.includes('narrative-explanation-layer'), true);
  assert.equal(result.scenario.jsExpansionHints.includes('custom-insight-surface'), true);
  assert.equal(result.scenario.jsExpansionHints.includes('selected-js-peer'), true);
  assert.equal(selectedUses.includes('ChartBlockModel'), true);
  assert.equal(selectedUses.includes('JSBlockModel'), true);
  assert.equal(selectedUses.includes('TableBlockModel'), false);
  assert.equal(selectedUses.includes('DetailsBlockModel'), false);
});

test('dynamic scenario planner uses JS blocks for numeric aggregation dashboards that explicitly avoid charts', () => {
  const result = buildDynamicValidationScenario({
    caseRequest: '基于 approvals 做一个审批汇总指标页面，展示总数和平均处理时长，不要图表，并带筛选',
    sessionId: 'sess-js-aggregation',
    baseSlug: 'approvals-js-aggregation',
    candidatePageUrl: 'http://localhost:23000/admin/approvals-js-aggregation',
    instanceInventory: makeInstanceInventory(),
  });

  const selectedCandidate = result.scenario.layoutCandidates.find((item) => item.selected);
  const selectedUses = collectLayoutUses(selectedCandidate?.layout);

  assert.ok(selectedCandidate);
  assert.equal(result.scenario.primaryBlockType, 'JSBlockModel');
  assert.equal(selectedUses.includes('JSBlockModel'), true);
  assert.equal(selectedUses.includes('ChartBlockModel'), false);
});

test('dynamic scenario planner discards runtime-sensitive public uses instead of putting them into final candidates', () => {
  const inventory = makeInstanceInventory();
  inventory.flowSchema.rootPublicUses = ['TableBlockModel', 'CommentsBlockModel', 'ReferenceBlockModel'];
  inventory.flowSchema.publicUseCatalog = [
    {
      use: 'ReferenceBlockModel',
      title: 'Reference block',
      contextRequirements: ['target block uid'],
      unresolvedReasons: ['reference-target-required'],
      semanticTags: ['template'],
    },
  ];

  const result = buildDynamicValidationScenario({
    caseRequest: '基于 approvals 创建一个创意页面，展示 status applicant',
    sessionId: 'sess-comments',
    baseSlug: 'approvals-comments',
    candidatePageUrl: 'http://localhost:23000/admin/approvals-comments',
    instanceInventory: inventory,
  });

  assert.equal(result.scenario.discardedUses.some((item) => item.use === 'CommentsBlockModel'), true);
  assert.equal(result.scenario.discardedUses.some((item) => item.use === 'ReferenceBlockModel'), true);
  assert.equal(
    result.scenario.layoutCandidates.some((candidate) => candidate.primaryBlockType === 'CommentsBlockModel'),
    false,
  );
  assert.equal(
    result.scenario.layoutCandidates.some((candidate) => candidate.primaryBlockType === 'ReferenceBlockModel'),
    false,
  );
});

test('page spec splitter decomposes numbered multi-page requests into page-level specs', () => {
  const result = splitValidationRequestIntoPageSpecs({
    caseRequest: '基于 approvals 创建两个页面：1. 审批列表页，展示 status applicant，并带筛选；2. 审批详情页，展示 title status createdAt。',
    collectionsInventory: makeInstanceInventory().collections,
  });

  assert.equal(result.requestedPageCount, 2);
  assert.equal(result.decompositionMode, 'numbered-page-sections');
  assert.equal(result.blockers.length, 0);
  assert.equal(result.pageRequests.length, 2);
  assert.match(result.pageRequests[0].requestText, /审批列表页/);
  assert.match(result.pageRequests[1].requestText, /审批详情页/);
  assert.deepEqual(result.pageRequests[0].explicitCollections, ['approvals']);
  assert.deepEqual(result.pageRequests[1].explicitCollections, ['approvals']);
  assert.equal(result.systemIntent, false);
  assert.equal(result.groupTitleHint, '审批单');
});

test('page spec splitter marks system-level single-page requests for grouped menu placement', () => {
  const result = splitValidationRequestIntoPageSpecs({
    caseRequest: '基于 approvals 创建一个审批工作台，展示 status applicant，并带筛选。',
    collectionsInventory: makeInstanceInventory().collections,
  });

  assert.equal(result.requestedPageCount, 1);
  assert.equal(result.decompositionMode, 'single-page');
  assert.equal(result.systemIntent, true);
  assert.equal(result.groupTitleHint, '审批工作台');
  assert.equal(result.pageRequests.length, 1);
});
