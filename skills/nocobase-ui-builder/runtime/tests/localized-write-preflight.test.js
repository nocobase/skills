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
        fields: [
          { name: 'nickname', interface: 'input' },
          { name: 'email', interface: 'email' },
          { name: 'status', interface: 'select' },
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
