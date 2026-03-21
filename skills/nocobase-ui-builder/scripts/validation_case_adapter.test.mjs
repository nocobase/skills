import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptCasePayload,
  getCaseAdapter,
  remapCaseCollectionName,
  remapCaseFieldPath,
} from './validation_case_adapter.mjs';

test('getCaseAdapter returns current-instance mappings for supported cases', () => {
  assert.equal(Boolean(getCaseAdapter('case1')), true);
  assert.equal(Boolean(getCaseAdapter('case9')), true);
  assert.equal(getCaseAdapter('case404'), null);
});

test('adaptCasePayload remaps case1 order collection and dotted customer field', () => {
  const payload = {
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'val03217_c1_orders',
        },
      },
      fieldSettings: {
        init: {
          collectionName: 'val03217_c1_orders',
          fieldPath: 'customer.name',
        },
      },
    },
  };

  const result = adaptCasePayload({
    caseId: 'case1',
    payload,
  });

  assert.equal(result.payload.stepParams.resourceSettings.init.collectionName, 'order');
  assert.equal(result.payload.stepParams.fieldSettings.init.collectionName, 'order');
  assert.equal(result.payload.stepParams.fieldSettings.init.fieldPath, 'account.name');
  assert.equal(result.payload.stepParams.fieldSettings.init.associationPathName, 'account');
});

test('adaptCasePayload remaps case9 activity payload to current event collection fields', () => {
  const payload = {
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'val03217_c9_activities',
        },
      },
      fieldSettings: {
        init: {
          collectionName: 'val03217_c9_activities',
          fieldPath: 'content',
        },
      },
    },
  };

  const result = adaptCasePayload({
    caseId: 'case9',
    payload,
  });

  assert.equal(result.payload.stepParams.resourceSettings.init.collectionName, 'event');
  assert.equal(result.payload.stepParams.fieldSettings.init.collectionName, 'event');
  assert.equal(result.payload.stepParams.fieldSettings.init.fieldPath, 'subject');
});

test('adaptCasePayload remaps case2 account owner foreign key to dotted owner binding', () => {
  const payload = {
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'val03217_c2_customers',
          fieldPath: 'owner_id',
        },
      },
    },
  };

  const result = adaptCasePayload({
    caseId: 'case2',
    payload,
  });

  assert.equal(result.payload.stepParams.fieldSettings.init.collectionName, 'account');
  assert.equal(result.payload.stepParams.fieldSettings.init.fieldPath, 'owner.nickname');
  assert.equal(result.payload.stepParams.fieldSettings.init.associationPathName, 'owner');
});

test('adaptCasePayload remaps case3 foreign keys to readable association paths', () => {
  const payload = {
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'val03217_c3_purchase_orders',
          fieldPath: 'supplier_id',
        },
      },
    },
  };

  const result = adaptCasePayload({
    caseId: 'case3',
    payload,
  });

  assert.equal(result.payload.stepParams.fieldSettings.init.collectionName, 'val03217_c3_purchase_orders');
  assert.equal(result.payload.stepParams.fieldSettings.init.fieldPath, 'supplier.name');
  assert.equal(result.payload.stepParams.fieldSettings.init.associationPathName, 'supplier');
});

test('remap helpers support half-remapped collection aliases', () => {
  assert.equal(remapCaseCollectionName({
    caseId: 'case2',
    collectionName: 'customers',
  }), 'account');
  assert.equal(remapCaseFieldPath({
    caseId: 'case2',
    collectionName: 'account',
    fieldPath: 'owner_id',
  }), 'owner.nickname');
  assert.equal(remapCaseFieldPath({
    caseId: 'case2',
    collectionName: 'opportunity',
    fieldPath: 'customer_id',
  }), 'account_id');
  assert.equal(remapCaseCollectionName({
    caseId: 'case6',
    collectionName: 'invoices',
  }), 'val03217_c6_invoices');
  assert.equal(remapCaseCollectionName({
    caseId: 'case10',
    collectionName: 'orders',
  }), 'val03217_c10_orders');
});

test('adaptCasePayload remaps filter path and filterField descriptor names', () => {
  const payload = {
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'val03217_c2_opportunities',
        },
      },
      tableSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [
              {
                path: 'customer_id',
                operator: '$eq',
                value: 1,
              },
            ],
          },
        },
      },
      filterFormItemSettings: {
        init: {
          filterField: {
            name: 'customer_id',
            title: '客户',
            interface: 'm2o',
          },
        },
      },
    },
  };

  const result = adaptCasePayload({
    caseId: 'case2',
    payload,
  });

  assert.equal(result.payload.stepParams.resourceSettings.init.collectionName, 'opportunity');
  assert.equal(result.payload.stepParams.tableSettings.dataScope.filter.items[0].path, 'account_id');
  assert.equal(result.payload.stepParams.filterFormItemSettings.init.filterField.name, 'account_id');
});

test('adaptCasePayload strips case7 empty popup shells but keeps actions', () => {
  const payload = {
    use: 'TableBlockModel',
    subModels: {
      columns: [
        {
          use: 'TableActionsColumnModel',
          subModels: {
            actions: [
              {
                use: 'EditActionModel',
                stepParams: {
                  buttonSettings: {
                    general: {
                      title: '编辑部门',
                    },
                  },
                },
                subModels: {
                  page: {
                    use: 'ChildPageModel',
                    subModels: {
                      tabs: [
                        {
                          use: 'ChildPageTabModel',
                          subModels: {
                            grid: {
                              use: 'BlockGridModel',
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

  const result = adaptCasePayload({
    caseId: 'case7',
    payload,
  });

  assert.equal(result.payload.subModels.columns[0].subModels.actions[0].use, 'EditActionModel');
  assert.equal(Object.prototype.hasOwnProperty.call(result.payload.subModels.columns[0].subModels.actions[0].subModels, 'page'), false);
  assert.equal(result.changes.some((item) => item.type === 'stripEmptyPopupPage'), true);
});

test('adaptCasePayload remaps case3 foreign keys to dotted association display fields', () => {
  const payload = {
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'purchase_orders',
          fieldPath: 'supplier_id',
        },
      },
    },
  };

  const result = adaptCasePayload({
    caseId: 'case3',
    payload,
  });

  assert.equal(result.payload.stepParams.fieldSettings.init.collectionName, 'val03217_c3_purchase_orders');
  assert.equal(result.payload.stepParams.fieldSettings.init.fieldPath, 'supplier.name');
  assert.equal(result.payload.stepParams.fieldSettings.init.associationPathName, 'supplier');
});

test('adaptCasePayload remaps case8 nested member filter to existing team_members foreign key', () => {
  const payload = {
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'val03217_c8_project_members',
        },
      },
      tableSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [
              {
                path: 'project_id',
                operator: '$eq',
                value: 1,
              },
            ],
          },
        },
      },
    },
  };

  const result = adaptCasePayload({
    caseId: 'case8',
    payload,
  });

  assert.equal(result.payload.stepParams.resourceSettings.init.collectionName, 'team_members');
  assert.equal(result.payload.stepParams.tableSettings.dataScope.filter.items[0].path, 'team_id');
});

test('adaptCasePayload normalizes case4 project owner filter to schema-compatible scalar field', () => {
  const payload = {
    use: 'FilterFormItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'val03217_c4_projects_r1',
          fieldPath: 'owner',
        },
      },
      filterFormItemSettings: {
        init: {
          filterField: {
            name: 'owner',
            title: '负责人',
            interface: 'input',
            type: 'string',
          },
        },
      },
    },
    subModels: {
      field: {
        use: 'FilterFormRecordSelectFieldModel',
      },
    },
  };

  const result = adaptCasePayload({
    caseId: 'case4',
    payload,
  });

  assert.equal(result.payload.stepParams.fieldSettings.init.collectionName, 'projects');
  assert.equal(result.payload.stepParams.fieldSettings.init.fieldPath, 'manager_id');
  assert.equal(result.payload.stepParams.filterFormItemSettings.init.filterField.name, 'manager_id');
  assert.equal(result.payload.subModels.field.use, 'NumberFieldModel');
  assert.equal(result.changes.some((item) => item.type === 'fieldModelOverride'), true);
});

test('adaptCasePayload tolerates case definitions without collection remap map', () => {
  const payload = {
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'val03217_c3_purchase_orders',
          fieldPath: 'supplier_id',
        },
      },
    },
  };

  const result = adaptCasePayload({
    caseId: 'case3',
    payload,
  });

  assert.equal(result.payload.stepParams.fieldSettings.init.collectionName, 'val03217_c3_purchase_orders');
  assert.equal(result.payload.stepParams.fieldSettings.init.fieldPath, 'supplier.name');
});
