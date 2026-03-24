import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateBuildPreflight,
  resolveBuildFilterFieldSpec,
  resolveRecordPopupFilterByTkTemplate,
} from './rest_validation_builder.mjs';

function makeCollectionsMeta() {
  return [
    {
      name: 'approvals',
      title: '审批单',
      titleField: 'title',
      filterTargetKey: 'name',
      fields: [
        { name: 'title', type: 'string', interface: 'input' },
        { name: 'status', type: 'string', interface: 'select' },
        { name: 'name', type: 'string', interface: 'input' },
      ],
    },
    {
      name: 'departments',
      title: '部门',
      titleField: 'name',
      filterTargetKey: 'id',
      fields: [
        { name: 'id', type: 'bigInt', interface: 'integer' },
        { name: 'name', type: 'string', interface: 'input' },
      ],
    },
    {
      name: 'project_members',
      title: '项目成员',
      titleField: 'role',
      filterTargetKey: ['project_id', 'user_id'],
      fields: [
        { name: 'project_id', type: 'bigInt', interface: 'integer' },
        { name: 'user_id', type: 'bigInt', interface: 'integer' },
        { name: 'role', type: 'string', interface: 'input' },
      ],
    },
    {
      name: 'logs',
      title: '日志',
      titleField: 'message',
      fields: [
        { name: 'message', type: 'string', interface: 'input' },
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

function makeFilterCollectionsMeta() {
  return [
    {
      name: 'projects',
      title: '项目',
      titleField: 'name',
      fields: [
        { name: 'name', type: 'string', interface: 'input' },
        { name: 'stage', type: 'string', interface: 'select' },
        { name: 'manager', type: 'belongsTo', interface: 'm2o', target: 'users', foreignKey: 'manager_id', targetKey: 'id' },
      ],
    },
    {
      name: 'users',
      title: '用户',
      titleField: 'nickname',
      fields: [
        { name: 'id', type: 'bigInt', interface: 'integer' },
        { name: 'nickname', type: 'string', interface: 'input', uiSchema: { title: '昵称' } },
      ],
    },
  ];
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

test('resolveRecordPopupFilterByTkTemplate uses collection filterTargetKey for single-key collections', () => {
  const filterByTk = resolveRecordPopupFilterByTkTemplate({
    collectionsMeta: makeCollectionsMeta(),
    collectionName: 'approvals',
  });

  assert.equal(filterByTk, '{{ctx.record.name}}');
});

test('resolveBuildFilterFieldSpec maps select fields to SelectFieldModel and keeps descriptor tied to metadata', () => {
  const spec = resolveBuildFilterFieldSpec({
    collectionsMeta: makeCollectionsMeta(),
    collectionName: 'approvals',
    fieldPath: 'status',
  });

  assert.equal(spec.use, 'SelectFieldModel');
  assert.deepEqual(spec.descriptor, {
    name: 'status',
    title: 'status',
    interface: 'select',
    type: 'string',
  });
});

test('resolveBuildFilterFieldSpec uses leaf metadata for dotted scalar filter descriptors', () => {
  const spec = resolveBuildFilterFieldSpec({
    collectionsMeta: makeFilterCollectionsMeta(),
    collectionName: 'projects',
    fieldPath: 'manager.nickname',
  });

  assert.equal(spec.use, 'InputFieldModel');
  assert.equal(spec.descriptor.name, 'nickname');
  assert.equal(spec.descriptor.title, '昵称');
  assert.equal(spec.descriptor.interface, 'input');
  assert.equal(spec.descriptor.type, 'string');
});

test('resolveRecordPopupFilterByTkTemplate expands composite filterTargetKey into an object template', () => {
  const filterByTk = resolveRecordPopupFilterByTkTemplate({
    collectionsMeta: makeCollectionsMeta(),
    collectionName: 'project_members',
  });

  assert.deepEqual(filterByTk, {
    project_id: '{{ctx.record.project_id}}',
    user_id: '{{ctx.record.user_id}}',
  });
});

test('resolveRecordPopupFilterByTkTemplate fails fast when target collection has no filterTargetKey', () => {
  assert.throws(
    () => resolveRecordPopupFilterByTkTemplate({
      collectionsMeta: makeCollectionsMeta(),
      collectionName: 'logs',
    }),
    /missing filterTargetKey/i,
  );
});
