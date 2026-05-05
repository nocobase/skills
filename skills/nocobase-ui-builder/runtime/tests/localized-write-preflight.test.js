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
          { name: 'roles', interface: 'm2m', type: 'belongsToMany', target: 'roles' },
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
      roles: {
        name: 'roles',
        filterTargetKey: 'id',
        fields: [
          { name: 'id', interface: 'integer', type: 'bigInt' },
          { name: 'name', interface: 'input' },
          { name: 'title', interface: 'input' },
        ],
      },
    },
    liveTopology: {
      byUid: {
        'collection-tree-uid': {
          uid: 'collection-tree-uid',
          use: 'TreeCollectionBlockModel',
          collectionName: 'users',
        },
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
        'users-list-uid': {
          uid: 'users-list-uid',
          use: 'ListBlockModel',
          collectionName: 'users',
        },
        'users-grid-card-uid': {
          uid: 'users-grid-card-uid',
          use: 'GridCardBlockModel',
          collectionName: 'users',
        },
        'users-details-uid': {
          uid: 'users-details-uid',
          use: 'DetailsBlockModel',
          collectionName: 'users',
        },
        'users-map-uid': {
          uid: 'users-map-uid',
          use: 'MapBlockModel',
          collectionName: 'users',
        },
        'users-calendar-uid': {
          uid: 'users-calendar-uid',
          use: 'CalendarBlockModel',
          collectionName: 'calendar_events',
        },
        'tasks-kanban-uid': {
          uid: 'tasks-kanban-uid',
          use: 'KanbanBlockModel',
          collectionName: 'kanban_tasks',
        },
        'chart-block-uid': {
          uid: 'chart-block-uid',
          use: 'ChartBlockModel',
          collectionName: 'users',
        },
        'bulk-update-action-uid': {
          uid: 'bulk-update-action-uid',
          use: 'BulkUpdateActionModel',
          parentUid: 'users-table-uid',
        },
        'update-record-action-uid': {
          uid: 'update-record-action-uid',
          use: 'UpdateRecordActionModel',
          parentUid: 'users-table-uid',
        },
        'collection-tree-target-uid': {
          uid: 'collection-tree-target-uid',
          use: 'TreeCollectionBlockModel',
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

function actionTypes(actions) {
  return actions.map((action) => (typeof action === 'string' ? action : action?.type));
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

test('runLocalizedWritePreflight defaults record actions for direct table blocks', () => {
  const result = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'users-table',
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

  assert.equal(result.ok, true);
  assert.deepEqual(actionTypes(result.cliBody.blocks[0].recordActions), ['view', 'edit', 'delete']);
});

test('runLocalizedWritePreflight defaults record actions for nested popup table blocks', () => {
  const result = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'users-details',
          type: 'details',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          fields: ['nickname', 'email'],
          actions: [
            {
              type: 'popup',
              popup: {
                blocks: [
                  {
                    key: 'roles-table',
                    type: 'table',
                    resource: {
                      dataSourceKey: 'main',
                      collectionName: 'roles',
                    },
                    defaultFilter: makeDefaultFilter(['name', 'title']),
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(actionTypes(result.cliBody.blocks[0].actions[0].popup.blocks[0].recordActions), ['view', 'edit', 'delete']);
});

test('runLocalizedWritePreflight preserves explicit table record actions and skips table select models', () => {
  const result = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'users-table',
          type: 'table',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
          recordActions: [{ type: 'view' }],
        },
        {
          key: 'users-selector',
          type: 'table',
          use: 'TableSelectModel',
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

  assert.equal(result.ok, true);
  assert.deepEqual(actionTypes(result.cliBody.blocks[0].recordActions), ['view']);
  assert.equal(Object.hasOwn(result.cliBody.blocks[1], 'recordActions'), false);
});

test('runLocalizedWritePreflight skips template-backed and popup subtable model table defaults', () => {
  const result = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'template-table',
          type: 'table',
          template: { uid: 'users-table-template' },
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
        },
        {
          key: 'popup-subtable-field',
          type: 'table',
          use: 'PopupSubTableFieldModel',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'roles',
          },
          defaultFilter: makeDefaultFilter(['name', 'title']),
        },
        {
          key: 'popup-subtable-actions',
          type: 'table',
          use: 'PopupSubTableActionsColumnModel',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'roles',
          },
          defaultFilter: makeDefaultFilter(['name', 'title']),
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.cliBody.blocks[0], 'recordActions'), false);
  assert.equal(Object.hasOwn(result.cliBody.blocks[1], 'recordActions'), false);
  assert.equal(Object.hasOwn(result.cliBody.blocks[2], 'recordActions'), false);
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

test('runLocalizedWritePreflight collects nested field popup collection metadata refs', () => {
  const result = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'host',
          type: 'markdown',
          fields: [
            {
              fieldPath: 'user',
              popup: {
                blocks: [
                  {
                    key: 'fieldPopupUsersTable',
                    type: 'table',
                    resource: {
                      dataSourceKey: 'main',
                      collectionName: 'users',
                    },
                    defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    collectionMetadata: {},
  });

  assert.equal(result.ok, false);
  assertHasRule(result, 'missing-collection-metadata', '$.blocks[0].fields[0].popup.blocks[0].resource.collectionName');
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
        titleField: 'name',
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

test('runLocalizedWritePreflight requires explicit titleField for relation fieldType objects when target collection titleField is id', () => {
  const metadata = makeMetadata();
  metadata.collections.roles.titleField = 'id';

  const composeMissing = runLocalizedWritePreflight({
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
              field: 'roles',
              fieldType: 'popupSubTable',
              fields: ['name', 'title'],
            },
          ],
        },
      ],
    },
  });
  assert.equal(composeMissing.ok, false);
  assertHasRule(
    composeMissing,
    'relation-field-title-field-required-when-collection-title-is-id',
    '$.blocks[0].fields[0].titleField',
  );

  const composeExplicitReadable = runLocalizedWritePreflight({
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
              field: 'roles',
              fieldType: 'popupSubTable',
              titleField: 'name',
              fields: ['name', 'title'],
            },
          ],
        },
      ],
    },
  });
  assert.equal(composeExplicitReadable.ok, true, JSON.stringify(composeExplicitReadable.errors));

  const configureMissing = runLocalizedWritePreflight({
    operation: 'configure',
    collectionMetadata: metadata,
    body: {
      target: { uid: 'users-table-uid' },
      changes: {
        fields: [
          {
            field: 'roles',
            fieldType: 'popupSubTable',
            fields: ['name', 'title'],
          },
        ],
      },
    },
  });
  assert.equal(configureMissing.ok, false);
  assertHasRule(
    configureMissing,
    'relation-field-title-field-required-when-collection-title-is-id',
    '$.changes.fields[0].titleField',
  );

  const explicitId = runLocalizedWritePreflight({
    operation: 'configure',
    collectionMetadata: metadata,
    body: {
      target: { uid: 'users-table-uid' },
      changes: {
        fields: [
          {
            field: 'roles',
            fieldType: 'popupSubTable',
            titleField: 'id',
            fields: ['name', 'title'],
          },
        ],
      },
    },
  });
  assert.equal(explicitId.ok, true, JSON.stringify(explicitId.errors));
});

test('runLocalizedWritePreflight requires explicit titleField for relation fieldType objects when target collection titleField falls back to id', () => {
  const metadata = makeMetadata();

  const composeMissing = runLocalizedWritePreflight({
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
              field: 'roles',
              fieldType: 'popupSubTable',
              fields: ['name', 'title'],
            },
          ],
        },
      ],
    },
  });
  assert.equal(composeMissing.ok, false);
  assertHasRule(
    composeMissing,
    'relation-field-title-field-required-when-collection-title-is-id',
    '$.blocks[0].fields[0].titleField',
  );

  const configureExplicitId = runLocalizedWritePreflight({
    operation: 'configure',
    collectionMetadata: metadata,
    body: {
      target: { uid: 'users-table-uid' },
      changes: {
        fields: [
          {
            field: 'roles',
            fieldType: 'popupSubTable',
            titleField: 'id',
            fields: ['name', 'title'],
          },
        ],
      },
    },
  });
  assert.equal(configureExplicitId.ok, true, JSON.stringify(configureExplicitId.errors));
});

test('runLocalizedWritePreflight keeps relation titleField guard inside inherited relation popup surface context', () => {
  const metadata = makeMetadata();
  metadata.collections.departments.titleField = 'id';
  metadata.collections.roles.fields.push({
    name: 'department',
    interface: 'm2o',
    type: 'belongsTo',
    target: 'departments',
  });

  const composeMissing = runLocalizedWritePreflight({
    operation: 'compose',
    collectionMetadata: metadata,
    body: {
      target: { uid: 'tab-uid' },
      blocks: [
        {
          key: 'usersTable',
          type: 'table',
          resource: { dataSourceKey: 'main', collectionName: 'users' },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
          fields: [
            {
              field: 'roles',
              popup: {
                blocks: [
                  {
                    key: 'roleDetails',
                    type: 'details',
                    resource: { binding: 'currentRecord' },
                    fields: [
                      {
                        field: 'department',
                        fieldType: 'popupSubTable',
                        fields: ['title'],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  });
  assert.equal(composeMissing.ok, false);
  assertHasRule(
    composeMissing,
    'relation-field-title-field-required-when-collection-title-is-id',
    '$.blocks[0].fields[0].popup.blocks[0].fields[0].titleField',
  );

  const composeExplicitReadable = runLocalizedWritePreflight({
    operation: 'compose',
    collectionMetadata: metadata,
    body: {
      target: { uid: 'tab-uid' },
      blocks: [
        {
          key: 'usersTable',
          type: 'table',
          resource: { dataSourceKey: 'main', collectionName: 'users' },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
          fields: [
            {
              field: 'roles',
              popup: {
                blocks: [
                  {
                    key: 'roleDetails',
                    type: 'details',
                    resource: { binding: 'currentRecord' },
                    fields: [
                      {
                        field: 'department',
                        fieldType: 'popupSubTable',
                        titleField: 'title',
                        fields: ['title'],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  });
  assert.equal(composeExplicitReadable.ok, true, JSON.stringify(composeExplicitReadable.errors));

  const configureMissing = runLocalizedWritePreflight({
    operation: 'configure',
    collectionMetadata: metadata,
    body: {
      target: { uid: 'users-table-uid' },
      changes: {
        fields: [
          {
            field: 'roles',
            popup: {
              blocks: [
                {
                  key: 'roleDetails',
                  type: 'details',
                  resource: { binding: 'currentRecord' },
                  fields: [
                    {
                      field: 'department',
                      fieldType: 'popupSubTable',
                      fields: ['title'],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
  });
  assert.equal(configureMissing.ok, false);
  assertHasRule(
    configureMissing,
    'relation-field-title-field-required-when-collection-title-is-id',
    '$.changes.fields[0].popup.blocks[0].fields[0].titleField',
  );

  const configureExplicitId = runLocalizedWritePreflight({
    operation: 'configure',
    collectionMetadata: metadata,
    body: {
      target: { uid: 'users-table-uid' },
      changes: {
        fields: [
          {
            field: 'roles',
            popup: {
              blocks: [
                {
                  key: 'roleDetails',
                  type: 'details',
                  resource: { binding: 'currentRecord' },
                  fields: [
                    {
                      field: 'department',
                      fieldType: 'popupSubTable',
                      titleField: 'id',
                      fields: ['title'],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
  });
  assert.equal(configureExplicitId.ok, true, JSON.stringify(configureExplicitId.errors));
});

test('runLocalizedWritePreflight keeps relation titleField guard inside inherited relation popup surface context when target titleField falls back to id', () => {
  const metadata = makeMetadata();
  metadata.collections.roles.fields.push({
    name: 'department',
    interface: 'm2o',
    type: 'belongsTo',
    target: 'departments',
  });

  const composeMissing = runLocalizedWritePreflight({
    operation: 'compose',
    collectionMetadata: metadata,
    body: {
      target: { uid: 'tab-uid' },
      blocks: [
        {
          key: 'usersTable',
          type: 'table',
          resource: { dataSourceKey: 'main', collectionName: 'users' },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
          fields: [
            {
              field: 'roles',
              popup: {
                blocks: [
                  {
                    key: 'roleDetails',
                    type: 'details',
                    resource: { binding: 'currentRecord' },
                    fields: [
                      {
                        field: 'department',
                        fieldType: 'popupSubTable',
                        fields: ['title'],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  });
  assert.equal(composeMissing.ok, false);
  assertHasRule(
    composeMissing,
    'relation-field-title-field-required-when-collection-title-is-id',
    '$.blocks[0].fields[0].popup.blocks[0].fields[0].titleField',
  );

  const configureExplicitId = runLocalizedWritePreflight({
    operation: 'configure',
    collectionMetadata: metadata,
    body: {
      target: { uid: 'users-table-uid' },
      changes: {
        fields: [
          {
            field: 'roles',
            popup: {
              blocks: [
                {
                  key: 'roleDetails',
                  type: 'details',
                  resource: { binding: 'currentRecord' },
                  fields: [
                    {
                      field: 'department',
                      fieldType: 'popupSubTable',
                      titleField: 'id',
                      fields: ['title'],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
  });
  assert.equal(configureExplicitId.ok, true, JSON.stringify(configureExplicitId.errors));
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

test('runLocalizedWritePreflight defaults configure heightMode to specifyValue when changes include height', () => {
  const result = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'chart-block-uid' },
      changes: { height: 500 },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.cliBody.changes.heightMode, 'specifyValue');
});

test('runLocalizedWritePreflight defaults block settings heightMode to specifyValue when height is set', () => {
  const addBlock = runLocalizedWritePreflight({
    operation: 'add-block',
    body: {
      target: { uid: 'grid-uid' },
      type: 'chart',
      settings: { height: 500 },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(addBlock.ok, true);
  assert.equal(addBlock.cliBody.settings.heightMode, 'specifyValue');

  const addBlocks = runLocalizedWritePreflight({
    operation: 'add-blocks',
    body: {
      target: { uid: 'grid-uid' },
      blocks: [
        {
          key: 'specifiedChart',
          type: 'chart',
          settings: { height: 420 },
        },
        {
          key: 'fullHeightChart',
          type: 'chart',
          settings: { height: 500, heightMode: 'fullHeight' },
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(addBlocks.ok, true);
  assert.equal(addBlocks.cliBody.blocks[0].settings.heightMode, 'specifyValue');
  assert.equal(addBlocks.cliBody.blocks[1].settings.heightMode, 'fullHeight');
});

test('runLocalizedWritePreflight rejects chart settings displayTitle before remote write', () => {
  const result = runLocalizedWritePreflight({
    operation: 'add-block',
    body: {
      target: { uid: 'grid-uid' },
      type: 'chart',
      settings: {
        title: 'Status chart',
        displayTitle: true,
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'chart-display-title-unsupported'));
  assert.equal(result.cliBody.settings.displayTitle, true);
});

test('runLocalizedWritePreflight rejects add-block chart builder relation query paths', () => {
  const result = runLocalizedWritePreflight({
    operation: 'add-block',
    body: {
      target: { uid: 'grid-uid' },
      type: 'chart',
      settings: {
        title: 'Department chart',
        query: {
          mode: 'builder',
          resource: { dataSourceKey: 'main', collectionName: 'users' },
          measures: [{ field: 'id', aggregation: 'count', alias: 'user_count' }],
          dimensions: [{ field: ['department', 'title'], alias: 'department_title' }],
        },
        visual: {
          mode: 'basic',
          type: 'bar',
          mappings: { x: 'department_title', y: 'user_count' },
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, false);
  assertHasRule(result, 'chart-builder-relation-field-runtime-unsupported', '$.settings.query.dimensions[0].field');
});

test('runLocalizedWritePreflight accepts scalar builder chart query paths', () => {
  const result = runLocalizedWritePreflight({
    operation: 'add-block',
    body: {
      target: { uid: 'grid-uid' },
      type: 'chart',
      settings: {
        title: 'Department chart',
        query: {
          mode: 'builder',
          resource: { dataSourceKey: 'main', collectionName: 'users' },
          measures: [{ field: 'id', aggregation: 'count', alias: 'user_count' }],
          dimensions: [{ field: 'department_id', alias: 'department_id' }],
        },
        visual: {
          mode: 'basic',
          type: 'bar',
          mappings: { x: 'department_id', y: 'user_count' },
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.cliBody.settings.query.dimensions, [
    { field: 'department_id', alias: 'department_id' },
  ]);
});

test('runLocalizedWritePreflight accepts gridCard settings.columns and rejects unsupported gridCard setting keys', () => {
  const responsiveColumns = { xs: 1, sm: 1, md: 2, lg: 3, xl: 3, xxl: 4 };
  const addBlock = runLocalizedWritePreflight({
    operation: 'add-block',
    body: {
      target: { uid: 'grid-uid' },
      type: 'gridCard',
      resourceInit: {
        dataSourceKey: 'main',
        collectionName: 'users',
      },
      defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
      settings: {
        columns: responsiveColumns,
        rowCount: 3,
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(addBlock.ok, true, JSON.stringify(addBlock.errors));
  assert.deepEqual(addBlock.cliBody.settings.columns, responsiveColumns);
  assert.equal(addBlock.cliBody.settings.rowCount, 3);

  const unsupportedKey = ['column', 'Count'].join('');
  const invalidCases = [
    {
      operation: 'add-block',
      body: {
        target: { uid: 'grid-uid' },
        type: 'gridCard',
        resourceInit: {
          dataSourceKey: 'main',
          collectionName: 'users',
        },
        defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
        settings: {
          [unsupportedKey]: { xs: 1, md: 2 },
        },
      },
      path: `$.settings.${unsupportedKey}`,
    },
    {
      operation: 'add-blocks',
      body: {
        target: { uid: 'grid-uid' },
        blocks: [
          {
            key: 'usersGrid',
            type: 'gridCard',
            resource: {
              dataSourceKey: 'main',
              collectionName: 'users',
            },
            defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
            settings: {
              [unsupportedKey]: { xs: 1, md: 2 },
            },
          },
        ],
      },
      path: `$.blocks[0].settings.${unsupportedKey}`,
    },
    {
      operation: 'compose',
      body: {
        target: { uid: 'page-tab-uid' },
        blocks: [
          {
            key: 'usersGrid',
            type: 'gridCard',
            resource: {
              dataSourceKey: 'main',
              collectionName: 'users',
            },
            defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
            settings: {
              [unsupportedKey]: { xs: 1, md: 2 },
            },
          },
        ],
      },
      path: `$.blocks[0].settings.${unsupportedKey}`,
    },
  ];

  for (const item of invalidCases) {
    const result = runLocalizedWritePreflight({
      operation: item.operation,
      body: item.body,
      collectionMetadata: makeMetadata(),
    });
    assert.equal(result.ok, false);
    assertHasRule(result, 'grid-card-settings-unsupported', item.path);
  }

  const invalidConfigure = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-grid-card-uid' },
      changes: {
        [unsupportedKey]: { xs: 1, md: 2 },
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(invalidConfigure.ok, false);
  assertHasRule(invalidConfigure, 'grid-card-settings-unsupported', `$.changes.${unsupportedKey}`);

  const validConfigure = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-grid-card-uid' },
      changes: {
        columns: 3,
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(validConfigure.ok, true, JSON.stringify(validConfigure.errors));
  assert.equal(validConfigure.cliBody.changes.columns, 3);
});

test('runLocalizedWritePreflight normalizes localized settings.sort alias to sorting', () => {
  const addBlock = runLocalizedWritePreflight({
    operation: 'add-block',
    body: {
      target: { uid: 'grid-uid' },
      type: 'table',
      resourceInit: {
        dataSourceKey: 'main',
        collectionName: 'users',
      },
      defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
      settings: {
        sort: ['-createdAt', 'nickname'],
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(addBlock.ok, true);
  assert.equal(Object.hasOwn(addBlock.cliBody.settings, 'sort'), false);
  assert.deepEqual(addBlock.cliBody.settings.sorting, [
    { field: 'createdAt', direction: 'desc' },
    { field: 'nickname', direction: 'asc' },
  ]);

  const compose = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'usersList',
          type: 'list',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
          settings: {
            sort: [{ field: 'nickname', direction: 'descend' }],
          },
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(compose.ok, true);
  assert.equal(Object.hasOwn(compose.cliBody.blocks[0].settings, 'sort'), false);
  assert.deepEqual(compose.cliBody.blocks[0].settings.sorting, [
    { field: 'nickname', direction: 'desc' },
  ]);

  const configure = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-table-uid' },
      changes: {
        sort: ['email'],
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(configure.ok, true);
  assert.equal(Object.hasOwn(configure.cliBody.changes, 'sort'), false);
  assert.deepEqual(configure.cliBody.changes.sorting, [
    { field: 'email', direction: 'asc' },
  ]);

  const detailsBlock = runLocalizedWritePreflight({
    operation: 'add-block',
    body: {
      target: { uid: 'grid-uid' },
      type: 'details',
      resourceInit: {
        dataSourceKey: 'main',
        collectionName: 'users',
      },
      settings: {
        sort: [{ field: 'nickname', direction: 'ascending' }],
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(detailsBlock.ok, true);
  assert.equal(Object.hasOwn(detailsBlock.cliBody.settings, 'sort'), false);
  assert.deepEqual(detailsBlock.cliBody.settings.sorting, [
    { field: 'nickname', direction: 'asc' },
  ]);

  const treeBlock = runLocalizedWritePreflight({
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
            sort: ['nickname'],
          },
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(treeBlock.ok, true);
  assert.equal(Object.hasOwn(treeBlock.cliBody.blocks[0].settings, 'sort'), false);
  assert.deepEqual(treeBlock.cliBody.blocks[0].settings.sorting, [
    { field: 'nickname', direction: 'asc' },
  ]);

  const mapConfigure = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-map-uid' },
      changes: {
        sort: ['-nickname'],
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(mapConfigure.ok, true);
  assert.equal(Object.hasOwn(mapConfigure.cliBody.changes, 'sort'), false);
  assert.deepEqual(mapConfigure.cliBody.changes.sorting, [
    { field: 'nickname', direction: 'desc' },
  ]);

  const gridCardBlock = runLocalizedWritePreflight({
    operation: 'add-block',
    body: {
      target: { uid: 'grid-uid' },
      type: 'gridCard',
      resourceInit: {
        dataSourceKey: 'main',
        collectionName: 'users',
      },
      defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
      settings: {
        sort: ['-createdAt'],
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(gridCardBlock.ok, true, JSON.stringify(gridCardBlock.errors));
  assert.equal(Object.hasOwn(gridCardBlock.cliBody.settings, 'sort'), false);
  assert.deepEqual(gridCardBlock.cliBody.settings.sorting, [
    { field: 'createdAt', direction: 'desc' },
  ]);
});

test('runLocalizedWritePreflight rejects conflicting localized sort aliases', () => {
  const compose = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'usersTable',
          type: 'table',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
          settings: {
            sort: ['-createdAt'],
            sorting: [{ field: 'createdAt', direction: 'asc' }],
          },
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(compose.ok, false);
  assertHasRule(compose, 'settings-sort-sorting-conflict', '$.blocks[0].settings.sort');

  const configure = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-list-uid' },
      changes: {
        sort: ['-createdAt'],
        sorting: [{ field: 'createdAt', direction: 'asc' }],
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(configure.ok, false);
  assertHasRule(configure, 'settings-sort-sorting-conflict', '$.changes.sort');
});

test('runLocalizedWritePreflight leaves configure sort unchanged for non-sorting live targets', () => {
  const result = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'chart-block-uid' },
      changes: {
        sort: ['-createdAt'],
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.cliBody.changes.sort, ['-createdAt']);
  assert.equal(Object.hasOwn(result.cliBody.changes, 'sorting'), false);

  const calendar = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-calendar-uid' },
      changes: {
        sort: ['-createdAt'],
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(calendar.ok, true);
  assert.deepEqual(calendar.cliBody.changes.sort, ['-createdAt']);
  assert.equal(Object.hasOwn(calendar.cliBody.changes, 'sorting'), false);
});

test('runLocalizedWritePreflight validates and normalizes relation field popup resources', () => {
  const canonicalDetails = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'usersTable',
          type: 'table',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
          fields: [
            'nickname',
            {
              field: 'roles',
              popup: {
                blocks: [
                  {
                    key: 'roleDetails',
                    type: 'details',
                    resource: {
                      binding: 'currentRecord',
                      collectionName: 'roles',
                    },
                    fields: ['name'],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(canonicalDetails.ok, true);
  assert.equal(canonicalDetails.cliBody.blocks[0].fields[1].popup.blocks[0].resource.binding, 'currentRecord');

  const legacyDetails = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'usersTable',
          type: 'table',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
          fields: [
            {
              field: 'roles',
              popup: {
                blocks: [
                  {
                    key: 'roleDetails',
                    type: 'details',
                    collection: 'roles',
                    fields: ['name'],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(legacyDetails.ok, true);
  assert.equal(legacyDetails.cliBody.blocks[0].fields[0].popup.blocks[0].resource.binding, 'currentRecord');

  const associatedTable = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'usersTable',
          type: 'table',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
          fields: [
            {
              field: 'roles',
              popup: {
                blocks: [
                  {
                    key: 'rolesTable',
                    type: 'table',
                    resource: {
                      binding: 'associatedRecords',
                      associationField: 'roles',
                      collectionName: 'roles',
                    },
                    defaultFilter: makeDefaultFilter(['name', 'title']),
                    fields: ['name'],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(associatedTable.ok, true);
  assert.equal(associatedTable.cliBody.blocks[0].fields[0].popup.blocks[0].resource.binding, 'associatedRecords');
});

test('runLocalizedWritePreflight rejects invalid relation field popup resources', () => {
  const mismatchedDetails = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'usersTable',
          type: 'table',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
          fields: [
            {
              field: 'roles',
              popup: {
                blocks: [
                  {
                    key: 'departmentDetails',
                    type: 'details',
                    collection: 'departments',
                    fields: ['title'],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(mismatchedDetails.ok, false);
  assertHasRule(mismatchedDetails, 'relation-popup-current-record-target-mismatch', '$.blocks[0].fields[0].popup.blocks[0].resource.collectionName');

  const unresolvedMetadata = makeMetadata();
  unresolvedMetadata.collections.users = {
    ...unresolvedMetadata.collections.users,
    fields: unresolvedMetadata.collections.users.fields.map((field) =>
      field.name === 'roles' ? { ...field, target: '' } : field,
    ),
  };
  const unresolvedDetails = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'usersTable',
          type: 'table',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
          fields: [
            {
              field: 'roles',
              popup: {
                blocks: [
                  {
                    key: 'roleDetails',
                    type: 'details',
                    collection: 'roles',
                    fields: ['name'],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    collectionMetadata: unresolvedMetadata,
  });

  assert.equal(unresolvedDetails.ok, false);
  assertHasRule(unresolvedDetails, 'relation-popup-current-record-target-unresolved', '$.blocks[0].fields[0].popup.blocks[0].resource.binding');

  const wrongAssociatedTable = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'usersTable',
          type: 'table',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
          fields: [
            {
              field: 'roles',
              popup: {
                blocks: [
                  {
                    key: 'rolesTable',
                    type: 'table',
                    collection: 'roles',
                    defaultFilter: makeDefaultFilter(['name', 'title']),
                    fields: ['name'],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(wrongAssociatedTable.ok, false);
  assertHasRule(wrongAssociatedTable, 'relation-popup-associated-records-binding-required', '$.blocks[0].fields[0].popup.blocks[0].resource.binding');
});

test('runLocalizedWritePreflight does not apply relation popup binding rules to scalar field popups', () => {
  const result = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'usersTable',
          type: 'table',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
          fields: [
            {
              field: 'nickname',
              popup: {
                blocks: [
                  {
                    key: 'userDetails',
                    type: 'details',
                    collection: 'users',
                    fields: ['nickname'],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.errors.length, 0);
});

test('runLocalizedWritePreflight defaults nested popup block heightMode to specifyValue', () => {
  const result = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'hostChart',
          type: 'chart',
          settings: { height: 420 },
          blocks: [
            {
              key: 'childChart',
              type: 'chart',
              settings: { height: 390 },
            },
            {
              key: 'defaultHeightChildChart',
              type: 'chart',
              settings: { height: 380, heightMode: 'defaultHeight' },
            },
            {
              key: 'specifiedHeightChildChart',
              type: 'chart',
              settings: { height: 370, heightMode: 'specifyValue' },
            },
          ],
          popup: {
            blocks: [
              {
                key: 'directPopupChart',
                type: 'chart',
                settings: { height: 360 },
              },
            ],
          },
          actions: [
            {
              type: 'popup',
              popup: {
                blocks: [
                  {
                    key: 'actionPopupChart',
                    type: 'chart',
                    settings: { height: 320 },
                  },
                ],
              },
            },
          ],
          recordActions: [
            {
              type: 'popup',
              popup: {
                blocks: [
                  {
                    key: 'recordActionPopupChart',
                    type: 'chart',
                    settings: { height: 310 },
                  },
                ],
              },
            },
          ],
          fields: [
            {
              fieldPath: 'nickname',
              popup: {
                blocks: [
                  {
                    key: 'fieldPopupChart',
                    type: 'chart',
                    settings: { height: 300 },
                  },
                ],
              },
            },
          ],
          fieldGroups: [
            {
              title: 'Grouped',
              fields: [
                {
                  fieldPath: 'email',
                  popup: {
                    blocks: [
                      {
                        key: 'groupedFieldPopupChart',
                        type: 'chart',
                        settings: { height: 280, heightMode: 'fullHeight' },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  const host = result.cliBody.blocks[0];
  assert.equal(result.ok, true);
  assert.equal(host.settings.heightMode, 'specifyValue');
  assert.equal(host.blocks[0].settings.heightMode, 'specifyValue');
  assert.equal(host.blocks[1].settings.heightMode, 'defaultHeight');
  assert.equal(host.blocks[2].settings.heightMode, 'specifyValue');
  assert.equal(host.popup.blocks[0].settings.heightMode, 'specifyValue');
  assert.equal(host.actions[0].popup.blocks[0].settings.heightMode, 'specifyValue');
  assert.equal(host.recordActions[0].popup.blocks[0].settings.heightMode, 'specifyValue');
  assert.equal(host.fields[0].popup.blocks[0].settings.heightMode, 'specifyValue');
  assert.equal(host.fieldGroups[0].fields[0].popup.blocks[0].settings.heightMode, 'fullHeight');
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

test('runLocalizedWritePreflight aligns tree connectFields live uses with backend TreeBlockModel support', () => {
  const collectionTreeSource = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'collection-tree-uid' },
      changes: {
        connectFields: {
          targets: [{ targetId: 'users-table-uid' }],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(collectionTreeSource.ok, false);
  assertHasRule(collectionTreeSource, 'tree-connect-source-not-tree', '$.target.uid');

  const collectionTreeTarget = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-tree-uid' },
      changes: {
        connectFields: {
          targets: [{ targetId: 'collection-tree-target-uid' }],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(collectionTreeTarget.ok, false);
  assertHasRule(collectionTreeTarget, 'tree-connect-target-unsupported', '$.changes.connectFields.targets[0].targetId');
});

test('runLocalizedWritePreflight resolves tree connectFields same-run targets within nested block scope', () => {
  const validPopupSibling = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'host',
          type: 'markdown',
          popup: {
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
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(validPopupSibling.ok, true);

  const rootTargetOutOfScope = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'usersTable',
          type: 'table',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
        },
        {
          key: 'host',
          type: 'markdown',
          popup: {
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
            ],
          },
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(rootTargetOutOfScope.ok, false);
  assertHasRule(rootTargetOutOfScope, 'tree-connect-target-unknown', '$.blocks[1].popup.blocks[0].settings.connectFields.targets[0].target');
});

test('runLocalizedWritePreflight validates tree connectFields inside action popup blocks', () => {
  const result = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'host',
          type: 'markdown',
          actions: [
            {
              type: 'popup',
              popup: {
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
                        targets: [{ target: 'missingTable' }],
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, false);
  assertHasRule(result, 'tree-connect-target-unknown', '$.blocks[0].actions[0].popup.blocks[0].settings.connectFields.targets[0].target');
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

  const configureRawFilterManager = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-tree-uid' },
      changes: {
        filterManager: [
          {
            filterId: 'users-tree-uid',
            targetId: 'users-table-uid',
            filterPaths: ['id'],
          },
        ],
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(configureRawFilterManager.ok, false);
  assertHasRule(configureRawFilterManager, 'raw-filter-manager-not-public', '$.changes.filterManager');

  const configureFlowRegistryConnectFields = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-tree-uid' },
      changes: {
        flowRegistry: {
          connectFields: {
            targets: [{ targetId: 'users-table-uid' }],
          },
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(configureFlowRegistryConnectFields.ok, false);
  assertHasRule(configureFlowRegistryConnectFields, 'tree-connect-flowregistry-not-public', '$.changes.flowRegistry.connectFields');
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

test('runLocalizedWritePreflight validates explicit calendar hidden popup settings when present', () => {
  const result = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'eventsCalendar',
          type: 'calendar',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'calendar_events',
          },
          defaultFilter: makeDefaultFilter(['title', 'status']),
          settings: {
            quickCreatePopup: {
              tryTemplate: 'yes',
            },
            eventPopup: {
              saveAsTemplate: {
                name: '',
                description: 'Reusable event popup template.',
              },
            },
          },
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, false);
  assertHasRule(result, 'invalid-popup-try-template', '$.blocks[0].settings.quickCreatePopup.tryTemplate');
  assertHasRule(result, 'invalid-popup-save-as-template-name', '$.blocks[0].settings.eventPopup.saveAsTemplate.name');
});

test('runLocalizedWritePreflight validates explicit kanban hidden popup settings without auto-filling missing ones', () => {
  const result = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'tasksKanban',
          type: 'kanban',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'kanban_tasks',
          },
          fields: ['title'],
          defaultFilter: makeDefaultFilter(['title']),
          settings: {
            cardPopup: {
              template: {
                uid: 'kanban-card-template',
                mode: 'reference',
              },
              saveAsTemplate: {
                name: 'duplicate-template',
                description: 'Should conflict with template binding.',
              },
            },
          },
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, false);
  assertHasRule(result, 'conflicting-popup-save-as-template', '$.blocks[0].settings.cardPopup.saveAsTemplate');
  assert.equal(Object.hasOwn(result.cliBody.blocks[0].settings, 'quickCreatePopup'), false);
});

test('runLocalizedWritePreflight validates hidden popup descendant blocks and required collections', () => {
  const missingMetadata = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'eventsCalendar',
          type: 'calendar',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'calendar_events',
          },
          defaultFilter: makeDefaultFilter(['title', 'status']),
          settings: {
            quickCreatePopup: {
              blocks: [
                {
                  key: 'rolesTable',
                  type: 'table',
                  collection: 'roles',
                  fields: ['name'],
                  defaultFilter: makeDefaultFilter(['name']),
                },
              ],
            },
          },
        },
      ],
    },
    collectionMetadata: {
      collections: {
        calendar_events: makeMetadata().collections.calendar_events,
      },
    },
  });

  assert.equal(missingMetadata.ok, false);
  assertHasRule(missingMetadata, 'missing-collection-metadata', '$.blocks[0].settings.quickCreatePopup.blocks[0].resource.collectionName');
  assert.equal(missingMetadata.facts.requiredCollections.includes('roles'), true);

  const missingDefaultFilter = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'eventsCalendar',
          type: 'calendar',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'calendar_events',
          },
          defaultFilter: makeDefaultFilter(['title']),
          settings: {
            quickCreatePopup: {
              blocks: [
                {
                  key: 'rolesTable',
                  type: 'table',
                  collection: 'roles',
                  fields: ['name'],
                },
              ],
            },
          },
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(missingDefaultFilter.ok, false);
  assertHasRule(missingDefaultFilter, 'public-data-surface-default-filter-required', '$.blocks[0].settings.quickCreatePopup.blocks[0].defaultFilter');
});

test('runLocalizedWritePreflight validates relation popup resources inside hidden popup descendants', () => {
  const result = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'tasksKanban',
          type: 'kanban',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          fields: [
            {
              field: 'department',
              popup: {
                blocks: [
                  {
                    type: 'details',
                    resource: {
                      binding: 'currentRecord',
                      collectionName: 'departments',
                    },
                  },
                ],
              },
            },
          ],
          defaultFilter: makeDefaultFilter(['nickname']),
          settings: {
            cardPopup: {
              blocks: [
                {
                  key: 'nestedDetails',
                  type: 'details',
                  collection: 'users',
                  fieldGroups: [
                    {
                      fields: [
                        {
                          field: 'department',
                          popup: {
                            blocks: [
                              {
                                key: 'wrongAssociatedTable',
                                type: 'table',
                                resource: {
                                  binding: 'currentRecord',
                                  associationField: 'department',
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, false);
  assertHasRule(
    result,
    'relation-popup-associated-records-binding-required',
    '$.blocks[0].settings.cardPopup.blocks[0].fieldGroups[0].fields[0].popup.blocks[0].resource.binding',
  );
});

test('runLocalizedWritePreflight validates localized calendar and kanban semantic field bindings', () => {
  const calendarInvalid = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'eventsCalendar',
          type: 'calendar',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'calendar_events',
          },
          defaultFilter: makeDefaultFilter(['title']),
          settings: {
            titleField: 'title',
            endField: 'missingField',
          },
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(calendarInvalid.ok, false);
  assertHasRule(calendarInvalid, 'calendar-start-field-required', '$.blocks[0].settings.startField');
  assertHasRule(calendarInvalid, 'calendar-field-binding-invalid', '$.blocks[0].settings.endField');

  const kanbanInvalid = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'tasksKanban',
          type: 'kanban',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'kanban_tasks',
          },
          fields: ['title'],
          defaultFilter: makeDefaultFilter(['title']),
          settings: {
            groupField: 'title',
          },
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(kanbanInvalid.ok, false);
  assertHasRule(kanbanInvalid, 'kanban-group-field-invalid', '$.blocks[0].settings.groupField');
});

test('runLocalizedWritePreflight validates configure calendar and kanban host rules using live target context', () => {
  const calendarPopupContract = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-calendar-uid' },
      changes: {
        quickCreatePopup: {
          tryTemplate: 'yes',
        },
        eventPopup: {
          saveAsTemplate: {
            name: '',
            description: 'Reusable event popup template.',
          },
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(calendarPopupContract.ok, false);
  assertHasRule(calendarPopupContract, 'invalid-popup-try-template', '$.changes.quickCreatePopup.tryTemplate');
  assertHasRule(calendarPopupContract, 'invalid-popup-save-as-template-name', '$.changes.eventPopup.saveAsTemplate.name');

  const calendarSemantic = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-calendar-uid' },
      changes: {
        titleField: 'title',
        endField: 'missingField',
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(calendarSemantic.ok, false);
  assertHasRule(calendarSemantic, 'calendar-start-field-required', '$.changes.startField');
  assertHasRule(calendarSemantic, 'calendar-field-binding-invalid', '$.changes.endField');

  const kanbanPopupContract = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'tasks-kanban-uid' },
      changes: {
        cardPopup: {
          template: {
            uid: 'kanban-card-template',
            mode: 'reference',
          },
          saveAsTemplate: {
            name: 'duplicate-template',
            description: 'Should conflict with template binding.',
          },
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(kanbanPopupContract.ok, false);
  assertHasRule(kanbanPopupContract, 'conflicting-popup-save-as-template', '$.changes.cardPopup.saveAsTemplate');

  const kanbanSemantic = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'tasks-kanban-uid' },
      changes: {
        groupField: 'title',
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(kanbanSemantic.ok, false);
  assertHasRule(kanbanSemantic, 'kanban-group-field-invalid', '$.changes.groupField');
});

test('runLocalizedWritePreflight validates configure hidden popup descendants with live target context', () => {
  const missingMetadata = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-calendar-uid' },
      changes: {
        quickCreatePopup: {
          blocks: [
            {
              key: 'rolesTable',
              type: 'table',
              collection: 'roles',
              fields: ['name'],
              defaultFilter: makeDefaultFilter(['name']),
            },
          ],
        },
      },
    },
    collectionMetadata: {
      collections: {
        calendar_events: makeMetadata().collections.calendar_events,
      },
      liveTopology: makeMetadata().liveTopology,
    },
  });
  assert.equal(missingMetadata.ok, false);
  assertHasRule(missingMetadata, 'missing-collection-metadata', '$.changes.quickCreatePopup.blocks[0].resource.collectionName');
  assert.equal(missingMetadata.facts.requiredCollections.includes('roles'), true);

  const missingDefaultFilter = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-calendar-uid' },
      changes: {
        quickCreatePopup: {
          blocks: [
            {
              key: 'rolesTable',
              type: 'table',
              collection: 'roles',
              fields: ['name'],
            },
          ],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(missingDefaultFilter.ok, false);
  assertHasRule(missingDefaultFilter, 'public-data-surface-default-filter-required', '$.changes.quickCreatePopup.blocks[0].defaultFilter');

  const wrongRelationPopup = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-calendar-uid' },
      changes: {
        quickCreatePopup: {
          blocks: [
            {
              key: 'usersDetails',
              type: 'details',
              collection: 'users',
              fieldGroups: [
                {
                  fields: [
                    {
                      field: 'department',
                      popup: {
                        blocks: [
                          {
                            key: 'wrongAssociatedTable',
                            type: 'table',
                            resource: {
                              binding: 'currentRecord',
                              associationField: 'department',
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(wrongRelationPopup.ok, false);
  assertHasRule(
    wrongRelationPopup,
    'relation-popup-associated-records-binding-required',
    '$.changes.quickCreatePopup.blocks[0].fieldGroups[0].fields[0].popup.blocks[0].resource.binding',
  );
});

test('runLocalizedWritePreflight validates configure main-block section and field-object restrictions', () => {
  const calendarFields = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-calendar-uid' },
      changes: {
        fields: ['title'],
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(calendarFields.ok, false);
  assertHasRule(calendarFields, 'calendar-main-fields-unsupported', '$.changes.fields');

  const kanbanFieldGroups = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'tasks-kanban-uid' },
      changes: {
        fieldGroups: [
          {
            title: 'Task fields',
            fields: ['title'],
          },
        ],
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(kanbanFieldGroups.ok, false);
  assertHasRule(kanbanFieldGroups, 'kanban-main-field-groups-unsupported', '$.changes.fieldGroups');

  const kanbanFieldsLayout = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'tasks-kanban-uid' },
      changes: {
        fieldsLayout: {
          rows: [['title']],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(kanbanFieldsLayout.ok, false);
  assertHasRule(kanbanFieldsLayout, 'kanban-main-fields-layout-unsupported', '$.changes.fieldsLayout');

  const internalFieldObject = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-table-uid' },
      changes: {
        fields: [
          {
            field: 'roles',
            fieldComponent: 'PopupSubTableFieldModel',
          },
        ],
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(internalFieldObject.ok, false);
  assertHasRule(internalFieldObject, 'internal-field-keys-not-public', '$.changes.fields[0]');
});

test('runLocalizedWritePreflight validates configure chart displayTitle against live target context', () => {
  const result = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'chart-block-uid' },
      changes: {
        title: 'Status chart',
        displayTitle: true,
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(result.ok, false);
  assertHasRule(result, 'chart-display-title-unsupported', '$.changes.displayTitle');
});

test('runLocalizedWritePreflight rejects configure chart builder relation query paths against live target context', () => {
  const result = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'chart-block-uid' },
      changes: {
        query: {
          mode: 'builder',
          resource: { dataSourceKey: 'main', collectionName: 'users' },
          measures: [{ field: 'id', aggregation: 'count', alias: 'user_count' }],
          dimensions: [{ field: 'department.title', alias: 'department_title' }],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, false);
  assertHasRule(result, 'chart-builder-relation-field-runtime-unsupported', '$.changes.query.dimensions[0].field');
});

test('runLocalizedWritePreflight validates hidden popup descendant main-block sections and chart displayTitle', () => {
  const sectionResult = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-calendar-uid' },
      changes: {
        quickCreatePopup: {
          blocks: [
            {
              key: 'nestedKanban',
              type: 'kanban',
              collection: 'kanban_tasks',
              fields: ['title'],
              defaultFilter: makeDefaultFilter(['title', 'status']),
              fieldGroups: [
                {
                  fields: ['title'],
                },
              ],
            },
          ],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(sectionResult.ok, false);
  assertHasRule(sectionResult, 'kanban-main-field-groups-unsupported', '$.changes.quickCreatePopup.blocks[0].fieldGroups');

  const chartResult = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-calendar-uid' },
      changes: {
        quickCreatePopup: {
          blocks: [
            {
              key: 'nestedChart',
              type: 'chart',
              settings: {
                title: 'Nested chart',
                displayTitle: true,
              },
            },
          ],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(chartResult.ok, false);
  assertHasRule(chartResult, 'chart-display-title-unsupported', '$.changes.quickCreatePopup.blocks[0].settings.displayTitle');
});

test('runLocalizedWritePreflight normalizes hidden popup descendant heightMode for configure', () => {
  const result = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-calendar-uid' },
      changes: {
        quickCreatePopup: {
          blocks: [
            {
              key: 'nestedChart',
              type: 'chart',
              settings: {
                height: 320,
              },
            },
          ],
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.cliBody.changes.quickCreatePopup.blocks[0].settings, {
    height: 320,
    heightMode: 'specifyValue',
  });
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

test('runLocalizedWritePreflight validates compose update action assignValues against collection metadata', () => {
  const makeBody = (actionPatch = {}, recordActionPatch = {}) => ({
    target: { uid: 'page-tab-uid' },
    blocks: [
      {
        key: 'usersTable',
        type: 'table',
        resource: {
          dataSourceKey: 'main',
          collectionName: 'users',
        },
        defaultFilter: makeDefaultFilter(['nickname', 'email', 'status']),
        actions: [
          {
            type: 'bulkUpdate',
            settings: {
              assignValues: { status: 'inactive' },
            },
            ...actionPatch,
          },
        ],
        recordActions: [
          {
            type: 'updateRecord',
            settings: {
              assignValues: { status: 'active' },
            },
            ...recordActionPatch,
          },
        ],
      },
    ],
  });

  const valid = runLocalizedWritePreflight({
    operation: 'compose',
    body: makeBody(),
    collectionMetadata: makeMetadata(),
  });
  assert.equal(valid.ok, true);

  const updateRecordValid = runLocalizedWritePreflight({
    operation: 'compose',
    body: makeBody(undefined, {
      settings: {
        assignValues: { email: 'a@example.com' },
      },
    }),
    collectionMetadata: makeMetadata(),
  });
  assert.equal(updateRecordValid.ok, true);

  const unknownField = runLocalizedWritePreflight({
    operation: 'compose',
    body: makeBody({
      settings: {
        assignValues: { missingField: 'x' },
      },
    }),
    collectionMetadata: makeMetadata(),
  });
  assert.equal(unknownField.ok, false);
  assertHasRule(unknownField, 'assign-values-field-unknown', '$.blocks[0].actions[0].settings.assignValues.missingField');

  const nonObject = runLocalizedWritePreflight({
    operation: 'compose',
    body: makeBody({
      settings: {
        assignValues: ['status'],
      },
    }),
    collectionMetadata: makeMetadata(),
  });
  assert.equal(nonObject.ok, false);
  assertHasRule(nonObject, 'assign-values-must-be-object', '$.blocks[0].actions[0].settings.assignValues');

  class AssignValuesClass {
    status = 'inactive';
  }
  const nonPlainObject = runLocalizedWritePreflight({
    operation: 'compose',
    body: makeBody({
      settings: {
        assignValues: new AssignValuesClass(),
      },
    }),
    collectionMetadata: makeMetadata(),
  });
  assert.equal(nonPlainObject.ok, false);
  assertHasRule(nonPlainObject, 'assign-values-must-be-object', '$.blocks[0].actions[0].settings.assignValues');

  const emptyClear = runLocalizedWritePreflight({
    operation: 'compose',
    body: makeBody({
      settings: {
        assignValues: {},
      },
    }, {
      settings: {
        assignValues: {},
      },
    }),
    collectionMetadata: makeMetadata(),
  });
  assert.equal(emptyClear.ok, true);
});

test('runLocalizedWritePreflight validates localized configure assignValues targets', () => {
  const validBulkUpdate = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'bulk-update-action-uid' },
      changes: {
        assignValues: { status: 'inactive' },
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(validBulkUpdate.ok, true);

  const validUpdateRecord = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'update-record-action-uid' },
      changes: {
        assignValues: {},
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(validUpdateRecord.ok, true);

  const unknownField = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'bulk-update-action-uid' },
      changes: {
        assignValues: { missingField: 'x' },
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(unknownField.ok, false);
  assertHasRule(unknownField, 'assign-values-field-unknown', '$.changes.assignValues.missingField');

  const nonObject = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'update-record-action-uid' },
      changes: {
        assignValues: 'status',
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(nonObject.ok, false);
  assertHasRule(nonObject, 'assign-values-must-be-object', '$.changes.assignValues');
});
