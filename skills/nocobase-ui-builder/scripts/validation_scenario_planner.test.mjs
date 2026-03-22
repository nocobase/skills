import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDynamicValidationScenario,
  splitValidationRequestIntoPageSpecs,
} from './validation_scenario_planner.mjs';

function makeInstanceInventory() {
  return {
    detected: true,
    flowSchema: {
      detected: true,
      rootPublicUses: [
        'TableBlockModel',
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
  assert.equal(result.buildSpecInput.layout.blocks[0].kind, 'Filter');
  assert.equal(['新建审批单', '编辑审批单'].includes(result.verifySpecInput.stages[0].trigger.text), true);
});

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
