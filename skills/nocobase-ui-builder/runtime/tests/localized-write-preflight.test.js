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
          { name: 'phone', interface: 'phone' },
          { name: 'status', interface: 'select' },
          { name: 'status_sort', interface: 'sort', scopeKey: 'status' },
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
          { name: 'status', interface: 'select' },
          { name: 'status_sort', interface: 'sort', scopeKey: 'status' },
        ],
      },
      calendar_events: {
        name: 'calendar_events',
        fields: [
          { name: 'title', interface: 'input' },
          { name: 'status', interface: 'select' },
          { name: 'category', interface: 'input' },
          { name: 'priority', interface: 'select' },
          { name: 'startAt', interface: 'datetime' },
          { name: 'endAt', interface: 'datetime' },
        ],
      },
      kanban_tasks: {
        name: 'kanban_tasks',
        fields: [
          { name: 'title', interface: 'input' },
          { name: 'status', interface: 'select' },
          { name: 'category', interface: 'input' },
          { name: 'priority', interface: 'select' },
        ],
      },
      roles: {
        name: 'roles',
        filterTargetKey: 'id',
        fields: [
          { name: 'id', interface: 'integer', type: 'bigInt' },
          { name: 'name', interface: 'input' },
          { name: 'title', interface: 'input' },
          { name: 'description', interface: 'textarea' },
          { name: 'scope', interface: 'select' },
          { name: 'users', interface: 'm2m', type: 'belongsToMany', target: 'users' },
        ],
      },
      categories: {
        name: 'categories',
        template: 'tree',
        filterTargetKey: 'id',
        fields: [
          { name: 'id', interface: 'integer', type: 'bigInt' },
          { name: 'title', interface: 'input' },
          { name: 'code', interface: 'input' },
          { name: 'children', interface: 'o2m', type: 'hasMany', target: 'categories', treeChildren: true },
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
        'js-block-uid': {
          uid: 'js-block-uid',
          use: 'JSBlockModel',
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
        'form-submit-action-uid': {
          uid: 'form-submit-action-uid',
          use: 'FormSubmitActionModel',
          parentUid: 'users-form-uid',
        },
        'filter-submit-action-uid': {
          uid: 'filter-submit-action-uid',
          use: 'FilterFormSubmitActionModel',
          parentUid: 'users-filter-form-uid',
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

test('runLocalizedWritePreflight accepts add-block data surfaces that omit block-level defaultFilter', () => {
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

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.facts.requiredCollections.includes('users'), true);
  assert.deepEqual(actionTypes(result.cliBody.actions), ['filter', 'refresh', 'bulkDelete', 'addNew']);
  assert.deepEqual(actionTypes(result.cliBody.recordActions), ['view', 'edit', 'delete']);
});

test('runLocalizedWritePreflight defaults table actions and record actions for direct table blocks', () => {
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(actionTypes(result.cliBody.blocks[0].actions), ['filter', 'refresh', 'bulkDelete', 'addNew']);
  assert.deepEqual(actionTypes(result.cliBody.blocks[0].recordActions), ['view', 'edit', 'delete']);
});

test('runLocalizedWritePreflight skips ordinary record defaults only for metadata-proven tree tables', () => {
  const supported = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'categories-tree',
          type: 'table',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'categories',
          },
          settings: { treeTable: true },
          defaultFilter: makeDefaultFilter(['title', 'code']),
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(supported.ok, true, JSON.stringify(supported.errors));
  assert.equal(Object.hasOwn(supported.cliBody.blocks[0], 'recordActions'), false);

  const unsupported = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'users-tree-flag',
          type: 'table',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          settings: { treeTable: true },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(unsupported.ok, true, JSON.stringify(unsupported.errors));
  assert.deepEqual(actionTypes(unsupported.cliBody.blocks[0].recordActions), ['view', 'edit', 'delete']);
});

test('runLocalizedWritePreflight accepts jsItem in public collection and record action slots', () => {
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
          actions: ['jsItem'],
          recordActions: ['jsItem'],
        },
        {
          key: 'users-calendar',
          type: 'calendar',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'calendar_events',
          },
          defaultFilter: makeDefaultFilter(['title', 'status', 'category', 'priority']),
          settings: {
            titleField: 'title',
            startField: 'startAt',
            endField: 'endAt',
          },
          actions: ['jsItem'],
        },
        {
          key: 'tasks-kanban',
          type: 'kanban',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'kanban_tasks',
          },
          defaultFilter: makeDefaultFilter(['title', 'status', 'category', 'priority']),
          fields: ['title', 'status', 'category', 'priority'],
          actions: ['jsItem'],
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(actionTypes(result.cliBody.blocks[0].actions), ['filter', 'refresh', 'bulkDelete', 'addNew', 'jsItem']);
  assert.deepEqual(actionTypes(result.cliBody.blocks[0].recordActions), ['view', 'edit', 'delete', 'jsItem']);
  assert.deepEqual(actionTypes(result.cliBody.blocks[1].actions), ['jsItem']);
  assert.deepEqual(actionTypes(result.cliBody.blocks[2].actions), ['jsItem']);
});

test('runLocalizedWritePreflight accepts canonical localized jsBlock settings code', () => {
  const result = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'kpi-cards',
          type: 'jsBlock',
          settings: {
            title: 'KPI Cards',
            version: 'v2',
            code: "ctx.render('KPI Cards');",
          },
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.cliBody.blocks[0].settings.code, "ctx.render('KPI Cards');");
});

test('runLocalizedWritePreflight accepts canonical localized jsBlock configure code', () => {
  const result = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'js-block-uid' },
      changes: {
        title: 'KPI Cards',
        version: 'v2',
        code: "ctx.render('KPI Cards');",
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.cliBody.changes.code, "ctx.render('KPI Cards');");
});

test('runLocalizedWritePreflight rejects non-canonical localized jsBlock public shapes', () => {
  const result = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'top-level-code',
          type: 'jsBlock',
          code: "ctx.render('Ignored');",
        },
        {
          key: 'top-level-version',
          type: 'jsBlock',
          version: 'v2',
        },
        {
          key: 'internal-step-params',
          type: 'jsBlock',
          stepParams: {
            jsSettings: {
              runJs: {
                version: 'v2',
                code: "ctx.render('Internal');",
              },
            },
          },
        },
        {
          key: 'malformed-script',
          type: 'jsBlock',
          script: '   ',
        },
        {
          key: 'mixed-internal-public',
          type: 'jsBlock',
          props: {},
          script: 'kpiCards',
          settings: {
            source: 'runjs',
            version: 'v2',
            code: "ctx.render('Inline');",
          },
        },
        {
          key: 'missing-source',
          type: 'jsBlock',
          settings: {
            title: 'Missing source',
          },
        },
        {
          key: 'deprecated-alias',
          type: 'js',
          settings: {
            code: "ctx.render('Alias');",
          },
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, false);
  assertHasRule(result, 'jsBlock-top-level-code-unsupported');
  assertHasRule(result, 'jsBlock-top-level-version-unsupported');
  assertHasRule(result, 'jsBlock-stepParams-unsupported');
  assertHasRule(result, 'jsBlock-script-unsupported');
  assertHasRule(result, 'jsBlock-internal-field-unsupported');
  assertHasRule(result, 'jsBlock-mixed-inline-and-script');
  assertHasRule(result, 'jsBlock-settings-unsupported-key');
  assertHasRule(result, 'jsBlock-source-required');
  assertHasRule(result, 'jsBlock-type-alias-unsupported');
});

test('runLocalizedWritePreflight rejects non-canonical localized jsBlock configure shapes', () => {
  const result = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'js-block-uid' },
      changes: {
        version: 'v2',
        code: "ctx.render('Inline');",
        script: 'kpiCards',
        props: {},
        decoratorProps: {},
        flowRegistry: {},
        stepParams: {
          jsSettings: {
            runJs: {
              code: "ctx.render('Internal');",
              version: 'v2',
            },
          },
        },
        settings: {
          code: "ctx.render('Nested settings');",
        },
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, false);
  assertHasRule(result, 'jsBlock-script-unsupported', '$.changes.script');
  assertHasRule(result, 'jsBlock-mixed-inline-and-script', '$.changes.script');
  assertHasRule(result, 'jsBlock-internal-field-unsupported', '$.changes.props');
  assertHasRule(result, 'jsBlock-internal-field-unsupported', '$.changes.decoratorProps');
  assertHasRule(result, 'jsBlock-internal-field-unsupported', '$.changes.flowRegistry');
  assertHasRule(result, 'jsBlock-stepParams-unsupported', '$.changes.stepParams');
  assertHasRule(result, 'jsBlock-settings-unsupported-key', '$.changes.settings.code');
});

test('runLocalizedWritePreflight rejects jsItem on unsupported public action hosts', () => {
  const result = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'filter-block',
          type: 'filterForm',
          fields: ['nickname'],
          actions: ['jsItem'],
        },
        {
          key: 'action-panel',
          type: 'actionPanel',
          actions: ['jsItem'],
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.errors.filter((issue) => issue.ruleId === 'js-item-action-slot-unsupported').length,
    2,
  );
});

test('runLocalizedWritePreflight validates jsItem action slots against live configure target type', () => {
  const metadata = makeMetadata();
  metadata.liveTopology.byUid['filter-form-uid'] = {
    uid: 'filter-form-uid',
    use: 'FilterFormBlockModel',
    collectionName: 'users',
  };
  metadata.liveTopology.byUid['action-panel-uid'] = {
    uid: 'action-panel-uid',
    use: 'ActionPanelBlockModel',
  };
  metadata.liveTopology.byUid['create-form-uid'] = {
    uid: 'create-form-uid',
    use: 'CreateFormModel',
    collectionName: 'users',
  };
  metadata.liveTopology.byUid['edit-form-uid'] = {
    uid: 'edit-form-uid',
    use: 'EditFormModel',
    collectionName: 'users',
  };

  const table = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-table-uid' },
      changes: {
        actions: ['jsItem'],
      },
    },
    collectionMetadata: metadata,
  });
  assert.equal(table.ok, true, JSON.stringify(table.errors));
  assert.deepEqual(actionTypes(table.cliBody.changes.actions), ['jsItem']);

  const createForm = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'create-form-uid' },
      changes: {
        actions: ['jsItem'],
      },
    },
    collectionMetadata: metadata,
  });
  assert.equal(createForm.ok, true, JSON.stringify(createForm.errors));
  assert.deepEqual(actionTypes(createForm.cliBody.changes.actions), ['jsItem']);

  const editForm = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'edit-form-uid' },
      changes: {
        actions: ['jsItem'],
      },
    },
    collectionMetadata: metadata,
  });
  assert.equal(editForm.ok, true, JSON.stringify(editForm.errors));
  assert.deepEqual(actionTypes(editForm.cliBody.changes.actions), ['jsItem']);

  const filterForm = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'filter-form-uid' },
      changes: {
        actions: ['jsItem'],
      },
    },
    collectionMetadata: metadata,
  });
  assert.equal(filterForm.ok, false);
  assertHasRule(filterForm, 'js-item-action-slot-unsupported', '$.changes.actions[0]');

  const actionPanel = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'action-panel-uid' },
      changes: {
        actions: ['jsItem'],
      },
    },
    collectionMetadata: metadata,
  });
  assert.equal(actionPanel.ok, false);
  assertHasRule(actionPanel, 'js-item-action-slot-unsupported', '$.changes.actions[0]');
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
                    defaultFilter: makeDefaultFilter(['name', 'title', 'description', 'scope']),
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

test('runLocalizedWritePreflight merges partial table actions and record actions and skips table select models', () => {
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
          actions: [{ type: 'filter', settings: { pinned: true } }],
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(actionTypes(result.cliBody.blocks[0].actions), ['filter', 'refresh', 'bulkDelete', 'addNew']);
  assert.equal(result.cliBody.blocks[0].actions[0].settings.pinned, true);
  assert.deepEqual(actionTypes(result.cliBody.blocks[0].recordActions), ['view', 'edit', 'delete']);
  assert.equal(Object.hasOwn(result.cliBody.blocks[1], 'actions'), false);
  assert.equal(Object.hasOwn(result.cliBody.blocks[1], 'recordActions'), false);
});

test('runLocalizedWritePreflight rejects removed table default action opt-outs', () => {
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
          actions: [{ type: 'filter' }],
          recordActions: [{ type: 'view' }],
          skipDefaultActions: true,
          skipDefaultRecordActions: true,
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.ruleId === 'default-actions-opt-out-unsupported'));
});

test('runLocalizedWritePreflight does not default record actions during configure', () => {
  const result = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'users-table-uid' },
      changes: {
        fields: ['nickname'],
      },
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(Object.hasOwn(result.cliBody.changes, 'recordActions'), false);
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
          defaultFilter: makeDefaultFilter(['name', 'title', 'description', 'scope']),
        },
        {
          key: 'popup-subtable-actions',
          type: 'table',
          use: 'PopupSubTableActionsColumnModel',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'roles',
          },
          defaultFilter: makeDefaultFilter(['name', 'title', 'description', 'scope']),
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

test('runLocalizedWritePreflight defaults record actions for table blocks with empty template metadata', () => {
  const result = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'users-table',
          type: 'table',
          template: {},
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(actionTypes(result.cliBody.blocks[0].recordActions), ['view', 'edit', 'delete']);
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

test('runLocalizedWritePreflight sizes defaultFilter minimum coverage from eligible direct interface fields', () => {
  const metadata = makeMetadata();
  metadata.collections.narrow_roles = {
    name: 'narrow_roles',
    fields: [
      { name: 'title', type: 'string', interface: 'input' },
      { name: 'name', type: 'string', interface: 'input' },
      { name: 'users', type: 'belongsToMany', interface: 'm2m', target: 'users' },
    ],
  };
  metadata.collections.hidden_roles = {
    name: 'hidden_roles',
    fields: [
      { name: 'title', type: 'string', interface: 'input' },
      { name: 'internalCode', type: 'string', interface: 'input', hidden: true },
      { name: 'internalScope', type: 'string', interface: 'input', options: { hidden: true } },
      { name: 'blockedCode', type: 'string', interface: 'input', filterable: false },
      { name: 'blockedScope', type: 'string', interface: 'input', options: { filterable: false } },
      { name: 'users', type: 'belongsToMany', interface: 'm2m', target: 'users' },
    ],
  };
  metadata.collections.options_only_roles = {
    name: 'options_only_roles',
    fields: [
      { key: 'title', options: { type: 'string', interface: 'input' } },
      { field: 'code', options: { type: 'string', interface: 'input' } },
      { options: { name: 'scope', type: 'string', interface: 'select' } },
      { name: 'internalName', options: { type: 'string', interface: 'input', hidden: true } },
      { name: 'users', options: { type: 'belongsToMany', interface: 'm2m', target: 'users' } },
    ],
  };

  const acceptedNarrow = runLocalizedWritePreflight({
    operation: 'compose',
    body: makeDirectLocalizedBody('compose', {
      type: 'table',
      collectionName: 'narrow_roles',
      defaultFilter: makeDefaultFilter(['title', 'name']),
    }),
    collectionMetadata: metadata,
  });
  assert.equal(acceptedNarrow.ok, true, JSON.stringify(acceptedNarrow.errors));

  const rejectedNarrow = runLocalizedWritePreflight({
    operation: 'compose',
    body: makeDirectLocalizedBody('compose', {
      type: 'table',
      collectionName: 'narrow_roles',
      defaultFilter: makeDefaultFilter(['title']),
    }),
    collectionMetadata: metadata,
  });
  assert.equal(rejectedNarrow.ok, false);
  assert.equal(
    rejectedNarrow.errors.some(
      (issue) => issue.ruleId === 'public-data-surface-default-filter-minimum-fields'
        && issue.details?.requiredFieldCount === 2
        && issue.details?.fieldCount === 1,
    ),
    true,
  );

  const hiddenFieldsDoNotRaiseMinimum = runLocalizedWritePreflight({
    operation: 'compose',
    body: makeDirectLocalizedBody('compose', {
      type: 'table',
      collectionName: 'hidden_roles',
      defaultFilter: makeDefaultFilter(['title']),
    }),
    collectionMetadata: metadata,
  });
  assert.equal(hiddenFieldsDoNotRaiseMinimum.ok, true, JSON.stringify(hiddenFieldsDoNotRaiseMinimum.errors));

  const rejectedUnfilterable = runLocalizedWritePreflight({
    operation: 'compose',
    body: makeDirectLocalizedBody('compose', {
      type: 'table',
      collectionName: 'hidden_roles',
      defaultFilter: makeDefaultFilter(['blockedCode']),
    }),
    collectionMetadata: metadata,
  });
  assert.equal(rejectedUnfilterable.ok, false);
  assert.equal(
    rejectedUnfilterable.errors.some(
      (issue) => issue.ruleId === 'public-data-surface-default-filter-field-ineligible',
    ),
    true,
  );

  const acceptedOptionsOnly = runLocalizedWritePreflight({
    operation: 'compose',
    body: makeDirectLocalizedBody('compose', {
      type: 'table',
      collectionName: 'options_only_roles',
      defaultFilter: makeDefaultFilter(['title', 'code', 'scope']),
    }),
    collectionMetadata: metadata,
  });
  assert.equal(acceptedOptionsOnly.ok, true, JSON.stringify(acceptedOptionsOnly.errors));

  const rejectedOptionsOnly = runLocalizedWritePreflight({
    operation: 'compose',
    body: makeDirectLocalizedBody('compose', {
      type: 'table',
      collectionName: 'options_only_roles',
      defaultFilter: makeDefaultFilter(['title', 'code']),
    }),
    collectionMetadata: metadata,
  });
  assert.equal(rejectedOptionsOnly.ok, false);
  assert.equal(
    rejectedOptionsOnly.errors.some(
      (issue) => issue.ruleId === 'public-data-surface-default-filter-minimum-fields'
        && issue.details?.requiredFieldCount === 3
        && issue.details?.fieldCount === 2,
    ),
    true,
  );
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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
                    defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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

test('runLocalizedWritePreflight auto-fills titleField for relation field objects when target collection titleField is id', () => {
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
              fields: ['name', 'title', 'description', 'scope'],
            },
          ],
        },
      ],
    },
  });
  assert.equal(composeMissing.ok, true, JSON.stringify(composeMissing.errors));
  assert.equal(composeMissing.cliBody.blocks[0].fields[0].titleField, 'name');

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
              fields: ['name', 'title', 'description', 'scope'],
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
            fields: ['name', 'title', 'description', 'scope'],
          },
        ],
      },
    },
  });
  assert.equal(configureMissing.ok, true, JSON.stringify(configureMissing.errors));
  assert.equal(configureMissing.cliBody.changes.fields[0].titleField, 'name');

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
            fields: ['name', 'title', 'description', 'scope'],
          },
        ],
      },
    },
  });
  assert.equal(explicitId.ok, false);
  assertHasRule(
    explicitId,
    'relation-field-title-field-id-forbidden',
    '$.changes.fields[0].titleField',
  );

  const invalidExplicit = runLocalizedWritePreflight({
    operation: 'configure',
    collectionMetadata: metadata,
    body: {
      target: { uid: 'users-table-uid' },
      changes: {
        fields: [
          {
            field: 'roles',
            fieldType: 'popupSubTable',
            titleField: 'summary',
            fields: ['name', 'title', 'description', 'scope'],
          },
        ],
      },
    },
  });
  assert.equal(invalidExplicit.ok, false);
  assertHasRule(
    invalidExplicit,
    'relation-field-title-field-invalid',
    '$.changes.fields[0].titleField',
  );

  const fieldGroupExplicitReadable = runLocalizedWritePreflight({
    operation: 'compose',
    collectionMetadata: metadata,
    body: {
      target: { uid: 'tab-uid' },
      blocks: [
        {
          key: 'grouped-form',
          type: 'createForm',
          resource: { dataSourceKey: 'main', collectionName: 'users' },
          fieldGroups: [
            {
              title: 'Assignments',
              fields: [
                {
                  field: 'roles',
                  fieldType: 'popupSubTable',
                  titleField: 'name',
                  fields: ['name', 'title', 'description', 'scope'],
                },
              ],
            },
          ],
        },
      ],
    },
  });
  assert.equal(fieldGroupExplicitReadable.ok, true, JSON.stringify(fieldGroupExplicitReadable.errors));

  const fieldGroupMissing = runLocalizedWritePreflight({
    operation: 'compose',
    collectionMetadata: metadata,
    body: {
      target: { uid: 'tab-uid' },
      blocks: [
        {
          key: 'grouped-form',
          type: 'createForm',
          resource: { dataSourceKey: 'main', collectionName: 'users' },
          fieldGroups: [
            {
              title: 'Assignments',
              fields: [{ field: 'roles', fieldType: 'popupSubTable', fields: ['name', 'title', 'description', 'scope'] }],
            },
          ],
        },
      ],
    },
  });
  assert.equal(fieldGroupMissing.ok, true, JSON.stringify(fieldGroupMissing.errors));
  assert.equal(fieldGroupMissing.cliBody.blocks[0].fieldGroups[0].fields[0].titleField, 'name');

  const fieldGroupExplicitId = runLocalizedWritePreflight({
    operation: 'compose',
    collectionMetadata: metadata,
    body: {
      target: { uid: 'tab-uid' },
      blocks: [
        {
          key: 'grouped-form',
          type: 'createForm',
          resource: { dataSourceKey: 'main', collectionName: 'users' },
          fieldGroups: [
            {
              title: 'Assignments',
              fields: [
                {
                  field: 'roles',
                  fieldType: 'popupSubTable',
                  titleField: 'id',
                  fields: ['name', 'title', 'description', 'scope'],
                },
              ],
            },
          ],
        },
      ],
    },
  });
  assert.equal(fieldGroupExplicitId.ok, false);
  assertHasRule(
    fieldGroupExplicitId,
    'relation-field-title-field-id-forbidden',
    '$.blocks[0].fieldGroups[0].fields[0].titleField',
  );

  const actionWithRelationFieldProperty = runLocalizedWritePreflight({
    operation: 'compose',
    collectionMetadata: metadata,
    body: {
      target: { uid: 'tab-uid' },
      blocks: [
        {
          key: 'table',
          type: 'table',
          resource: { dataSourceKey: 'main', collectionName: 'users' },
          defaultFilter: { status: 'active' },
          actions: [
            {
              type: 'popup',
              field: 'roles',
              popup: { blocks: [] },
            },
          ],
        },
      ],
    },
  });
  assert.equal(Object.hasOwn(actionWithRelationFieldProperty.cliBody.blocks[0].actions[0], 'titleField'), false);
});

test('runLocalizedWritePreflight auto-fills titleField for relation field objects when target collection titleField falls back to id', () => {
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
              fields: ['name', 'title', 'description', 'scope'],
            },
          ],
        },
      ],
    },
  });
  assert.equal(composeMissing.ok, true, JSON.stringify(composeMissing.errors));
  assert.equal(composeMissing.cliBody.blocks[0].fields[0].titleField, 'name');

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
            fields: ['name', 'title', 'description', 'scope'],
          },
        ],
      },
    },
  });
  assert.equal(configureExplicitId.ok, false);
  assertHasRule(
    configureExplicitId,
    'relation-field-title-field-id-forbidden',
    '$.changes.fields[0].titleField',
  );
});

test('runLocalizedWritePreflight asks for titleField when relation target has no readable display field', () => {
  const metadata = makeMetadata();
  metadata.collections.roles = {
    name: 'roles',
    filterTargetKey: 'id',
    fields: [
      { name: 'id', interface: 'integer', type: 'bigInt' },
      { name: 'manager', interface: 'm2o', type: 'belongsTo', target: 'users' },
    ],
  };

  const result = runLocalizedWritePreflight({
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
              fields: ['id'],
            },
          ],
        },
      ],
    },
  });

  assert.equal(result.ok, false);
  assertHasRule(
    result,
    'relation-field-title-field-required-when-collection-title-is-id',
    '$.blocks[0].fields[0].titleField',
  );
  assert.match(result.errors[0].message, /Please add titleField/);
});

test('runLocalizedWritePreflight auto-fills titleField for popup-only relation fields when target collection titleField is id', () => {
  const metadata = makeMetadata();
  metadata.collections.roles.titleField = 'id';

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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
          fields: [
            {
              field: 'roles',
              popup: {
                blocks: [
                  {
                    key: 'roleDetails',
                    type: 'details',
                    resource: { binding: 'currentRecord', collectionName: 'roles' },
                    fields: ['name', 'title', 'description', 'scope'],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  });
  assert.equal(composeMissing.ok, true, JSON.stringify(composeMissing.errors));
  assert.equal(composeMissing.cliBody.blocks[0].fields[0].titleField, 'name');

  const configureExplicitReadable = runLocalizedWritePreflight({
    operation: 'configure',
    collectionMetadata: metadata,
    body: {
      target: { uid: 'users-table-uid' },
      changes: {
        fields: [
          {
            field: 'roles',
            titleField: 'name',
            popup: {
              blocks: [
                {
                  key: 'roleDetails',
                  type: 'details',
                  resource: { binding: 'currentRecord', collectionName: 'roles' },
                  fields: ['name', 'title', 'description', 'scope'],
                },
              ],
            },
          },
        ],
      },
    },
  });
  assert.equal(configureExplicitReadable.ok, true, JSON.stringify(configureExplicitReadable.errors));
});

test('runLocalizedWritePreflight auto-fills relation titleField inside inherited relation popup surface context', () => {
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
          fields: [
            {
              field: 'roles',
              titleField: 'name',
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
  assert.equal(composeMissing.ok, true, JSON.stringify(composeMissing.errors));
  assert.equal(
    composeMissing.cliBody.blocks[0].fields[0].popup.blocks[0].fields[0].titleField,
    'title',
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
          fields: [
            {
              field: 'roles',
              titleField: 'name',
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
            titleField: 'name',
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
  assert.equal(configureMissing.ok, true, JSON.stringify(configureMissing.errors));
  assert.equal(
    configureMissing.cliBody.changes.fields[0].popup.blocks[0].fields[0].titleField,
    'title',
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
            titleField: 'name',
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
  assert.equal(configureExplicitId.ok, false);
  assertHasRule(
    configureExplicitId,
    'relation-field-title-field-id-forbidden',
    '$.changes.fields[0].popup.blocks[0].fields[0].titleField',
  );
});

test('runLocalizedWritePreflight auto-fills relation titleField inside inherited relation popup surface context when target titleField falls back to id', () => {
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
          fields: [
            {
              field: 'roles',
              titleField: 'name',
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
  assert.equal(composeMissing.ok, true, JSON.stringify(composeMissing.errors));
  assert.equal(
    composeMissing.cliBody.blocks[0].fields[0].popup.blocks[0].fields[0].titleField,
    'title',
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
            titleField: 'name',
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
  assert.equal(configureExplicitId.ok, false);
  assertHasRule(
    configureExplicitId,
    'relation-field-title-field-id-forbidden',
    '$.changes.fields[0].popup.blocks[0].fields[0].titleField',
  );
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
          defaultFilter: makeDefaultFilter(['title', 'status', 'category', 'priority']),
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.cliBody.blocks[0].type, 'calendar');
  assert.deepEqual(result.cliBody.blocks[0].defaultFilter, makeDefaultFilter(['title', 'status', 'category', 'priority']));
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
      defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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
        defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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
            defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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
            defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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
      defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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
      defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
          fields: [
            'nickname',
            {
              field: 'roles',
              titleField: 'name',
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
          fields: [
            {
              field: 'roles',
              titleField: 'name',
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
          fields: [
            {
              field: 'roles',
              titleField: 'name',
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
                    defaultFilter: makeDefaultFilter(['name', 'title', 'description', 'scope']),
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

  const nestedAssociatedTable = runLocalizedWritePreflight({
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
          fields: [
            {
              field: 'roles',
              titleField: 'name',
              popup: {
                blocks: [
                  {
                    key: 'roleUsersTable',
                    type: 'table',
                    resource: {
                      binding: 'associatedRecords',
                      associationField: 'users',
                    },
                    defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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

  assert.equal(nestedAssociatedTable.ok, true, JSON.stringify(nestedAssociatedTable.errors));
  assert.equal(
    nestedAssociatedTable.errors.some((issue) => issue.ruleId === 'public-data-surface-default-filter-unknown-field'),
    false,
  );
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
          fields: [
            {
              field: 'roles',
              popup: {
                blocks: [
                  {
                    key: 'rolesTable',
                    type: 'table',
                    collection: 'roles',
                    defaultFilter: makeDefaultFilter(['name', 'title', 'description', 'scope']),
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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
                defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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
            defaultFilter: makeDefaultFilter(['title', 'status', 'category', 'priority']),
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
            defaultFilter: makeDefaultFilter(['title', 'status', 'category', 'priority']),
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
          defaultFilter: makeDefaultFilter(['title', 'status', 'category', 'priority']),
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
          defaultFilter: makeDefaultFilter(['title', 'status', 'category', 'priority']),
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
          defaultFilter: makeDefaultFilter(['title', 'status', 'category', 'priority']),
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
          defaultFilter: makeDefaultFilter(['title', 'status', 'category', 'priority']),
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

  assert.equal(missingDefaultFilter.ok, true, JSON.stringify(missingDefaultFilter.errors));
  assert.deepEqual(
    actionTypes(missingDefaultFilter.cliBody.blocks[0].settings.quickCreatePopup.blocks[0].actions),
    ['filter', 'refresh', 'bulkDelete', 'addNew'],
  );
  assert.deepEqual(
    actionTypes(missingDefaultFilter.cliBody.blocks[0].settings.quickCreatePopup.blocks[0].recordActions),
    ['view', 'edit', 'delete'],
  );
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'phone', 'status']),
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
          defaultFilter: makeDefaultFilter(['title', 'status', 'category', 'priority']),
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
          defaultFilter: makeDefaultFilter(['title', 'status', 'category', 'priority']),
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

test('runLocalizedWritePreflight validates nested kanban dragSortBy with inherited popup collection context', () => {
  const normalPopup = runLocalizedWritePreflight({
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
          fields: ['nickname', 'status'],
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'phone', 'status']),
          actions: [
            {
              type: 'view',
              popup: {
                blocks: [
                  {
                    key: 'nestedKanban',
                    type: 'kanban',
                    resource: {
                      binding: 'currentRecord',
                    },
                    fields: ['nickname'],
                    settings: {
                      groupField: 'status',
                      dragSortBy: 'nickname_sort',
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
  assert.equal(normalPopup.ok, false);
  assertHasRule(
    normalPopup,
    'kanban-drag-sort-field-invalid',
    '$.blocks[0].actions[4].popup.blocks[0].settings.dragSortBy',
  );

  const relationFieldPopup = runLocalizedWritePreflight({
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
          fields: [
            'nickname',
            {
              field: 'department',
              popup: {
                blocks: [
                  {
                    key: 'departmentKanban',
                    type: 'kanban',
                    resource: {
                      binding: 'currentRecord',
                    },
                    fields: ['title'],
                    settings: {
                      groupField: 'status',
                      dragSortBy: 'nickname_sort',
                    },
                  },
                ],
              },
            },
          ],
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'phone', 'status']),
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(relationFieldPopup.ok, false);
  assertHasRule(
    relationFieldPopup,
    'kanban-drag-sort-field-invalid',
    '$.blocks[0].fields[1].popup.blocks[0].settings.dragSortBy',
  );

  const hiddenPopup = runLocalizedWritePreflight({
    operation: 'compose',
    body: {
      target: { uid: 'page-tab-uid' },
      blocks: [
        {
          key: 'usersKanban',
          type: 'kanban',
          resource: {
            dataSourceKey: 'main',
            collectionName: 'users',
          },
          fields: ['nickname'],
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'phone', 'status']),
          settings: {
            groupField: 'status',
            dragSortBy: 'status_sort',
            cardPopup: {
              blocks: [
                {
                  key: 'nestedUsersKanban',
                  type: 'kanban',
                  resource: {
                    binding: 'currentRecord',
                  },
                  fields: ['nickname'],
                  settings: {
                    groupField: 'status',
                    dragSortBy: 'nickname_sort',
                  },
                },
              ],
            },
          },
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(hiddenPopup.ok, false);
  assertHasRule(
    hiddenPopup,
    'kanban-drag-sort-field-invalid',
    '$.blocks[0].settings.cardPopup.blocks[0].settings.dragSortBy',
  );
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
  assert.equal(missingDefaultFilter.ok, true, JSON.stringify(missingDefaultFilter.errors));
  assert.deepEqual(
    actionTypes(missingDefaultFilter.cliBody.changes.quickCreatePopup.blocks[0].actions),
    ['filter', 'refresh', 'bulkDelete', 'addNew'],
  );
  assert.deepEqual(
    actionTypes(missingDefaultFilter.cliBody.changes.quickCreatePopup.blocks[0].recordActions),
    ['view', 'edit', 'delete'],
  );

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
              defaultFilter: makeDefaultFilter(['title', 'status', 'category', 'priority']),
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

test('nb-localized-write-preflight CLI is retired as a local write gate', () => {
  const result = spawnSync(process.execPath, [
    cliPath,
    '--operation',
    'add-block',
    '--stdin-json',
  ], {
    input: JSON.stringify({
      body: makeDirectLocalizedBody('add-block', {
        type: 'table',
        collectionName: 'users',
      }),
      collectionMetadata: makeMetadata(),
    }),
    encoding: 'utf8',
  });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  const parsed = JSON.parse(result.stderr);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /retired/i);
  assert.match(parsed.error, /nb api flow-surfaces <action>/i);
});

test('nb-localized-write-preflight CLI help keeps retired contract explicit', () => {
  const result = spawnSync(process.execPath, [cliPath, '--help'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.match(parsed.usage.command, /Deprecated compatibility shim/i);
  assert.match(parsed.usage.command, /nb api flow-surfaces <action>/i);
  assert.match(parsed.usage.command, /backend authoring now owns validation\/defaulting/i);
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
        defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
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
  assertHasRule(unknownField, 'assign-values-field-unknown');

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
  assertHasRule(nonObject, 'assign-values-must-be-object');

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
  assertHasRule(nonPlainObject, 'assign-values-must-be-object');

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

test('runLocalizedWritePreflight validates triggerWorkflows settings without workflow metadata', () => {
  const makeBody = (actionPatch = {}, recordActionPatch = {}) => ({
    target: { uid: 'page-tab-uid' },
    blocks: [
      {
        key: 'usersForm',
        type: 'createForm',
        resource: {
          dataSourceKey: 'main',
          collectionName: 'users',
        },
        actions: [
          {
            type: 'submit',
            settings: {
              triggerWorkflows: [{ workflowKey: 'wf_create_user' }],
            },
            ...actionPatch,
          },
        ],
      },
      {
        key: 'usersTable',
        type: 'table',
        resource: {
          dataSourceKey: 'main',
          collectionName: 'users',
        },
        defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
        recordActions: [
          {
            type: 'updateRecord',
            settings: {
              triggerWorkflows: [{ workflowKey: 'wf_update_user', context: 'department' }],
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

  const emptyClear = runLocalizedWritePreflight({
    operation: 'compose',
    body: makeBody({
      settings: {
        triggerWorkflows: [],
      },
    }, {
      settings: {
        triggerWorkflows: [],
      },
    }),
    collectionMetadata: makeMetadata(),
  });
  assert.equal(emptyClear.ok, true);

  const invalidWorkflowKey = runLocalizedWritePreflight({
    operation: 'compose',
    body: makeBody({
      settings: {
        triggerWorkflows: [{ workflowKey: '' }],
      },
    }),
    collectionMetadata: makeMetadata(),
  });
  assert.equal(invalidWorkflowKey.ok, false);
  assertHasRule(
    invalidWorkflowKey,
    'trigger-workflows-workflow-key-required',
    '$.blocks[0].actions[0].settings.triggerWorkflows[0].workflowKey',
  );

  const nullValue = runLocalizedWritePreflight({
    operation: 'compose',
    body: makeBody({
      settings: {
        triggerWorkflows: null,
      },
    }),
    collectionMetadata: makeMetadata(),
  });
  assert.equal(nullValue.ok, false);
  assertHasRule(nullValue, 'trigger-workflows-must-be-array', '$.blocks[0].actions[0].settings.triggerWorkflows');

  const unsupportedBulkUpdate = runLocalizedWritePreflight({
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
          defaultFilter: makeDefaultFilter(['nickname', 'email', 'status', 'phone']),
          actions: [
            {
              type: 'bulkUpdate',
              settings: {
                triggerWorkflows: [{ workflowKey: 'wf_bulk' }],
              },
            },
          ],
        },
      ],
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(unsupportedBulkUpdate.ok, false);
  assertHasRule(unsupportedBulkUpdate, 'trigger-workflows-target-unsupported');

  const validFormConfigure = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'form-submit-action-uid' },
      changes: {
        triggerWorkflows: [{ workflowKey: 'wf_create_user' }],
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(validFormConfigure.ok, true);

  const validUpdateConfigure = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'update-record-action-uid' },
      changes: {
        triggerWorkflows: [],
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(validUpdateConfigure.ok, true);

  const invalidConfigureTarget = runLocalizedWritePreflight({
    operation: 'configure',
    body: {
      target: { uid: 'filter-submit-action-uid' },
      changes: {
        triggerWorkflows: [{ workflowKey: 'wf_filter' }],
      },
    },
    collectionMetadata: makeMetadata(),
  });
  assert.equal(invalidConfigureTarget.ok, false);
  assertHasRule(invalidConfigureTarget, 'trigger-workflows-target-unsupported', '$.target.uid');
});
