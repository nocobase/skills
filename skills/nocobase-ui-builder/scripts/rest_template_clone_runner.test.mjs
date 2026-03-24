import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  augmentReadbackContractWithGridMembership,
  buildReadbackDriftReport,
  detectCloneTarget,
  discoverTemplatePayloadFile,
  normalizeFilterItemFieldModelUses,
  normalizeUrlBase,
  unwrapResponseEnvelope,
  validateReadbackContract,
} from './rest_template_clone_runner.mjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rest-template-clone-runner-'));
}

test('discoverTemplatePayloadFile prefers case-specific remap payload over generic template files', () => {
  const tempDir = makeTempDir();
  fs.writeFileSync(path.join(tempDir, 'source-template.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(tempDir, 'payload-canonical.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(tempDir, 'case2-remap-payload.json'), '{}\n', 'utf8');

  const filePath = discoverTemplatePayloadFile({
    templateArtifactsDir: tempDir,
    caseId: 'case2',
  });

  assert.equal(path.basename(filePath), 'case2-remap-payload.json');
});

test('detectCloneTarget distinguishes page root payloads from grid root payloads', () => {
  assert.equal(
    detectCloneTarget({
      sourceModel: { use: 'RootPageModel', subKey: 'page' },
      filePath: '/tmp/source-page.json',
    }),
    'page',
  );
  assert.equal(
    detectCloneTarget({
      sourceModel: { use: 'BlockGridModel', subKey: 'grid' },
      filePath: '/tmp/source-template.json',
    }),
    'grid',
  );
});

test('unwrapResponseEnvelope unwraps nested mcp text payload and data envelope', () => {
  const wrapped = {
    type: 'mcp_tool_call_output',
    output: {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            data: {
              uid: 'root-grid',
              use: 'BlockGridModel',
            },
          }),
        },
      ],
    },
  };

  assert.deepEqual(unwrapResponseEnvelope(wrapped), {
    uid: 'root-grid',
    use: 'BlockGridModel',
  });
});

test('normalizeUrlBase accepts both origin and /admin URL forms', () => {
  assert.deepEqual(normalizeUrlBase('http://127.0.0.1:23000'), {
    apiBase: 'http://127.0.0.1:23000',
    adminBase: 'http://127.0.0.1:23000/admin',
  });
  assert.deepEqual(normalizeUrlBase('http://127.0.0.1:23000/admin'), {
    apiBase: 'http://127.0.0.1:23000',
    adminBase: 'http://127.0.0.1:23000/admin',
  });
});

test('validateReadbackContract checks visible tabs and filterManager entry count', () => {
  const model = {
    use: 'RootPageModel',
    subModels: {
      tabs: [
        {
          uid: 'tab-overview',
          use: 'RootPageTabModel',
          stepParams: {
            pageTabSettings: {
              tab: {
                title: '客户概览',
              },
            },
          },
          subModels: {
            grid: {
              use: 'BlockGridModel',
              filterManager: [
                {
                  filterId: 'customer-name-filter',
                  targetId: 'customers-table',
                  filterPaths: ['name'],
                },
              ],
              subModels: {
                items: [
                  {
                    uid: 'customers-filter',
                    use: 'FilterFormBlockModel',
                    subModels: {
                      grid: {
                        use: 'FilterFormGridModel',
                        subModels: {
                          items: [
                            {
                              uid: 'customer-name-filter',
                              use: 'FilterFormItemModel',
                              stepParams: {
                                fieldSettings: {
                                  init: {
                                    collectionName: 'customers',
                                    fieldPath: 'name',
                                  },
                                },
                                filterFormItemSettings: {
                                  init: {
                                    defaultTargetUid: 'customers-table',
                                  },
                                },
                              },
                            },
                          ],
                        },
                      },
                    },
                  },
                  {
                    uid: 'customers-table',
                    use: 'TableBlockModel',
                  },
                ],
              },
            },
          },
        },
        {
          uid: 'tab-contacts',
          use: 'RootPageTabModel',
          stepParams: {
            pageTabSettings: {
              tab: {
                title: '联系人',
              },
            },
          },
          subModels: {
            grid: {
              use: 'BlockGridModel',
              subModels: {
                items: [
                  {
                    uid: 'contact-details',
                    use: 'DetailsBlockModel',
                    stepParams: {
                      resourceSettings: {
                        init: {
                          collectionName: 'contacts',
                        },
                      },
                    },
                    subModels: {
                      grid: {
                        use: 'DetailsGridModel',
                        subModels: {
                          items: [
                            {
                              use: 'DetailsItemModel',
                              stepParams: {
                                fieldSettings: {
                                  init: {
                                    collectionName: 'contacts',
                                    fieldPath: 'nickname',
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
  };

  const result = validateReadbackContract(model, {
    requiredTopLevelUses: ['RootPageTabModel'],
    requiredVisibleTabs: ['客户概览', '联系人'],
    requiredTabCount: 2,
    requireFilterManager: true,
    requiredFilterManagerEntryCount: 1,
    requiredTabs: [
      {
        pageSignature: '$',
        pageUse: 'RootPageModel',
        titles: ['客户概览', '联系人'],
        requireBlockGrid: true,
        requiredBlockUses: ['FilterFormBlockModel', 'TableBlockModel', 'DetailsBlockModel'],
      },
    ],
    requiredFilterBindings: [
      {
        pageSignature: '$',
        pageUse: 'RootPageModel',
        tabTitle: '客户概览',
        collectionName: 'customers',
        filterFields: ['name'],
        targetUses: ['TableBlockModel'],
      },
    ],
    requiredScopes: [
      {
        scopePath: '$.page',
        scopeKind: 'root-page',
        pageUse: 'RootPageModel',
        tabTitle: '',
        requireBlockGrid: false,
        requiredBlockUses: [],
      },
      {
        scopePath: '$.page.tabs[1]',
        scopeKind: 'root-tab',
        pageUse: 'RootPageTabModel',
        tabTitle: '联系人',
        requireBlockGrid: true,
        requiredBlockUses: ['DetailsBlockModel'],
      },
    ],
    requiredDetailsBlocks: [
      {
        scopePath: '$.page.tabs[1]',
        scopeKind: 'root-tab',
        collectionName: 'contacts',
        fieldPaths: ['nickname'],
        minItemCount: 1,
        requireFilterByTkTemplate: false,
        expectedFilterByTkTemplate: '{{ctx.view.inputArgs.filterByTk}}',
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.summary.tabBlockUses['客户概览'], ['FilterFormBlockModel', 'TableBlockModel']);
  assert.equal(result.summary.filterManagerBindings.includes('customer-name-filter->customers-table:name'), true);
});

test('validateReadbackContract detects missing popup scope and details field drift', () => {
  const popupPageModel = {
    use: 'RootPageModel',
    subModels: {
      tabs: [
        {
          use: 'RootPageTabModel',
          stepParams: {
            pageTabSettings: {
              tab: {
                title: '客户概览',
              },
            },
          },
          subModels: {
            grid: {
              use: 'BlockGridModel',
              subModels: {
                items: [
                  {
                    use: 'TableBlockModel',
                    subModels: {
                      columns: [
                        {
                          use: 'TableActionsColumnModel',
                          subModels: {
                            actions: [
                              {
                                use: 'ViewActionModel',
                                subModels: {
                                  page: {
                                    use: 'ChildPageModel',
                                    subModels: {
                                      tabs: [
                                        {
                                          use: 'ChildPageTabModel',
                                          stepParams: {
                                            pageTabSettings: {
                                              tab: {
                                                title: '任务详情',
                                              },
                                            },
                                          },
                                          subModels: {
                                            grid: {
                                              use: 'BlockGridModel',
                                              subModels: {
                                                items: [
                                                  {
                                                    use: 'DetailsBlockModel',
                                                    stepParams: {
                                                      resourceSettings: {
                                                        init: {
                                                          collectionName: 'task',
                                                          filterByTk: '{{ctx.view.inputArgs.filterByTk}}',
                                                        },
                                                      },
                                                    },
                                                    subModels: {
                                                      grid: {
                                                        use: 'DetailsGridModel',
                                                        subModels: {
                                                          items: [
                                                            {
                                                              use: 'DetailsItemModel',
                                                              stepParams: {
                                                                fieldSettings: {
                                                                  init: {
                                                                    collectionName: 'task',
                                                                    fieldPath: 'subject',
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
                                },
                              },
                            ],
                          },
                        },
                      ],
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

  const result = validateReadbackContract(popupPageModel, {
    requiredScopes: [
      {
        scopePath: '$.page.tabs[0].blocks[0].row-actions[0].popup.page',
        scopeKind: 'popup-page',
        pageUse: 'ChildPageModel',
        tabTitle: '',
        requireBlockGrid: true,
        requiredBlockUses: ['DetailsBlockModel'],
      },
    ],
    requiredDetailsBlocks: [
      {
        scopePath: '$.page.tabs[0].blocks[0].row-actions[0].popup.page',
        scopeKind: 'popup-page',
        collectionName: 'task',
        fieldPaths: ['subject', 'status'],
        minItemCount: 2,
        requireFilterByTkTemplate: true,
        expectedFilterByTkTemplate: '{{ctx.view.inputArgs.filterByTk}}',
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.findings.some((item) => item.code === 'READBACK_DETAILS_ITEM_COUNT_MISMATCH'), true);
});

test('augmentReadbackContractWithGridMembership materializes scope grid membership and validateReadbackContract catches unplaced items', () => {
  const writeModel = {
    use: 'RootPageModel',
    subModels: {
      tabs: [
        {
          use: 'RootPageTabModel',
          stepParams: {
            pageTabSettings: {
              tab: {
                title: '客户概览',
              },
            },
          },
          subModels: {
            grid: {
              use: 'BlockGridModel',
              stepParams: {
                gridSettings: {
                  grid: {
                    rows: {
                      row1: [
                        ['filter-1'],
                        ['table-1'],
                      ],
                    },
                    sizes: {
                      row1: [8, 16],
                    },
                    rowOrder: ['row1'],
                  },
                },
              },
              subModels: {
                items: [
                  {
                    uid: 'filter-1',
                    use: 'FilterFormBlockModel',
                  },
                  {
                    uid: 'table-1',
                    use: 'TableBlockModel',
                  },
                ],
              },
            },
          },
        },
      ],
    },
  };

  const contract = augmentReadbackContractWithGridMembership({
    requiredScopes: [
      {
        scopePath: '$.page.tabs[0]',
        scopeKind: 'root-tab',
        pageUse: 'RootPageTabModel',
        tabTitle: '客户概览',
        requireBlockGrid: true,
        requiredBlockUses: ['FilterFormBlockModel', 'TableBlockModel'],
      },
    ],
  }, writeModel);

  assert.deepEqual(contract.requiredGridMembership, [
    {
      scopePath: '$.page.tabs[0]',
      scopeKind: 'root-tab',
      gridUse: 'BlockGridModel',
      expectedItemCount: 2,
      expectedItemUses: ['FilterFormBlockModel', 'TableBlockModel'],
      expectedItemUids: ['filter-1', 'table-1'],
      requireBidirectionalLayoutMatch: true,
    },
  ]);

  const readbackModel = structuredClone(writeModel);
  readbackModel.subModels.tabs[0].subModels.grid.stepParams.gridSettings.grid.rows = {
    row1: [
      ['filter-1'],
    ],
  };
  readbackModel.subModels.tabs[0].subModels.grid.stepParams.gridSettings.grid.sizes = {
    row1: [24],
  };

  const result = validateReadbackContract(readbackModel, contract);
  assert.equal(result.ok, false);
  assert.equal(result.findings.some((item) => item.code === 'READBACK_GRID_ITEM_UNPLACED'), true);
});

test('buildReadbackDriftReport reports runtime-sensitive field shape drift', () => {
  const writeModel = {
    use: 'RootPageModel',
    subModels: {
      tabs: [
        {
          use: 'RootPageTabModel',
          stepParams: {
            pageTabSettings: {
              tab: {
                title: '任务',
              },
            },
          },
          subModels: {
            grid: {
              use: 'BlockGridModel',
              subModels: {
                items: [
                  {
                    use: 'DetailsBlockModel',
                    stepParams: {
                      resourceSettings: {
                        init: {
                          collectionName: 'task',
                        },
                      },
                    },
                    subModels: {
                      grid: {
                        use: 'DetailsGridModel',
                        subModels: {
                          items: [
                            {
                              use: 'DetailsItemModel',
                              stepParams: {
                                fieldSettings: {
                                  init: {
                                    collectionName: 'task',
                                    fieldPath: 'subject',
                                  },
                                },
                              },
                              subModels: {
                                field: {
                                  use: 'FieldModel',
                                  stepParams: {
                                    fieldBinding: {
                                      use: 'DisplayTextFieldModel',
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
  };

  const readbackModel = structuredClone(writeModel);
  readbackModel.subModels.tabs[0].subModels.grid.subModels.items[0].subModels.grid.subModels.items[0].subModels.field.use = 'DisplayTextFieldModel';
  delete readbackModel.subModels.tabs[0].subModels.grid.subModels.items[0].subModels.grid.subModels.items[0].subModels.field.stepParams.fieldBinding;

  const result = buildReadbackDriftReport(writeModel, readbackModel);

  assert.equal(result.ok, false);
  assert.equal(result.findings.some((item) => item.code === 'READBACK_FIELD_MODEL_SHAPE_DRIFT'), true);
});

test('normalizeFilterItemFieldModelUses rewrites association selector to scalar input when fieldPath resolves to scalar', () => {
  const model = {
    use: 'BlockGridModel',
    subModels: {
      items: [
        {
          use: 'FilterFormItemModel',
          stepParams: {
            fieldSettings: {
              init: {
                collectionName: 'projects',
                fieldPath: 'manager.nickname',
              },
            },
            filterFormItemSettings: {
              init: {
                filterField: {
                  name: 'manager',
                  title: '负责人',
                  interface: 'm2o',
                  type: 'belongsTo',
                },
              },
            },
          },
          subModels: {
            field: {
              use: 'FilterFormRecordSelectFieldModel',
            },
          },
        },
      ],
    },
  };
  const metadata = {
    collections: {
      projects: {
        name: 'projects',
        fields: [
          {
            name: 'manager',
            interface: 'manyToOne',
            type: 'belongsTo',
            target: 'users',
            foreignKey: 'manager_id',
            targetKey: 'id',
          },
        ],
      },
      users: {
        name: 'users',
        fields: [
          {
            name: 'nickname',
            interface: 'input',
            type: 'string',
          },
        ],
      },
    },
  };

  const changed = normalizeFilterItemFieldModelUses(model, metadata);

  assert.equal(changed, 1);
  assert.equal(model.subModels.items[0].subModels.field.use, 'InputFieldModel');
  assert.deepEqual(model.subModels.items[0].stepParams.filterFormItemSettings.init.filterField, {
    name: 'nickname',
    title: 'nickname',
    interface: 'input',
    type: 'string',
  });
});

test('normalizeFilterItemFieldModelUses rewrites top-level select fields from InputFieldModel to SelectFieldModel', () => {
  const model = {
    use: 'BlockGridModel',
    subModels: {
      items: [
        {
          use: 'FilterFormItemModel',
          stepParams: {
            fieldSettings: {
              init: {
                collectionName: 'projects',
                fieldPath: 'status',
              },
            },
            filterFormItemSettings: {
              init: {
                filterField: {
                  name: 'status',
                  title: '状态',
                  interface: 'input',
                  type: 'string',
                },
              },
            },
          },
          subModels: {
            field: {
              use: 'InputFieldModel',
            },
          },
        },
      ],
    },
  };
  const metadata = {
    collections: {
      projects: {
        name: 'projects',
        fields: [
          {
            name: 'status',
            interface: 'select',
            type: 'string',
          },
        ],
      },
    },
  };

  const changed = normalizeFilterItemFieldModelUses(model, metadata);

  assert.equal(changed, 1);
  assert.equal(model.subModels.items[0].subModels.field.use, 'SelectFieldModel');
  assert.deepEqual(model.subModels.items[0].stepParams.filterFormItemSettings.init.filterField, {
    name: 'status',
    title: 'status',
    interface: 'select',
    type: 'string',
  });
});
