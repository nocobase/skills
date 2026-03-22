import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateBuildPreflight } from './rest_validation_builder.mjs';

function makeCollectionsMeta() {
  return [
    {
      name: 'approvals',
      title: '审批单',
      titleField: 'title',
      fields: [
        { name: 'title', type: 'string', interface: 'input' },
        { name: 'status', type: 'string', interface: 'select' },
      ],
    },
    {
      name: 'departments',
      title: '部门',
      titleField: 'name',
      fields: [
        { name: 'name', type: 'string', interface: 'input' },
      ],
    },
  ];
}

function makeBuildSpec() {
  return {
    source: {
      text: '请基于 approvals 创建一个审批页面，展示 status。',
    },
    dataBindings: {
      collections: ['approvals'],
    },
    scenario: {
      targetCollections: ['approvals'],
    },
    layout: {
      blocks: [
        {
          kind: 'Table',
        },
      ],
      tabs: [],
    },
  };
}

function makeCompileArtifact(overrides = {}) {
  return {
    planningStatus: 'ready',
    planningBlockers: [],
    requiredMetadataRefs: {
      collections: [],
      fields: [],
      relations: [],
    },
    requestedFields: ['status'],
    resolvedFields: ['status'],
    primaryBlockType: 'TableBlockModel',
    availableUses: ['TableBlockModel'],
    targetCollections: ['approvals'],
    ...overrides,
  };
}

test('build preflight blocks aggregate multi-page validation requests before createV2', () => {
  const result = evaluateBuildPreflight({
    buildSpec: makeBuildSpec(),
    compileArtifact: makeCompileArtifact({
      multiPageRequest: {
        detected: true,
        pageCount: 2,
        splitMode: 'numbered-list',
        pageTitles: ['审批列表页', '审批详情页'],
      },
    }),
    collectionsMeta: makeCollectionsMeta(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'PREFLIGHT_MULTI_PAGE_REQUEST_REQUIRES_PAGE_LEVEL_EXECUTION'), true);
});

test('build preflight fails when request explicitly names a collection but compile artifact has no targetCollections', () => {
  const result = evaluateBuildPreflight({
    buildSpec: makeBuildSpec(),
    compileArtifact: makeCompileArtifact({
      targetCollections: [],
    }),
    collectionsMeta: makeCollectionsMeta(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'EXPLICIT_COLLECTION_TARGET_MISSING'), true);
});

test('build preflight fails when request explicitly names a collection but compile artifact targets another collection', () => {
  const result = evaluateBuildPreflight({
    buildSpec: makeBuildSpec(),
    compileArtifact: makeCompileArtifact({
      targetCollections: ['departments'],
    }),
    collectionsMeta: makeCollectionsMeta(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'EXPLICIT_COLLECTION_TARGET_MISMATCH'), true);
});
