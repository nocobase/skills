import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runLocalizedWritePreflight } from '../src/localized-write-preflight.js';

const cliPath = fileURLToPath(new URL('../bin/nb-localized-write-preflight.mjs', import.meta.url));

function makeMetadata() {
  return {
    collections: {
      users: {
        name: 'users',
        filterTargetKey: 'id',
        fields: [
          { name: 'id', interface: 'integer', type: 'bigInt' },
          { name: 'nickname', interface: 'input' },
          { name: 'email', interface: 'email' },
          { name: 'status', interface: 'select' },
          { name: 'department', interface: 'm2o', type: 'belongsTo', target: 'departments' },
        ],
      },
      departments: {
        name: 'departments',
        filterTargetKey: 'id',
        fields: [
          { name: 'id', interface: 'integer', type: 'bigInt' },
          { name: 'title', interface: 'input' },
        ],
      },
      calendar_events: {
        name: 'calendar_events',
        fields: [
          { name: 'title', interface: 'input' },
          { name: 'status', interface: 'select' },
          { name: 'startAt', interface: 'datetime' },
          { name: 'endAt', interface: 'datetime' },
        ],
      },
      kanban_tasks: {
        name: 'kanban_tasks',
        fields: [
          { name: 'title', interface: 'input' },
          { name: 'status', interface: 'select' },
        ],
      },
    },
    liveTopology: {
      byUid: {
        'users-tree-uid': {
          uid: 'users-tree-uid',
          use: 'TreeBlockModel',
          collectionName: 'users',
        },
        'users-table-uid': {
          uid: 'users-table-uid',
          use: 'TableBlockModel',
          collectionName: 'users',
        },
        'departments-tree-uid': {
          uid: 'departments-tree-uid',
          use: 'TreeBlockModel',
          collectionName: 'departments',
        },
      },
    },
  };
}

function makeTreeConnectMetadata() {
  return {
    collections: {
      intelligenceEntries: {
        name: 'intelligenceEntries',
        filterTargetKey: 'id',
        fields: [
          { name: 'id', interface: 'integer', type: 'bigInt' },
          { name: 'title', interface: 'input', type: 'string' },
          { name: 'intelType', interface: 'select', type: 'string' },
        ],
      },
    },
    liveTopology: {
      byUid: {
        'intel-tree-uid': {
          uid: 'intel-tree-uid',
          use: 'TreeBlockModel',
          collectionName: 'intelligenceEntries',
          titleField: 'intelType',
        },
        'entries-table-uid': {
          uid: 'entries-table-uid',
          use: 'TableBlockModel',
          collectionName: 'intelligenceEntries',
        },
      },
    },
  };
}

function makeDefaultFilter(fieldNames) {
  return {
    logic: '$and',
    items: fieldNames.map((fieldPath) => ({
      path: fieldPath,
      operator: '$eq',
      value: '',
    })),
  };
}

function assertHasRule(result, ruleId, path) {
  assert.equal(result.errors.some((issue) => issue.ruleId === ruleId && (!path || issue.path === path)), true);
}

function makeDirectLocalizedBody(operation, {
  type = 'table',
  collectionName = 'users',
  defaultFilter,
} = {}) {
  if (operation === 'add-block') {
    return {
      target: { uid: 'grid-uid' },
      type,
      resourceInit: {
        dataSourceKey: 'main',
        collectionName,
      },
      ...(typeof defaultFilter !== 'undefined' ? { defaultFilter } : {}),
    };
  }

  const block = {
    key: `${type}-block`,
    type,
    resource: {
      dataSourceKey: 'main',
      collectionName,
    },
    ...(typeof defaultFilter !== 'undefined' ? { defaultFilter } : {}),
  };

  if (type === 'kanban') {
    block.fields = ['title'];
  }

  return {
    target: { uid: 'page-tab-uid' },
    blocks: [block],
  };
}

test('runLocalizedWritePreflight fails add-block data surfaces that omit block-level defaultFilter', () => {
  const result = runLocalizedWritePreflight({
    operation: 'add-block',
    body: {
      target: { uid: 'grid-uid' },
      type: 'table',
      resourceInit: {
        dataSourceKey: 'main',
        collectionName: 'users',
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, false);
  assertHasRule(result, 'public-data-surface-default-filter-required');
  assert.equal(result.facts.requiredCollections.includes('users'), true);
});

test('runLocalizedWritePreflight fails localized writes that use empty block-level defaultFilter on direct data surfaces', () => {
  const invalidCases = [
    {
      operation: 'add-block',
      body: makeDirectLocalizedBody('add-block', {
        type: 'table',
        collectionName: 'users',
        defaultFilter: {},
      }),
      path: '$.defaultFilter',
    },
    {
      operation: 'add-block',
      body: makeDirectLocalizedBody('add-block', {
        type: 'calendar',
        collectionName: 'calendar_events',
        defaultFilter: null,
      }),
      path: '$.defaultFilter',
    },
    {
      operation: 'add-blocks',
      body: makeDirectLocalizedBody('add-blocks', {
        type: 'table',
        collectionName: 'users',
        defaultFilter: {},
      }),
      path: '$.blocks[0].defaultFilter',
    },
    {
      operation: 'add-blocks',
      body: makeDirectLocalizedBody('add-blocks', {
        type: 'calendar',
        collectionName: 'calendar_events',
        defaultFilter: null,
      }),
      path: '$.blocks[0].defaultFilter',
    },
    {
      operation: 'compose',
      body: makeDirectLocalizedBody('compose', {
        type: 'table',
        collectionName: 'users',
        defaultFilter: {},
      }),
      path: '$.blocks[0].defaultFilter',
    },
    {
      operation: 'compose',
      body: makeDirectLocalizedBody('compose', {
        type: 'kanban',
        collectionName: 'kanban_tasks',
        defaultFilter: null,
      }),
      path: '$.blocks[0].defaultFilter',
    },
  ];

  for (const item of invalidCases) {
    const result = runLocalizedWritePreflight({
      operation: item.operation,
      body: item.body,
      collectionMetadata: makeMetadata(),
    });

    assert.equal(result.ok, false);
    assertHasRule(result, 'public-data-surface-default-filter-empty', item.path);
  }
});

test('runLocalizedWritePreflight maps missing collection metadata to stable helper rule id', () => {
  const result = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'userTable',
          type: 'table',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
        },
      ],
    },
    collectionMetadata: {},
  });

  assert.equal(result.ok, false);
  assertHasRule(result, 'missing-collection-metadata');
  assert.equal(result.facts.requiredCollections.includes('users'), true);
});

test('runLocalizedWritePreflight accepts flat relation fieldType and rejects internal field keys', () => {
  const metadata = {
    collections: {
      users: {
        name: 'users',
        fields: [{ name: 'roles', interface: 'm2m', target: 'roles' }],
      },
      roles: {
        name: 'roles',
        fields: [
          { name: 'title', interface: 'input' },
          { name: 'name', interface: 'input' },
        ],
      },
    },
  };
  const valid = runLocalizedWritePreflight({
    operation: 'compose',
    collectionMetadata: metadata,
    body: {
      target: { uid: 'tab-uid' },
      blocks: [
        {
          key: 'form',
          type: 'createForm',
          resource: { dataSourceKey: 'main', collectionName: 'users' },
          fields: [
            {
              fieldPath: 'roles',
              fieldType: 'popupSubTable',
              fields: ['title', 'name'],
            },
          ],
        },
      ],
    },
  });
  assert.equal(valid.ok, true);

  const invalid = runLocalizedWritePreflight({
    operation: 'compose',
    collectionMetadata: metadata,
    body: {
      target: { uid: 'tab-uid' },
      blocks: [
        {
          key: 'form',
          type: 'createForm',
          resource: { dataSourceKey: 'main', collectionName: 'users' },
          fields: [
            {
              fieldPath: 'roles',
              fieldComponent: 'PopupSubTableFieldModel',
            },
          ],
        },
      ],
    },
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors.some((item) => item.ruleId === 'internal-field-keys-not-public'), true);
});

test('runLocalizedWritePreflight preserves canonicalized cliBody and localized facts', () => {
  const result = runLocalizedWritePreflight({
    operation: 'add-blocks',
    body: {
      target: { uid: 'grid-uid' },
      blocks: [
        {
          key: 'events',
          type: 'calendar',
          resourceInit: {
            dataSourceKey: 'main',
            collectionName: 'calendar_events',
          },
          defaultFilter: makeDefaultFilter(['title', 'status', 'startAt']),
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.cliBody.blocks[0].type, 'calendar');
  assert.deepEqual(result.cliBody.blocks[0].defaultFilter, makeDefaultFilter(['title', 'status', 'startAt']));
  assert.equal(result.facts.operation, 'add-blocks');
  assert.equal(result.facts.directBlockTypes.includes('calendar'), true);
});

test('runLocalizedWritePreflight accepts localized tree connectFields public shapes', () => {
  const addBlock = runLocalizedWritePreflight({
    operation: 'add-block',
    body: {
      target: { uid: 'grid-uid' },
      type: 'tree',
      resourceInit: {
        dataSourceKey: 'main',
        collectionName: 'users',
      },
      settings: {
        connectFields: {
          targets: [{ targetId: 'users-table-uid' }],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(addBlock.ok, true);
  assert.deepEqual(addBlock.cliBody.settings.connectFields, {
    targets: [{ targetId: 'users-table-uid' }],
  });

  const compose = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'usersTree',
          type: 'tree',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          settings: {
            connectFields: {
              targets: [{ target: 'usersTable' }],
            },
          },
        },
        {
          key: 'usersTable',
          type: 'table',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(compose.ok, true);
  assert.deepEqual(compose.cliBody.blocks[0].settings.connectFields, {
    targets: [{ target: 'usersTable' }],
  });

  const configure = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-tree-uid' },
      changes: {
        connectFields: {
          targets: [{ targetId: 'users-table-uid', filterPaths: ['id'] }],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(configure.ok, true);
  assert.deepEqual(configure.cliBody.changes.connectFields, {
    targets: [{ targetId: 'users-table-uid', filterPaths: ['id'] }],
  });

  const configureSameRunTarget = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-tree-uid' },
      changes: {
        connectFields: {
          targets: [{ target: 'usersTable' }],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(configureSameRunTarget.ok, false);
  assertHasRule(configureSameRunTarget, 'tree-connect-target-required', '$.changes.connectFields.targets[0]');

  const duplicateLiveTarget = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-tree-uid' },
      changes: {
        connectFields: {
          targets: [{ targetId: 'users-table-uid' }, { targetBlockUid: 'users-table-uid', filterPaths: ['id'] }],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(duplicateLiveTarget.ok, false);
  assertHasRule(duplicateLiveTarget, 'tree-connect-target-duplicate', '$.changes.connectFields.targets[1]');

  const duplicateSameRunTarget = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'usersTree',
          type: 'tree',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          settings: {
            connectFields: {
              targets: [{ target: 'usersTable' }, { target: 'usersTable', filterPaths: ['id'] }],
            },
          },
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(duplicateSameRunTarget.ok, false);
  assertHasRule(duplicateSameRunTarget, 'tree-connect-target-duplicate', '$.blocks[0].settings.connectFields.targets[1]');
});

test('runLocalizedWritePreflight rejects configure tree connectFields with mismatched target field type', () => {
  const result = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'intel-tree-uid' },
      changes: {
        connectFields: {
          targets: [{ targetId: 'entries-table-uid', filterPaths: ['intelType'] }],
        },
      },
    },
    collectionMetadata: makeTreeConnectMetadata(),
  });

  assert.equal(result.ok, false);
  assertHasRule(result, 'tree-connect-filter-path-type-mismatch', '$.changes.connectFields.targets[0].filterPaths[0]');
});

test('runLocalizedWritePreflight fails closed when localized tree live context or metadata is incomplete', () => {
  const missingLiveTopology = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'intel-tree-uid' },
      changes: {
        connectFields: {
          targets: [{ targetId: 'entries-table-uid', filterPaths: ['intelType'] }],
        },
      },
    },
    collectionMetadata: {},
  });

  assert.equal(missingLiveTopology.ok, false);
  assertHasRule(missingLiveTopology, 'tree-connect-source-unknown', '$.target.uid');

  const missingCollectionMetadata = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'intel-tree-uid' },
      changes: {
        connectFields: {
          targets: [{ targetId: 'entries-table-uid', filterPaths: ['intelType'] }],
        },
      },
    },
    collectionMetadata: {
      collections: {},
      liveTopology: makeTreeConnectMetadata().liveTopology,
    },
  });

  assert.equal(missingCollectionMetadata.ok, false);
  assertHasRule(missingCollectionMetadata, 'missing-collection-metadata');
  assert.equal(missingCollectionMetadata.facts.requiredCollections.includes('intelligenceEntries'), true);
});

test('runLocalizedWritePreflight rejects localized tree connectFields with unresolved or unsupported targets', () => {
  const nonTreeSource = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-table-uid' },
      changes: {
        connectFields: {
          targets: [{ targetId: 'users-table-uid' }],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(nonTreeSource.ok, false);
  assertHasRule(nonTreeSource, 'tree-connect-source-not-tree', '$.target.uid');

  const missingLiveTarget = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-tree-uid' },
      changes: {
        connectFields: {
          targets: [{ targetId: 'missing-table-uid' }],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(missingLiveTarget.ok, false);
  assertHasRule(missingLiveTarget, 'tree-connect-target-unknown', '$.changes.connectFields.targets[0].targetId');

  const missingSameRunTarget = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'usersTree',
          type: 'tree',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          settings: {
            connectFields: {
              targets: [{ target: 'missingUsersTable' }],
            },
          },
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(missingSameRunTarget.ok, false);
  assertHasRule(missingSameRunTarget, 'tree-connect-target-unknown', '$.blocks[0].settings.connectFields.targets[0].target');

  const unsupportedSameRunTarget = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'usersTree',
          type: 'tree',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          settings: {
            connectFields: {
              targets: [{ target: 'noteBlock' }],
            },
          },
        },
        {
          key: 'noteBlock',
          type: 'markdown',
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(unsupportedSameRunTarget.ok, false);
  assertHasRule(unsupportedSameRunTarget, 'tree-connect-target-unsupported', '$.blocks[0].settings.connectFields.targets[0].target');
});

test('runLocalizedWritePreflight rejects localized tree connectFields with missing or unknown cross-collection filterPaths', () => {
  const missingFilterPaths = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'departments-tree-uid' },
      changes: {
        connectFields: {
          targets: [{ targetId: 'users-table-uid' }],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(missingFilterPaths.ok, false);
  assertHasRule(missingFilterPaths, 'tree-connect-filter-paths-required', '$.changes.connectFields.targets[0].filterPaths');

  const unknownFilterPath = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'departments-tree-uid' },
      changes: {
        connectFields: {
          targets: [{ targetId: 'users-table-uid', filterPaths: ['department.missing'] }],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(unknownFilterPath.ok, false);
  assertHasRule(unknownFilterPath, 'tree-connect-filter-path-unknown', '$.changes.connectFields.targets[0].filterPaths[0]');

  const validCrossCollection = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'departments-tree-uid' },
      changes: {
        connectFields: {
          targets: [{ targetId: 'users-table-uid', filterPaths: ['department.id'] }],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(validCrossCollection.ok, true);
});

test('runLocalizedWritePreflight rejects raw filterManager in public localized writes', () => {
  const result = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      filterManager: [
        {
          filterId: 'users-tree-uid',
          targetId: 'users-table-uid',
          filterPaths: ['id'],
        },
      ],
      blocks: [
        {
          key: 'usersTree',
          type: 'tree',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, false);
  assertHasRule(result, 'raw-filter-manager-not-public', '$.filterManager');
});

test('runLocalizedWritePreflight rejects unsupported calendar main-block sections in compose', () => {
  const invalidCases = [
    {
      key: 'fields',
      payload: {
        fields: ['title'],
      },
      ruleId: 'calendar-main-fields-unsupported',
      path: '$.blocks[0].fields',
    },
    {
      key: 'fieldGroups',
      payload: {
        fieldGroups: [
          {
            title: 'Event fields',
            fields: ['title'],
          },
        ],
      },
      ruleId: 'calendar-main-field-groups-unsupported',
      path: '$.blocks[0].fieldGroups',
    },
    {
      key: 'recordActions',
      payload: {
        recordActions: ['view'],
      },
      ruleId: 'calendar-main-record-actions-unsupported',
      path: '$.blocks[0].recordActions',
    },
  ];

  for (const item of invalidCases) {
    const result = runLocalizedWritePreflight({
      operation: 'compose',
      body: {
        target: { uid: 'page-tab-uid' },
        blocks: [
          {
            key: `calendar-${item.key}`,
            type: 'calendar',
            resource: {
              dataSourceKey: 'main',
              collectionName: 'calendar_events',
            },
            defaultFilter: makeDefaultFilter(['title', 'status', 'startAt']),
            ...item.payload,
          },
        ],
      },
      collectionMetadata: makeMetadata(),
    });

    assert.equal(result.ok, false);
    assertHasRule(result, item.ruleId, item.path);
  }
});

test('runLocalizedWritePreflight rejects unsupported kanban main-block sections in compose', () => {
  const invalidCases = [
    {
      key: 'fieldGroups',
      payload: {
        fieldGroups: [
          {
            title: 'Task fields',
            fields: ['title'],
          },
        ],
      },
      ruleId: 'kanban-main-field-groups-unsupported',
      path: '$.blocks[0].fieldGroups',
    },
    {
      key: 'recordActions',
      payload: {
        recordActions: ['view'],
      },
      ruleId: 'kanban-main-record-actions-unsupported',
      path: '$.blocks[0].recordActions',
    },
    {
      key: 'fieldsLayout',
      payload: {
        fieldsLayout: {
          rows: [['title']],
        },
      },
      ruleId: 'kanban-main-fields-layout-unsupported',
      path: '$.blocks[0].fieldsLayout',
    },
  ];

  for (const item of invalidCases) {
    const result = runLocalizedWritePreflight({
      operation: 'compose',
      body: {
        target: { uid: 'page-tab-uid' },
        blocks: [
          {
            key: `kanban-${item.key}`,
            type: 'kanban',
            resource: {
              dataSourceKey: 'main',
              collectionName: 'kanban_tasks',
            },
            fields: ['title'],
            defaultFilter: makeDefaultFilter(['title', 'status']),
            ...item.payload,
          },
        ],
      },
      collectionMetadata: makeMetadata(),
    });

    assert.equal(result.ok, false);
    assertHasRule(result, item.ruleId, item.path);
  }
});

test('nb-localized-write-preflight CLI returns stable localized shape for missing and empty defaultFilter failures', () => {
  const invalidCases = [
    {
      payload: {
        body: makeDirectLocalizedBody('add-block', {
          type: 'table',
          collectionName: 'users',
        }),
        collectionMetadata: makeMetadata(),
      },
      ruleId: 'public-data-surface-default-filter-required',
    },
    {
      payload: {
        body: makeDirectLocalizedBody('add-block', {
          type: 'table',
          collectionName: 'users',
          defaultFilter: {},
        }),
        collectionMetadata: makeMetadata(),
      },
      ruleId: 'public-data-surface-default-filter-empty',
    },
  ];

  for (const item of invalidCases) {
    const result = spawnSync(process.execPath, [
      cliPath,
      '--operation',
      'add-block',
      '--stdin-json',
    ], {
      input: JSON.stringify(item.payload),
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, false);
    assert.equal(Array.isArray(parsed.errors), true);
    assert.equal(Array.isArray(parsed.warnings), true);
    assert.equal(typeof parsed.facts?.operation, 'string');
    assertHasRule(parsed, item.ruleId);
  }
});

test('nb-localized-write-preflight CLI help keeps validator-only contract explicit', () => {
  const result = spawnSync(process.execPath, [cliPath, '--help'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.match(parsed.usage.command, /validate one localized flow-surfaces/i);
  assert.match(parsed.usage.command, /before a later explicit nb write/i);
  assert.doesNotMatch(parsed.usage.command, /before the real nb write/i);
});
