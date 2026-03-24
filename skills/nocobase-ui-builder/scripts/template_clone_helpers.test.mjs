import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalizeLegacyFilterItems,
  dedupeFormSubmitActions,
  remapConflictingDescendantUids,
  remapTemplateTreeToTarget,
  stripUnsupportedFieldPopupPages,
  summarizeModelTree,
} from './template_clone_helpers.mjs';

test('remapTemplateTreeToTarget rewrites root identity and nested uid references', () => {
  const sourceModel = {
    uid: 'source-root',
    use: 'BlockGridModel',
    parentId: 'tabs-source',
    subKey: 'grid',
    subType: 'object',
    subModels: {
      items: [
        {
          uid: 'source-table',
          parentId: 'source-root',
          subKey: 'items',
          subType: 'array',
          use: 'TableBlockModel',
          stepParams: {
            tableSettings: {
              targetUid: 'source-root',
            },
          },
          subModels: {
            columns: [
              {
                uid: 'source-column',
                parentId: 'source-table',
                subKey: 'columns',
                subType: 'array',
                use: 'TableColumnModel',
                stepParams: {
                  fieldSettings: {
                    init: {
                      collectionName: 'orders',
                      fieldPath: 'status',
                    },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };

  const targetRootModel = {
    uid: 'target-root',
    use: 'BlockGridModel',
    parentId: 'tabs-target',
    subKey: 'grid',
    subType: 'object',
  };

  const result = remapTemplateTreeToTarget({
    sourceModel,
    targetRootModel,
    uidSeed: 'case1',
  });

  assert.equal(result.payload.uid, 'target-root');
  assert.equal(result.payload.parentId, 'tabs-target');
  assert.equal(result.payload.subModels.items.length, 1);

  const table = result.payload.subModels.items[0];
  assert.notEqual(table.uid, 'source-table');
  assert.equal(table.parentId, 'target-root');
  assert.equal(table.stepParams.tableSettings.targetUid, 'target-root');

  const column = table.subModels.columns[0];
  assert.notEqual(column.uid, 'source-column');
  assert.equal(column.parentId, table.uid);
  assert.equal(result.canonicalizedFilterItems, 0);
});

test('summarizeModelTree reports node count and top-level items/tabs', () => {
  const model = {
    uid: 'root',
    use: 'RootPageModel',
    subModels: {
      tabs: [
        { uid: 'a', use: 'TableBlockModel' },
        {
          uid: 'b',
          use: 'RootPageTabModel',
          subModels: {
            grid: {
              uid: 'g',
              use: 'BlockGridModel',
              subModels: {
                items: [
                  {
                    uid: 'i',
                    use: 'DetailsBlockModel',
                    subModels: {
                      grid: { uid: 'dg', use: 'DetailsGridModel' },
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    },
  };

  const summary = summarizeModelTree(model);
  assert.equal(summary.nodes, 6);
  assert.equal(summary.topLevelItems, 0);
  assert.equal(summary.topLevelTabs, 2);
  assert.deepEqual(summary.uses, ['BlockGridModel', 'DetailsBlockModel', 'DetailsGridModel', 'RootPageModel', 'RootPageTabModel', 'TableBlockModel']);
});

test('canonicalizeLegacyFilterItems rewrites legacy field/operator/value filters to path/operator/value', () => {
  const model = {
    uid: 'root',
    use: 'TableBlockModel',
    stepParams: {
      tableSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [
              {
                field: 'invoice_id',
                operator: '$eq',
                value: 3,
              },
            ],
          },
        },
      },
    },
    subModels: {
      columns: [
        {
          uid: 'actions',
          use: 'TableActionsColumnModel',
          subModels: {
            actions: [
              {
                uid: 'view',
                use: 'ViewActionModel',
                subModels: {
                  page: {
                    uid: 'page',
                    use: 'ChildPageModel',
                    subModels: {
                      tabs: [
                        {
                          uid: 'tab',
                          use: 'ChildPageTabModel',
                          subModels: {
                            grid: {
                              uid: 'grid',
                              use: 'BlockGridModel',
                              subModels: {
                                items: [
                                  {
                                    uid: 'payments',
                                    use: 'TableBlockModel',
                                    stepParams: {
                                      tableSettings: {
                                        dataScope: {
                                          filter: {
                                            logic: '$and',
                                            items: [
                                              {
                                                field: 'project_id',
                                                operator: '$eq',
                                                value: '{{ctx.view.inputArgs.filterByTk}}',
                                              },
                                            ],
                                          },
                                        },
                                      },
                                    },
                                  },
                                ],
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };

  const changed = canonicalizeLegacyFilterItems(model);

  assert.equal(changed, 2);
  assert.deepEqual(
    model.stepParams.tableSettings.dataScope.filter.items[0],
    {
      path: 'invoice_id',
      operator: '$eq',
      value: 3,
    },
  );
  assert.deepEqual(
    model.subModels.columns[0].subModels.actions[0].subModels.page.subModels.tabs[0].subModels.grid.subModels.items[0].stepParams.tableSettings.dataScope.filter.items[0],
    {
      path: 'project_id',
      operator: '$eq',
      value: '{{ctx.view.inputArgs.filterByTk}}',
    },
  );
});

test('remapTemplateTreeToTarget canonicalizes legacy filter items inside cloned payload', () => {
  const sourceModel = {
    uid: 'source-root',
    use: 'BlockGridModel',
    parentId: 'tabs-source',
    subKey: 'grid',
    subType: 'object',
    subModels: {
      items: [
        {
          uid: 'source-table',
          parentId: 'source-root',
          subKey: 'items',
          subType: 'array',
          use: 'TableBlockModel',
          stepParams: {
            tableSettings: {
              dataScope: {
                filter: {
                  logic: '$and',
                  items: [
                    {
                      field: 'invoice_id',
                      operator: '$eq',
                      value: 3,
                    },
                  ],
                },
              },
            },
          },
        },
      ],
    },
  };

  const targetRootModel = {
    uid: 'target-root',
    use: 'BlockGridModel',
    parentId: 'tabs-target',
    subKey: 'grid',
    subType: 'object',
  };

  const result = remapTemplateTreeToTarget({
    sourceModel,
    targetRootModel,
    uidSeed: 'case6',
  });

  assert.equal(result.canonicalizedFilterItems, 1);
  assert.deepEqual(
    result.payload.subModels.items[0].stepParams.tableSettings.dataScope.filter.items[0],
    {
      path: 'invoice_id',
      operator: '$eq',
      value: 3,
    },
  );
});

test('remapConflictingDescendantUids freshens only descendants that collide with live topology at a different locator', () => {
  const model = {
    uid: 'grid-root',
    parentId: 'tabs-demo',
    subKey: 'grid',
    subType: 'object',
    use: 'BlockGridModel',
    stepParams: {
      gridSettings: {
        grid: {
          rows: {
            row1: [
              ['table-old'],
            ],
          },
          sizes: {
            row1: [24],
          },
          rowOrder: ['row1'],
        },
      },
    },
    subModels: {
      items: [
        {
          uid: 'table-old',
          parentId: 'grid-root',
          subKey: 'items',
          subType: 'array',
          use: 'TableBlockModel',
          stepParams: {
            tableSettings: {
              targetUid: 'table-old',
            },
          },
          subModels: {
            actions: [
              {
                uid: 'action-old',
                parentId: 'table-old',
                subKey: 'actions',
                subType: 'array',
                use: 'ViewActionModel',
                stepParams: {
                  actionSettings: {
                    defaultTargetUid: 'table-old',
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };

  const result = remapConflictingDescendantUids({
    model,
    liveTopology: {
      byUid: {
        'table-old': {
          uid: 'table-old',
          parentId: 'other-grid',
          subKey: 'items',
          subType: 'array',
          path: '$.subModels.items[3]',
          use: 'TableBlockModel',
        },
      },
    },
    uidSeed: 'case-live',
  });

  assert.equal(result.changed, true);
  assert.equal(result.payload.uid, 'grid-root');
  assert.equal(result.remappedNodes.length, 1);
  const remappedTable = result.payload.subModels.items[0];
  assert.notEqual(remappedTable.uid, 'table-old');
  assert.equal(remappedTable.parentId, 'grid-root');
  assert.equal(remappedTable.stepParams.tableSettings.targetUid, remappedTable.uid);
  assert.equal(remappedTable.subModels.actions[0].parentId, remappedTable.uid);
  assert.equal(remappedTable.subModels.actions[0].stepParams.actionSettings.defaultTargetUid, remappedTable.uid);
});

test('stripUnsupportedFieldPopupPages removes illegal page slots under field models', () => {
  const model = {
    uid: 'root',
    use: 'BlockGridModel',
    subModels: {
      items: [
        {
          uid: 'item',
          use: 'DetailsItemModel',
          subModels: {
            field: {
              uid: 'field',
              use: 'DisplayEnumFieldModel',
              subModels: {
                page: {
                  uid: 'bad-page',
                  use: 'ChildPageModel',
                },
              },
            },
          },
        },
      ],
    },
  };

  const removed = stripUnsupportedFieldPopupPages(model);

  assert.equal(removed, 1);
  assert.equal(Object.hasOwn(model.subModels.items[0].subModels.field.subModels || {}, 'page'), false);
});

test('dedupeFormSubmitActions removes placeholder duplicate submit action', () => {
  const model = {
    uid: 'root',
    use: 'EditFormModel',
    subModels: {
      grid: {
        uid: 'grid',
        use: 'FormGridModel',
        subModels: {
          items: [],
        },
      },
      actions: [
        {
          uid: 'rich-submit',
          use: 'FormSubmitActionModel',
          stepParams: {
            buttonSettings: {
              general: {
                title: '保存',
              },
            },
          },
        },
        {
          uid: 'placeholder-submit',
          use: 'FormSubmitActionModel',
          stepParams: {},
        },
      ],
    },
  };

  const removed = dedupeFormSubmitActions(model);

  assert.equal(removed, 1);
  assert.equal(model.subModels.actions.length, 1);
  assert.equal(model.subModels.actions[0].uid, 'rich-submit');
});

test('remapTemplateTreeToTarget reports empty template tree issues and cleanup counts', () => {
  const sourceModel = {
    uid: 'source-root',
    use: 'BlockGridModel',
    parentId: 'tabs-source',
    subKey: 'grid',
    subType: 'object',
    subModels: {},
  };

  const targetRootModel = {
    uid: 'target-root',
    use: 'BlockGridModel',
    parentId: 'tabs-target',
    subKey: 'grid',
    subType: 'object',
  };

  const result = remapTemplateTreeToTarget({
    sourceModel,
    targetRootModel,
    uidSeed: 'case9',
  });

  assert.equal(result.summary.nodes, 1);
  assert.equal(result.summary.topLevelItems, 0);
  assert.equal(result.summary.topLevelTabs, 0);
  assert.deepEqual(result.issues, [
    {
      code: 'EMPTY_TEMPLATE_TREE',
      message: '模板 clone 后只剩 root 壳，没有任何顶层 items 或 tabs。',
    },
  ]);
  assert.equal(result.strippedUnsupportedFieldPopupPages, 0);
  assert.equal(result.dedupedFormSubmitActions, 0);
});
