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
      rootPublicUses: ['TableBlockModel', 'DetailsBlockModel', 'CreateFormModel', 'EditFormModel', 'JSBlockModel'],
      publicUseCatalog: [],
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

function makeInventoryWithRuntimeCatalog() {
  const inventory = makeInstanceInventory();
  inventory.flowSchema.publicUseCatalog = [
    {
      use: 'TableBlockModel',
      title: 'Table',
      contextRequirements: ['collection metadata', 'table column bindings'],
      unresolvedReasons: ['runtime-table-columns'],
    },
    {
      use: 'FilterFormBlockModel',
      title: 'Filter',
      contextRequirements: ['filter target block'],
      unresolvedReasons: ['runtime-filter-form-items'],
    },
    {
      use: 'ActionPanelBlockModel',
      title: 'Action Panel',
      contextRequirements: ['collection action registry'],
      unresolvedReasons: ['runtime-block-grid-items'],
    },
  ];
  return inventory;
}

test('dynamic scenario planner uses collection-first deterministic planning when live collections are available', () => {
  const result = buildDynamicValidationScenario({
    caseRequest: '请生成 approvals 审批流程 validation 页面，展示 status applicant，并带筛选',
    sessionId: 'sess-approval',
    baseSlug: 'approvals',
    candidatePageUrl: 'http://localhost:23000/admin/approvals',
    instanceInventory: makeInstanceInventory(),
  });

  assert.equal(result.scenario.id, 'collection-first:approvals:single-table');
  assert.equal(result.scenario.selectionMode, 'collection-first');
  assert.equal(result.scenario.primaryBlockType, 'TableBlockModel');
  assert.deepEqual(result.scenario.targetCollections, ['approvals']);
  assert.deepEqual(result.scenario.explicitCollections, ['approvals']);
  assert.equal(result.scenario.primaryCollectionExplicit, true);
  assert.deepEqual(result.scenario.requestedFields, ['status', 'applicant']);
  assert.deepEqual(result.scenario.resolvedFields, ['status', 'applicant']);
  assert.equal(result.scenario.planningStatus, 'ready');
  assert.equal(result.scenario.creativeProgram.strategy, 'collection-first');
  assert.equal(result.scenario.selectedCandidateId, 'selected-primary');
  assert.equal(result.scenario.layoutCandidates.length >= 2, true);
  assert.equal(result.scenario.randomPolicy.mode, 'deterministic');
  assert.equal(result.scenario.plannedCoverage.blocks.includes('TableBlockModel'), true);
  assert.equal(result.scenario.plannedCoverage.blocks.includes('FilterFormBlockModel'), true);
  assert.equal(result.scenario.plannedCoverage.patterns.includes('record-actions'), true);
  assert.equal(result.scenario.actionPlan.some((item) => item.kind === 'delete-record'), true);
  assert.equal(result.buildSpecInput.layout.blocks[0].kind, 'Filter');
  assert.equal(result.verifySpecInput.stages[0].trigger.text, '新建审批单');
});

test('dynamic scenario planner keeps deterministic blocked output when no collection inventory is available', () => {
  const first = buildDynamicValidationScenario({
    caseRequest: '请帮我搭一个运营页面',
    sessionId: 'sess-generic-1',
    baseSlug: 'ops',
    candidatePageUrl: 'http://localhost:23000/admin/ops-1',
  });
  const second = buildDynamicValidationScenario({
    caseRequest: '请帮我搭一个运营页面',
    sessionId: 'sess-generic-2',
    baseSlug: 'ops',
    candidatePageUrl: 'http://localhost:23000/admin/ops-2',
  });

  assert.equal(first.scenario.id, second.scenario.id);
  assert.deepEqual(first.buildSpecInput.layout, second.buildSpecInput.layout);
  assert.equal(first.scenario.randomPolicy.mode, 'deterministic');
  assert.equal(second.scenario.randomPolicy.mode, 'deterministic');
  assert.equal(first.scenario.selectionMode, 'dynamic-exploration');
  assert.equal(first.scenario.planningStatus, 'blocked');
  assert.equal(first.scenario.planningBlockers[0].code, 'PRIMARY_BLOCK_UNRESOLVED');
  assert.deepEqual(first.scenario.plannedCoverage.blocks, []);
  assert.equal(first.scenario.layoutCandidates.length, 0);
});

test('dynamic scenario planner does not let runtime catalog blockers override explicit collection-first requests', () => {
  const result = buildDynamicValidationScenario({
    caseRequest: '基于 collection approvals 做一个最小审批 table 页面，只看效果：表格展示 status applicant；顶部提供 status 筛选；row action popup。',
    sessionId: 'sess-approval-verbose',
    baseSlug: 'approvals',
    candidatePageUrl: 'http://localhost:23000/admin/approvals-verbose',
    instanceInventory: makeInventoryWithRuntimeCatalog(),
  });

  assert.equal(result.scenario.selectionMode, 'collection-first');
  assert.equal(result.scenario.planningStatus, 'ready');
  assert.deepEqual(result.scenario.planningBlockers, []);
  assert.equal(result.buildSpecInput.layout.blocks[0].kind, 'Filter');
  assert.equal(result.buildSpecInput.layout.blocks[1].kind, 'Table');
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
});
