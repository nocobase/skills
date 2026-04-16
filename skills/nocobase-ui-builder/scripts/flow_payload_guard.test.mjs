import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  BLOCKER_EXIT_CODE,
  GENERAL_MODE,
  VALIDATION_CASE_MODE,
  auditPayload,
  buildFilterGroup,
  buildQueryFilter,
  canonicalizePayload,
  extractRequiredMetadata,
} from './flow_payload_guard.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./flow_payload_guard.mjs', import.meta.url));
const SKILL_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

const metadata = {
  collections: {
    orders: {
      titleField: 'order_no',
      filterTargetKey: 'id',
      fields: [
        { name: 'order_no', type: 'string', interface: 'input' },
        { name: 'status', type: 'string', interface: 'select' },
        { name: 'customer', type: 'belongsTo', interface: 'm2o', target: 'customers', foreignKey: 'customer_id', targetKey: 'id' },
      ],
    },
    customers: {
      fields: [
        { name: 'name', type: 'string', interface: 'input' },
      ],
    },
    order_items: {
      titleField: 'id',
      filterTargetKey: 'id',
      fields: [
        { name: 'quantity', type: 'integer', interface: 'number' },
        { name: 'order', type: 'belongsTo', interface: 'm2o', target: 'orders', foreignKey: 'order_id', targetKey: 'id' },
      ],
    },
    project_members: {
      titleField: 'id',
      fields: [
        { name: 'role', type: 'string', interface: 'select' },
      ],
    },
    departments: {
      titleField: 'name',
      filterTargetKey: 'id',
      fields: [
        { name: 'name', type: 'string', interface: 'input' },
      ],
    },
    approval_requests: {
      titleField: 'title',
      filterTargetKey: 'id',
      fields: [
        { name: 'title', type: 'string', interface: 'input' },
        { name: 'status', type: 'string', interface: 'select' },
      ],
    },
  },
};

function makeFieldBindingSubModel({ use, init }) {
  return {
    use: 'FieldModel',
    stepParams: {
      fieldBinding: {
        use,
      },
      fieldSettings: {
        init,
      },
    },
  };
}

function makeClickableAssociationTitleColumn({ bindingUse = 'DisplayTextFieldModel', includePopup = true } = {}) {
  const fieldNode = makeFieldBindingSubModel({
    use: bindingUse,
    init: {
      collectionName: 'orders',
      fieldPath: 'customer.name',
      associationPathName: 'customer',
    },
  });
  fieldNode.stepParams.displayFieldSettings = {
    clickToOpen: {
      clickToOpen: true,
    },
  };
  if (includePopup) {
    fieldNode.stepParams.popupSettings = {
      openView: {
        collectionName: 'customers',
        associationName: 'orders.customer',
        pageModelClass: 'ChildPageModel',
      },
    };
  }
  if (bindingUse === 'JSFieldModel') {
    fieldNode.stepParams.jsSettings = {
      runJs: {
        version: 'v2',
        code: 'ctx.render(String(ctx.value ?? ""));',
      },
    };
  }
  return {
    use: 'TableColumnModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer.name',
          associationPathName: 'customer',
        },
      },
    },
    subModels: {
      field: fieldNode,
    },
  };
}

function makeCollectionResourceInit(collectionName, extra = {}) {
  return {
    dataSourceKey: 'main',
    collectionName,
    ...extra,
  };
}

const metadataWithCompositeProjectMembers = {
  collections: {
    ...metadata.collections,
    project_members: {
      titleField: 'role',
      filterTargetKey: ['project_id', 'user_id'],
      fields: [
        { name: 'project_id', type: 'bigInt', interface: 'integer' },
        { name: 'user_id', type: 'bigInt', interface: 'integer' },
        { name: 'role', type: 'string', interface: 'select' },
      ],
    },
  },
};

const metadataWithCustomerTitle = {
  collections: {
    ...metadata.collections,
    orders: {
      titleField: 'order_no',
      filterTargetKey: 'id',
      fields: [
        { name: 'order_no', type: 'string', interface: 'input' },
        { name: 'status', type: 'string', interface: 'select' },
        { name: 'customer_id', type: 'integer', interface: 'number' },
        { name: 'customer', type: 'belongsTo', interface: 'm2o', target: 'customers', foreignKey: 'customer_id', targetKey: 'id' },
      ],
    },
    customers: {
      titleField: 'name',
      fields: metadata.collections.customers.fields,
    },
  },
};

const metadataWithVerifiedOrderItemsRelation = {
  collections: {
    ...metadata.collections,
    orders: {
      titleField: 'order_no',
      filterTargetKey: 'id',
      fields: [
        { name: 'order_no', type: 'string', interface: 'input' },
        { name: 'status', type: 'string', interface: 'select' },
        { name: 'customer', type: 'belongsTo', interface: 'm2o', target: 'customers', foreignKey: 'customer_id' },
        { name: 'order_items', type: 'hasMany', interface: 'o2m', target: 'order_items' },
      ],
    },
  },
};

const metadataWithTargetKeyOnlyRelation = {
  collections: {
    teams: {
      titleField: 'name',
      fields: [
        { name: 'slug', type: 'string', interface: 'input' },
        { name: 'name', type: 'string', interface: 'input' },
      ],
    },
    team_memberships: {
      titleField: 'id',
      fields: [
        { name: 'role', type: 'string', interface: 'select' },
        { name: 'team', type: 'belongsTo', interface: 'm2o', target: 'teams', targetKey: 'slug' },
      ],
    },
  },
};

const metadataWithAssociationFilterTargetMissingTitleField = {
  collections: {
    projects: {
      titleField: 'name',
      fields: [
        { name: 'name', type: 'string', interface: 'input' },
        { name: 'status', type: 'string', interface: 'select' },
        { name: 'owner', type: 'belongsTo', interface: 'm2o', target: 'users', foreignKey: 'owner_id', targetKey: 'id' },
      ],
    },
    users: {
      filterTargetKey: 'id',
      fields: [
        { name: 'id', type: 'integer', interface: 'number' },
        { name: 'nickname', type: 'string', interface: 'input' },
      ],
    },
  },
};

const metadataWithAssociationFormTargetFilterKeyOnly = {
  collections: {
    orders: {
      titleField: 'order_no',
      filterTargetKey: 'id',
      fields: [
        { name: 'order_no', type: 'string', interface: 'input' },
        { name: 'customer', type: 'belongsTo', interface: 'm2o', target: 'customers', foreignKey: 'customer_id', targetKey: 'id' },
      ],
    },
    customers: {
      filterTargetKey: 'id',
      fields: [
        { name: 'name', type: 'string', interface: 'input' },
      ],
    },
  },
};

const metadataWithAssociationFormInvalidTitleField = {
  collections: {
    orders: metadataWithAssociationFormTargetFilterKeyOnly.collections.orders,
    customers: {
      titleField: 'nickname',
      filterTargetKey: 'id',
      fields: [
        { name: 'name', type: 'string', interface: 'input' },
      ],
    },
  },
};

const metadataWithAssociationFormMissingTargetFields = {
  collections: {
    orders: metadataWithAssociationFormTargetFilterKeyOnly.collections.orders,
    customers: {
      filterTargetKey: 'id',
      fields: [],
    },
  },
};

const metadataWithAssociationFormBindingInterfaceMissing = {
  collections: {
    orders: metadataWithAssociationFormTargetFilterKeyOnly.collections.orders,
    customers: {
      titleField: 'name',
      filterTargetKey: 'id',
      fields: [
        { name: 'name', type: 'string' },
      ],
    },
  },
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeOrdersFilterTableGrid({ filterManager } = {}) {
  const payload = {
    use: 'BlockGridModel',
    subModels: {
      items: [
        {
          uid: 'orders-filter-block',
          use: 'FilterFormBlockModel',
          stepParams: {
            resourceSettings: {
              init: makeCollectionResourceInit('orders'),
            },
          },
          subModels: {
            grid: {
              use: 'FilterFormGridModel',
              subModels: {
                items: [
                  {
                    uid: 'order-no-filter',
                    use: 'FilterFormItemModel',
                    stepParams: {
                      fieldSettings: {
                        init: {
                          collectionName: 'orders',
                          fieldPath: 'order_no',
                        },
                      },
                      filterFormItemSettings: {
                        init: {
                          defaultTargetUid: 'orders-table',
                          filterField: {
                            name: 'order_no',
                            title: '订单号',
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
                  {
                    uid: 'customer-filter',
                    use: 'FilterFormItemModel',
                    stepParams: {
                      fieldSettings: {
                        init: {
                          collectionName: 'orders',
                          fieldPath: 'customer',
                        },
                      },
                      filterFormItemSettings: {
                        init: {
                          defaultTargetUid: 'orders-table',
                          filterField: {
                            name: 'customer',
                            title: '客户',
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
            },
            actions: [
              {
                use: 'FilterFormSubmitActionModel',
              },
              {
                use: 'FilterFormResetActionModel',
              },
            ],
          },
        },
        {
          uid: 'orders-table',
          use: 'TableBlockModel',
          stepParams: {
            resourceSettings: {
              init: makeCollectionResourceInit('orders'),
            },
          },
          subModels: {
            columns: [],
            actions: [],
          },
        },
      ],
    },
  };

  if (filterManager !== undefined) {
    payload.filterManager = cloneJson(filterManager);
  }

  return payload;
}

function makePopupPageWithTable(filter) {
  return {
    use: 'ViewActionModel',
    stepParams: {
      popupSettings: {
        openView: {
          mode: 'drawer',
          collectionName: 'orders',
          pageModelClass: 'ChildPageModel',
          filterByTk: '{{ctx.record.id}}',
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
                  subModels: {
                    items: [
                      {
                        use: 'TableBlockModel',
                        stepParams: {
                          resourceSettings: {
                            init: makeCollectionResourceInit('project_members'),
                          },
                          tableSettings: {
                            dataScope: {
                              filter,
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
  };
}

function makePopupPageWithChildTab(tableBlock) {
  const normalizedTableBlock = cloneJson(tableBlock);
  const resourceInit = normalizedTableBlock?.stepParams?.resourceSettings?.init;
  if (
    resourceInit
    && typeof resourceInit === 'object'
    && typeof resourceInit.collectionName === 'string'
    && resourceInit.collectionName.trim()
    && !(typeof resourceInit.dataSourceKey === 'string' && resourceInit.dataSourceKey.trim())
  ) {
    normalizedTableBlock.stepParams.resourceSettings.init = makeCollectionResourceInit(
      resourceInit.collectionName,
      resourceInit,
    );
  }

  return {
    use: 'ViewActionModel',
    stepParams: {
      popupSettings: {
        openView: {
          mode: 'drawer',
          collectionName: 'orders',
          pageModelClass: 'ChildPageModel',
          filterByTk: '{{ctx.record.id}}',
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
                  subModels: {
                    items: [normalizedTableBlock],
                  },
                },
              },
            },
          ],
        },
      },
    },
  };
}

function makeEditRecordPopupAction(collectionName = 'order_items') {
  return {
    use: 'EditActionModel',
    stepParams: {
      buttonSettings: {
        general: {
          title: '编辑记录',
        },
      },
      popupSettings: {
        openView: {
          mode: 'dialog',
          collectionName,
          pageModelClass: 'ChildPageModel',
          filterByTk: '{{ctx.record.id}}',
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
                  subModels: {
                    items: [
                      {
                        use: 'EditFormModel',
                        stepParams: {
                          resourceSettings: {
                            init: makeCollectionResourceInit(collectionName, {
                              filterByTk: '{{ctx.view.inputArgs.filterByTk}}',
                            }),
                          },
                        },
                        subModels: {
                          grid: {
                            use: 'FormGridModel',
                            subModels: {
                              items: [
                                {
                                  use: 'FormItemModel',
                                  stepParams: {
                                    fieldSettings: {
                                      init: {
                                        collectionName,
                                        fieldPath: 'quantity',
                                      },
                                    },
                                  },
                                  subModels: {
                                    field: makeFieldBindingSubModel({
                                      use: 'InputFieldModel',
                                      init: {
                                        collectionName,
                                        fieldPath: 'quantity',
                                      },
                                    }),
                                  },
                                },
                              ],
                            },
                          },
                          actions: [
                            {
                              use: 'FormSubmitActionModel',
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
      },
    },
  };
}

function makeCreatePopupAction(collectionName = 'order_items', title = '新建记录') {
  return {
    use: 'AddNewActionModel',
    stepParams: {
      buttonSettings: {
        general: {
          title,
        },
      },
      popupSettings: {
        openView: {
          mode: 'dialog',
          collectionName,
          pageModelClass: 'ChildPageModel',
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
                  subModels: {
                    items: [
                      {
                        use: 'CreateFormModel',
                        stepParams: {
                          resourceSettings: {
                            init: makeCollectionResourceInit(collectionName),
                          },
                        },
                        subModels: {
                          grid: {
                            use: 'FormGridModel',
                            subModels: {
                              items: [
                                {
                                  use: 'FormItemModel',
                                  stepParams: {
                                    fieldSettings: {
                                      init: {
                                        collectionName,
                                        fieldPath: 'quantity',
                                      },
                                    },
                                  },
                                  subModels: {
                                    field: makeFieldBindingSubModel({
                                      use: 'InputFieldModel',
                                      init: {
                                        collectionName,
                                        fieldPath: 'quantity',
                                      },
                                    }),
                                  },
                                },
                              ],
                            },
                          },
                          actions: [
                            {
                              use: 'FormSubmitActionModel',
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
      },
    },
  };
}

function makeViewRecordPopupAction(collectionName = 'order_items', title = '查看详情') {
  return {
    use: 'ViewActionModel',
    stepParams: {
      buttonSettings: {
        general: {
          title,
        },
      },
      popupSettings: {
        openView: {
          mode: 'dialog',
          collectionName,
          pageModelClass: 'ChildPageModel',
          filterByTk: '{{ctx.record.id}}',
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
                  subModels: {
                    items: [
                      {
                        use: 'DetailsBlockModel',
                        stepParams: {
                          resourceSettings: {
                            init: makeCollectionResourceInit(collectionName, {
                              filterByTk: '{{ctx.view.inputArgs.filterByTk}}',
                            }),
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
                                        collectionName,
                                        fieldPath: 'quantity',
                                      },
                                    },
                                  },
                                  subModels: {
                                    field: makeFieldBindingSubModel({
                                      use: 'DisplayTextFieldModel',
                                      init: {
                                        collectionName,
                                        fieldPath: 'quantity',
                                      },
                                    }),
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
  };
}

function makeAddChildPopupAction(collectionName = 'departments', title = '新增下级部门') {
  return {
    use: 'AddChildActionModel',
    stepParams: {
      buttonSettings: {
        general: {
          title,
        },
      },
      popupSettings: {
        openView: {
          mode: 'drawer',
          collectionName,
          pageModelClass: 'ChildPageModel',
          filterByTk: '{{ctx.record.id}}',
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
                  subModels: {
                    items: [
                      {
                        use: 'CreateFormModel',
                        stepParams: {
                          resourceSettings: {
                            init: makeCollectionResourceInit(collectionName),
                          },
                        },
                        subModels: {
                          grid: {
                            use: 'FormGridModel',
                            subModels: {
                              items: [],
                            },
                          },
                          actions: [
                            {
                              use: 'FormSubmitActionModel',
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
      },
    },
  };
}

function makeDeleteRecordAction(title = '删除记录') {
  return {
    use: 'DeleteActionModel',
    stepParams: {
      buttonSettings: {
        general: {
          title,
        },
      },
    },
  };
}

function makeEditFormBlock({
  collectionName = 'order_items',
  includeActions = true,
  includeFieldSubModel = true,
  putSubmitInGridItems = false,
} = {}) {
  const items = [
    {
      use: 'FormItemModel',
      stepParams: {
        fieldSettings: {
          init: {
            collectionName,
            fieldPath: 'quantity',
          },
        },
      },
      ...(includeFieldSubModel
        ? {
            subModels: {
              field: makeFieldBindingSubModel({
                use: 'InputFieldModel',
                init: {
                  collectionName,
                  fieldPath: 'quantity',
                },
              }),
            },
          }
        : {}),
    },
  ];

  if (putSubmitInGridItems) {
    items.push({
      use: 'FormSubmitActionModel',
    });
  }

  return {
    use: 'EditFormModel',
    stepParams: {
      resourceSettings: {
        init: makeCollectionResourceInit(collectionName, {
          filterByTk: '{{ctx.view.inputArgs.filterByTk}}',
        }),
      },
    },
    subModels: {
      grid: {
        use: 'FormGridModel',
        subModels: {
          items,
        },
      },
      actions: includeActions
        ? [
            {
              use: 'FormSubmitActionModel',
            },
          ]
        : [],
    },
  };
}

function makeActionTargetBlock(collectionName = 'order_items', actions = []) {
  return {
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: makeCollectionResourceInit(collectionName),
      },
    },
    subModels: {
      actions,
    },
  };
}

function makeDetailsActionTargetBlock(collectionName = 'orders', actions = []) {
  return {
    use: 'DetailsBlockModel',
    stepParams: {
      resourceSettings: {
        init: makeCollectionResourceInit(collectionName, {
          filterByTk: '{{ctx.view.inputArgs.filterByTk}}',
        }),
      },
    },
    subModels: {
      grid: {
        use: 'DetailsGridModel',
      },
      actions,
    },
  };
}

function makeRowActionTargetBlock(collectionName = 'order_items', actions = []) {
  return {
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: makeCollectionResourceInit(collectionName),
      },
    },
    subModels: {
      columns: [
        {
          use: 'TableActionsColumnModel',
          subModels: {
            actions,
          },
        },
      ],
    },
  };
}

function makeFilterFormBlock(actions = []) {
  return {
    use: 'FilterFormBlockModel',
    stepParams: {
      resourceSettings: {
        init: makeCollectionResourceInit('orders'),
      },
      formFilterBlockModelSettings: {
        layout: {
          layout: 'horizontal',
          colon: false,
        },
        defaultValues: {
          value: [],
        },
      },
    },
    subModels: {
      grid: {
        use: 'FilterFormGridModel',
        subModels: {
          items: [],
        },
      },
      actions,
    },
  };
}

function makeFilterFormItem({
  collectionName = 'orders',
  fieldPath = 'status',
  includeFieldSubModel = true,
  includeFilterField = true,
} = {}) {
  return {
    use: 'FilterFormItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName,
          fieldPath,
        },
      },
      ...(includeFilterField
        ? {
            filterFormItemSettings: {
              init: {
                filterField: {
                  name: fieldPath,
                  interface: 'input',
                  type: 'string',
                },
              },
            },
          }
        : {}),
    },
    ...(includeFieldSubModel
      ? {
          subModels: {
            field: {
              use: 'InputFieldModel',
              stepParams: {
                fieldSettings: {
                  init: {
                    collectionName,
                    fieldPath,
                  },
                },
              },
            },
          },
        }
      : {}),
  };
}

function makeFilterFormBlockWithItems(items, actions = []) {
  return {
    use: 'FilterFormBlockModel',
    stepParams: {
      resourceSettings: {
        init: makeCollectionResourceInit('orders'),
      },
      formFilterBlockModelSettings: {
        layout: {
          layout: 'horizontal',
          colon: false,
        },
        defaultValues: {
          value: [],
        },
      },
    },
    subModels: {
      grid: {
        use: 'FilterFormGridModel',
        subModels: {
          items,
        },
      },
      actions,
    },
  };
}

function makeVisibleTabsPage({
  pageUse = 'RootPageModel',
  pageUid = 'page-root',
  tabUse = 'RootPageTabModel',
  tabUidPrefix = 'tab',
  gridUidPrefix = 'grid',
  itemUse = 'TableBlockModel',
  itemUidPrefix = 'item',
  titles = ['客户概览', '联系人'],
} = {}) {
  return {
    uid: pageUid,
    use: pageUse,
    subModels: {
      tabs: titles.map((title, index) => ({
        uid: `${tabUidPrefix}-${index + 1}`,
        use: tabUse,
        stepParams: {
          pageTabSettings: {
            tab: {
              title,
            },
          },
        },
        subModels: {
          grid: {
            uid: `${gridUidPrefix}-${index + 1}`,
            use: 'BlockGridModel',
            subModels: {
              items: [
                {
                  uid: `${itemUidPrefix}-${index + 1}`,
                  use: itemUse,
                  stepParams: {
                    resourceSettings: {
                      init: makeCollectionResourceInit('orders'),
                    },
                  },
                },
              ],
            },
          },
        },
      })),
    },
  };
}

test('buildFilterGroup returns a valid FilterGroupType wrapper', () => {
  assert.deepEqual(
    buildFilterGroup({
      logic: '$and',
      condition: {
        path: 'customer',
        operator: '$eq',
        value: '{{ctx.record.id}}',
      },
    }),
    {
      filter: {
        logic: '$and',
        items: [
          {
            path: 'customer',
            operator: '$eq',
            value: '{{ctx.record.id}}',
          },
        ],
      },
    },
  );
});

test('buildQueryFilter returns a valid server query filter wrapper', () => {
  assert.deepEqual(
    buildQueryFilter({
      logic: '$and',
      condition: {
        path: 'customer',
        operator: '$eq',
        value: '{{ctx.record.id}}',
      },
    }),
    {
      filter: {
        $and: [
          {
            customer: {
              $eq: '{{ctx.record.id}}',
            },
          },
        ],
      },
    },
  );
});

test('canonicalizePayload rewrites JSBlock resource reads from ctx.request to resource API', () => {
  const payload = {
    use: 'JSBlockModel',
    stepParams: {
      jsSettings: {
        runJs: {
          version: 'v2',
          code: `const filter = {
  logic: '$and',
  items: [
    { path: 'owner_id', operator: '$eq', value: currentUserId },
  ],
};
const response = await ctx.request({
  url: 'task:list',
  method: 'get',
  params: {
    pageSize: 100,
    sort: ['due_date'],
    filter,
  },
  skipNotify: true,
});
const rows = Array.isArray(response?.data?.data) ? response.data.data : [];`,
        },
      },
    },
  };

  const result = canonicalizePayload({
    payload,
    metadata: {},
    mode: VALIDATION_CASE_MODE,
  });

  const nextCode = result.payload.stepParams.jsSettings.runJs.code;
  assert.equal(nextCode.includes("ctx.makeResource('MultiRecordResource')"), true);
  assert.equal(nextCode.includes('__runjsResource.setFilter'), true);
  assert.equal(result.transforms.some((item) => item.code === 'RUNJS_REQUEST_FILTER_GROUP_TO_QUERY_FILTER'), true);
  assert.equal(result.transforms.some((item) => item.code === 'RUNJS_REQUEST_LIST_TO_MULTI_RECORD_RESOURCE'), true);
  assert.deepEqual(result.runjsCanonicalization, {
    blockerCount: 0,
    warningCount: 1,
    autoRewriteCount: 1,
  });
});

test('auditPayload exposes runjs semantic warning summary for resource reads left on ctx.request', () => {
  const payload = {
    use: 'JSBlockModel',
    stepParams: {
      jsSettings: {
        runJs: {
          version: 'v2',
          code: `const response = await ctx.request({
  url: 'task:list',
  method: 'get',
  params: {
    pageSize: 20,
  },
});`,
        },
      },
    },
  };

  const result = auditPayload({
    payload,
    metadata: {},
    mode: GENERAL_MODE,
  });

  assert.equal(result.ok, true);
  assert.equal(result.warnings.some((item) => item.code === 'RUNJS_RESOURCE_REQUEST_LEFT_ON_CTX_REQUEST'), true);
  assert.equal(result.runjsInspection.semanticBlockerCount, 0);
  assert.equal(result.runjsInspection.semanticWarningCount > 0, true);
  assert.equal(result.runjsInspection.autoRewriteCount, 1);
});

test('extractRequiredMetadata collects collection refs, field refs, and popup checks', () => {
  const payload = {
    use: 'ViewActionModel',
    stepParams: {
      popupSettings: {
        openView: {
          collectionName: 'orders',
          pageModelClass: 'ChildPageModel',
        },
      },
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer',
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
                  subModels: {
                    items: [
                      {
                        use: 'TableBlockModel',
                        stepParams: {
                          resourceSettings: {
                            init: {
                              collectionName: 'project_members',
                            },
                          },
                          tableSettings: {
                            dataScope: {
                              filter: {
                                logic: '$and',
                                items: [
                                  {
                                    path: 'order_id',
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
  };

  const result = extractRequiredMetadata({ payload });
  assert.equal(result.collectionRefs.some((item) => item.collectionName === 'orders'), true);
  assert.equal(result.collectionRefs.some((item) => item.collectionName === 'project_members'), true);
  assert.equal(result.fieldRefs.some((item) => item.collectionName === 'orders' && item.fieldPath === 'customer'), true);
  assert.deepEqual(result.popupContextChecks, [
    {
      actionUse: 'ViewActionModel',
      path: '$',
      requiresInputArgsFilterByTk: true,
      openViewCollectionName: 'orders',
      hasFilterByTk: false,
    },
  ]);
});

test('extractRequiredMetadata expands transitive association target collections when metadata is provided', () => {
  const payload = {
    use: 'TableColumnModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'projects',
          fieldPath: 'owner.nickname',
        },
      },
    },
  };

  const result = extractRequiredMetadata({
    payload,
    metadata: {
      collections: {
        projects: {
          titleField: 'name',
          fields: [
            { name: 'name', type: 'string', interface: 'input' },
            { name: 'owner', type: 'belongsTo', interface: 'm2o', target: 'users', foreignKey: 'owner_id', targetKey: 'id' },
          ],
        },
        users: {
          titleField: 'nickname',
          fields: [
            { name: 'nickname', type: 'string', interface: 'input' },
          ],
        },
      },
    },
  });

  assert.equal(result.collectionRefs.some((item) => item.collectionName === 'projects'), true);
  assert.equal(result.collectionRefs.some((item) => item.collectionName === 'users' && item.reason === 'fieldPath.associationTarget'), true);
  assert.equal(result.fieldRefs.some((item) => item.collectionName === 'projects' && item.fieldPath === 'owner.nickname'), true);
});

test('auditPayload blocks malformed filter items that use field instead of path', () => {
  const payload = {
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: makeCollectionResourceInit('orders'),
      },
      tableSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [
              {
                field: 'customer_id',
                operator: '$eq',
                value: 1,
              },
            ],
          },
        },
      },
    },
  };

  const result = auditPayload({ payload, metadata, mode: GENERAL_MODE });
  assert.equal(result.ok, false);
  assert.deepEqual(result.blockers.map((item) => item.code), ['FILTER_ITEM_USES_FIELD_NOT_PATH']);
});

test('auditPayload blocks malformed filter groups', () => {
  const payload = {
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'orders',
        },
      },
      tableSettings: {
        dataScope: {
          filter: {
            items: [42],
          },
        },
      },
    },
  };

  const result = auditPayload({ payload, metadata, mode: GENERAL_MODE });
  assert.equal(result.blockers.some((item) => item.code === 'FILTER_GROUP_MALFORMED'), true);
});

test('auditPayload blocks unsupported filter logic values', () => {
  const payload = {
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'orders',
        },
      },
      tableSettings: {
        dataScope: {
          filter: {
            logic: 'BAD',
            items: [
              {
                logic: '$xor',
                items: [],
              },
            ],
          },
        },
      },
    },
  };

  const result = auditPayload({ payload, metadata, mode: VALIDATION_CASE_MODE });
  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'FILTER_LOGIC_UNSUPPORTED'), true);
});

test('auditPayload blocks foreign keys used as fieldPath', () => {
  const payload = {
    use: 'FormItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer_id',
        },
      },
    },
  };

  const result = auditPayload({ payload, metadata, mode: GENERAL_MODE });
  assert.equal(result.blockers.some((item) => item.code === 'FOREIGN_KEY_USED_AS_FIELD_PATH'), true);
});

test('auditPayload blocks foreign keys used as fieldPath even when physical foreign key metadata exists', () => {
  const payload = {
    use: 'FilterFormItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer_id',
        },
      },
      filterFormItemSettings: {
        init: {
          filterField: {
            name: 'customer_id',
            title: '客户',
            interface: 'number',
            type: 'integer',
          },
        },
      },
    },
    subModels: {
      field: {
        use: 'NumberFieldModel',
      },
    },
  };

  const result = auditPayload({ payload, metadata: metadataWithCustomerTitle, mode: GENERAL_MODE });
  assert.equal(result.blockers.some((item) => item.code === 'FOREIGN_KEY_USED_AS_FIELD_PATH'), true);
});

test('auditPayload blocks association filter record select when target collection has no titleField', () => {
  const payload = {
    use: 'FilterFormItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'projects',
          fieldPath: 'owner',
        },
      },
      filterFormItemSettings: {
        init: {
          filterField: {
            name: 'owner',
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
        stepParams: {
          fieldSettings: {
            init: {
              collectionName: 'projects',
              fieldPath: 'owner',
            },
          },
        },
      },
    },
  };

  const result = auditPayload({
    payload,
    metadata: metadataWithAssociationFilterTargetMissingTitleField,
    mode: VALIDATION_CASE_MODE,
  });
  assert.equal(
    result.blockers.some((item) => item.code === 'FILTER_FORM_ASSOCIATION_REQUIRES_EXPLICIT_SCALAR_PATH'),
    true,
  );
});

test('auditPayload allows form association record select when target collection only exposes filterTargetKey', () => {
  const payload = {
    use: 'FormItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer',
        },
      },
    },
    subModels: {
      field: {
        use: 'RecordSelectFieldModel',
        stepParams: {
          fieldSettings: {
            init: {
              collectionName: 'orders',
              fieldPath: 'customer',
            },
          },
        },
      },
    },
  };

  const result = auditPayload({
    payload,
    metadata: metadataWithAssociationFormTargetFilterKeyOnly,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, true);
  assert.equal(result.blockers.some((item) => item.code === 'ASSOCIATION_DISPLAY_TARGET_UNRESOLVED'), false);
  assert.equal(result.blockers.some((item) => item.code === 'FILTER_FORM_ASSOCIATION_REQUIRES_EXPLICIT_SCALAR_PATH'), false);
});

test('auditPayload blocks form association record select when target titleField cannot be resolved', () => {
  const payload = {
    use: 'FormItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer',
        },
      },
    },
    subModels: {
      field: {
        use: 'RecordSelectFieldModel',
        stepParams: {
          fieldSettings: {
            init: {
              collectionName: 'orders',
              fieldPath: 'customer',
            },
          },
        },
      },
    },
  };

  const result = auditPayload({
    payload,
    metadata: metadataWithAssociationFormInvalidTitleField,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'ASSOCIATION_INPUT_TITLE_FIELD_UNRESOLVED'), true);
});

test('auditPayload blocks form association record select when target field metadata is missing', () => {
  const payload = {
    use: 'FormItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer',
        },
      },
    },
    subModels: {
      field: {
        use: 'RecordSelectFieldModel',
        stepParams: {
          fieldSettings: {
            init: {
              collectionName: 'orders',
              fieldPath: 'customer',
            },
          },
        },
      },
    },
  };

  const result = auditPayload({
    payload,
    metadata: metadataWithAssociationFormMissingTargetFields,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'ASSOCIATION_INPUT_TARGET_METADATA_INCOMPLETE'), true);
});

test('auditPayload blocks form association record select when target default binding cannot be inferred', () => {
  const payload = {
    use: 'FormItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer',
        },
      },
    },
    subModels: {
      field: {
        use: 'RecordSelectFieldModel',
        stepParams: {
          fieldSettings: {
            init: {
              collectionName: 'orders',
              fieldPath: 'customer',
            },
          },
        },
      },
    },
  };

  const result = auditPayload({
    payload,
    metadata: metadataWithAssociationFormBindingInterfaceMissing,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'ASSOCIATION_INPUT_DEFAULT_BINDING_UNRESOLVED'), true);
});

test('auditPayload blocks when required collection metadata is missing', () => {
  const payload = {
    use: 'FormItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'missing_field',
        },
      },
    },
  };

  const result = auditPayload({ payload, metadata: {}, mode: VALIDATION_CASE_MODE });
  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'REQUIRED_COLLECTION_METADATA_MISSING'), true);
});

test('auditPayload blocks popup actions missing required page subtree', () => {
  const payload = {
    use: 'ViewActionModel',
    stepParams: {
      popupSettings: {
        openView: {
          collectionName: 'orders',
          pageModelClass: 'ChildPageModel',
          filterByTk: '{{ctx.record.id}}',
        },
      },
    },
  };

  const result = auditPayload({ payload, metadata, mode: GENERAL_MODE });
  assert.equal(result.blockers.some((item) => item.code === 'POPUP_ACTION_MISSING_SUBTREE'), true);
});

test('auditPayload blocks popup pages that depend on inputArgs but opener does not pass filterByTk', () => {
  const payload = makePopupPageWithTable({
    logic: '$and',
    items: [
      {
        path: 'order_id',
        operator: '$eq',
        value: '{{ctx.view.inputArgs.filterByTk}}',
      },
    ],
  });
  delete payload.stepParams.popupSettings.openView.filterByTk;

  const result = auditPayload({ payload, metadata, mode: GENERAL_MODE });
  assert.equal(result.blockers.some((item) => item.code === 'POPUP_CONTEXT_REFERENCE_WITHOUT_INPUT_ARG'), true);
});

test('auditPayload blocks popup actions when openView target collection lacks filterTargetKey', () => {
  const payload = makePopupPageWithChildTab({
    use: 'DetailsBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'orders',
          filterByTk: '{{ctx.view.inputArgs.filterByTk}}',
        },
      },
      detailsSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [],
          },
        },
      },
    },
  });
  payload.stepParams.popupSettings.openView.collectionName = 'project_members';

  const result = auditPayload({ payload, metadata, mode: VALIDATION_CASE_MODE });
  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'OPEN_VIEW_COLLECTION_FILTER_TARGET_KEY_MISSING'), true);
});

test('auditPayload blocks popup actions that use runtime-sensitive filterByTk without live metadata trust', () => {
  const payload = makePopupPageWithChildTab({
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'orders',
        },
      },
      tableSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [],
          },
        },
      },
    },
  });

  const result = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
    requirements: {
      metadataTrust: {
        runtimeSensitive: 'artifact',
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'METADATA_TRUST_INSUFFICIENT'), true);
});

test('auditPayload accepts popup actions that use runtime-sensitive filterByTk after metadata trust is upgraded to live', () => {
  const payload = makePopupPageWithChildTab({
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'orders',
        },
      },
      tableSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [],
          },
        },
      },
    },
  });

  const result = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
    requirements: {
      metadataTrust: {
        runtimeSensitive: 'live',
      },
    },
  });

  assert.equal(result.blockers.some((item) => item.code === 'METADATA_TRUST_INSUFFICIENT'), false);
});

test('auditPayload blocks association display bindings when target collection has no title field', () => {
  const payload = {
    use: 'DisplayTextFieldModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer',
        },
      },
    },
  };

  const result = auditPayload({ payload, metadata, mode: GENERAL_MODE });
  assert.equal(result.blockers.some((item) => item.code === 'ASSOCIATION_DISPLAY_TARGET_UNRESOLVED'), true);
});

test('auditPayload warns and blocks direct DisplayTextFieldModel association bindings even when target title exists', () => {
  const payload = {
    use: 'DisplayTextFieldModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer',
        },
      },
    },
  };

  const generalResult = auditPayload({ payload, metadata: metadataWithCustomerTitle, mode: GENERAL_MODE });
  assert.equal(generalResult.ok, true);
  assert.equal(
    generalResult.warnings.some((item) => item.code === 'ASSOCIATION_FIELD_REQUIRES_EXPLICIT_DISPLAY_MODEL'),
    true,
  );

  const validationResult = auditPayload({ payload, metadata: metadataWithCustomerTitle, mode: VALIDATION_CASE_MODE });
  assert.equal(validationResult.ok, false);
  assert.equal(
    validationResult.blockers.some((item) => item.code === 'ASSOCIATION_FIELD_REQUIRES_EXPLICIT_DISPLAY_MODEL'),
    true,
  );
});

test('auditPayload warns in general mode and blocks in validation mode when clickable relation title path is bound as dotted display field', () => {
  const payload = makeClickableAssociationTitleColumn();

  const generalResult = auditPayload({ payload, metadata: metadataWithCustomerTitle, mode: GENERAL_MODE });
  assert.equal(generalResult.ok, true);
  assert.equal(
    generalResult.warnings.some((item) => item.code === 'TABLE_CLICKABLE_ASSOCIATION_TITLE_PATH_UNSTABLE'),
    true,
  );

  const validationResult = auditPayload({ payload, metadata: metadataWithCustomerTitle, mode: VALIDATION_CASE_MODE });
  assert.equal(validationResult.ok, false);
  assert.equal(
    validationResult.blockers.some((item) => item.code === 'TABLE_CLICKABLE_ASSOCIATION_TITLE_PATH_UNSTABLE'),
    true,
  );
});

test('auditPayload blocks JS workaround for clickable relation title path unless requirements declare explicit JS intent', () => {
  const payload = makeClickableAssociationTitleColumn({ bindingUse: 'JSFieldModel' });

  const blockedResult = auditPayload({ payload, metadata: metadataWithCustomerTitle, mode: VALIDATION_CASE_MODE });
  assert.equal(blockedResult.ok, false);
  assert.equal(
    blockedResult.blockers.some((item) => item.code === 'TABLE_JS_WORKAROUND_REQUIRES_EXPLICIT_INTENT'),
    true,
  );

  const explicitResult = auditPayload({
    payload,
    metadata: metadataWithCustomerTitle,
    mode: VALIDATION_CASE_MODE,
    requirements: {
      intentTags: ['js.explicit'],
    },
  });
  assert.equal(
    explicitResult.blockers.some((item) => item.code === 'TABLE_JS_WORKAROUND_REQUIRES_EXPLICIT_INTENT'),
    false,
  );
});

test('auditPayload allows runtime-legal non-empty dataScope on record details blocks', () => {
  const payload = {
    use: 'DetailsBlockModel',
    stepParams: {
      resourceSettings: {
        init: makeCollectionResourceInit('orders', {
          filterByTk: '{{ctx.record.id}}',
        }),
      },
      detailsSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [
              {
                path: 'order_no',
                operator: '$notNull',
                value: true,
              },
            ],
          },
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
                    collectionName: 'orders',
                    fieldPath: 'order_no',
                  },
                },
              },
              subModels: {
                field: {
                  use: 'DisplayTextFieldModel',
                },
              },
            },
          ],
        },
      },
    },
  };

  const result = auditPayload({ payload, metadata, mode: VALIDATION_CASE_MODE });
  assert.equal(result.ok, true);
});

test('auditPayload blocks filter containers when explicit selector contract mismatches runtime shape', () => {
  const payload = {
    use: 'DetailsBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'orders',
          filterByTk: '{{ctx.record.id}}',
        },
      },
      detailsSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [
              {
                path: 'order_no',
                operator: '$notNull',
                value: true,
              },
            ],
          },
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
                    collectionName: 'orders',
                    fieldPath: 'order_no',
                  },
                },
              },
              subModels: {
                field: {
                  use: 'DisplayTextFieldModel',
                },
              },
            },
          ],
        },
      },
    },
  };

  const result = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
    requirements: {
      expectedFilterContracts: [
        {
          path: '$',
          use: 'DetailsBlockModel',
          collectionName: 'orders',
          selectorKind: 'association-context',
        },
      ],
    },
  });

  assert.equal(result.blockers.some((item) => item.code === 'FILTER_SELECTOR_CONTRACT_MISMATCH'), true);
});

test('auditPayload warns on hardcoded filterByTk in general mode and blocks in validation-case mode', () => {
  const payload = {
    use: 'DetailsBlockModel',
    stepParams: {
      resourceSettings: {
        init: makeCollectionResourceInit('orders', {
          filterByTk: 6,
        }),
      },
      detailsSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [],
          },
        },
      },
    },
  };

  const generalResult = auditPayload({ payload, metadata, mode: GENERAL_MODE });
  assert.equal(generalResult.ok, true);
  assert.equal(generalResult.warnings.some((item) => item.code === 'HARDCODED_FILTER_BY_TK'), true);

  const validationResult = auditPayload({ payload, metadata, mode: VALIDATION_CASE_MODE });
  assert.equal(validationResult.ok, false);
  assert.equal(validationResult.blockers.some((item) => item.code === 'HARDCODED_FILTER_BY_TK'), true);
});

test('auditPayload warns on empty popup grids in general mode and blocks in validation-case mode', () => {
  const payload = {
    use: 'ViewActionModel',
    stepParams: {
      popupSettings: {
        openView: {
          collectionName: 'orders',
          pageModelClass: 'ChildPageModel',
          filterByTk: '{{ctx.record.id}}',
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
                  subModels: {
                    items: [],
                  },
                },
              },
            },
          ],
        },
      },
    },
  };

  const generalResult = auditPayload({ payload, metadata, mode: GENERAL_MODE });
  assert.equal(generalResult.ok, true);
  assert.equal(generalResult.warnings.some((item) => item.code === 'EMPTY_POPUP_GRID'), true);

  const validationResult = auditPayload({ payload, metadata, mode: VALIDATION_CASE_MODE });
  assert.equal(validationResult.ok, false);
  assert.equal(validationResult.blockers.some((item) => item.code === 'EMPTY_POPUP_GRID'), true);
});

test('auditPayload accepts ChildPageTabModel as a valid popup tab subtree', () => {
  const payload = makePopupPageWithChildTab({
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'orders',
        },
      },
      tableSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [],
          },
        },
      },
    },
  });

  const result = auditPayload({ payload, metadata, mode: GENERAL_MODE });
  assert.equal(result.blockers.some((item) => item.code === 'POPUP_ACTION_MISSING_SUBTREE'), false);
});

test('auditPayload blocks ChildPageModel popup pages that still use PageTabModel', () => {
  const payload = makePopupPageWithChildTab({
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'orders',
        },
      },
      tableSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [],
          },
        },
      },
    },
  });
  payload.subModels.page.subModels.tabs[0].use = 'PageTabModel';

  const result = auditPayload({ payload, metadata, mode: VALIDATION_CASE_MODE });
  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'TAB_SLOT_USE_INVALID'), true);
});

test('auditPayload blocks popup actions whose pageModelClass and page subtree use do not match', () => {
  const payload = makePopupPageWithTable({
    logic: '$and',
    items: [
      {
        path: 'order_id',
        operator: '$eq',
        value: '{{ctx.view.inputArgs.filterByTk}}',
      },
    ],
  });
  payload.subModels.page.use = 'PageModel';

  const result = auditPayload({ payload, metadata, mode: VALIDATION_CASE_MODE });
  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'POPUP_PAGE_USE_MISMATCH'), true);
});

test('auditPayload blocks bare belongsTo child-side scalar filter and suggests metadata-derived scalar paths', () => {
  const payload = makePopupPageWithChildTab({
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'order_items',
        },
      },
      tableSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [
              {
                path: 'order',
                operator: '$eq',
                value: '{{ctx.view.inputArgs.filterByTk}}',
              },
            ],
          },
        },
      },
    },
  });

  const validationResult = auditPayload({ payload, metadata, mode: VALIDATION_CASE_MODE });
  assert.equal(validationResult.ok, false);
  const blocker = validationResult.blockers.find((item) => item.code === 'BELONGS_TO_FILTER_REQUIRES_SCALAR_PATH');
  assert.ok(blocker);
  assert.equal(
    validationResult.blockers.some((item) => item.code === 'RELATION_BLOCK_SHOULD_USE_ASSOCIATION_CONTEXT'),
    false,
  );
  assert.deepEqual(blocker.details.suggestedPaths, ['order_id', 'order.id']);
});

test('auditPayload accepts popup relation tables with child-side foreignKey filter when parent->child association resource is not verified', () => {
  const payload = makePopupPageWithChildTab({
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'order_items',
        },
      },
      tableSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [
              {
                path: 'order_id',
                operator: '$eq',
                value: '{{ctx.view.inputArgs.filterByTk}}',
              },
            ],
          },
        },
      },
    },
  });

  const generalResult = auditPayload({ payload, metadata, mode: GENERAL_MODE });
  assert.equal(generalResult.ok, true);
  assert.equal(generalResult.warnings.some((item) => item.code === 'RELATION_BLOCK_SHOULD_USE_ASSOCIATION_CONTEXT'), false);
});

test('auditPayload accepts dotted targetKey child-side relation filters when relation metadata exposes targetKey', () => {
  const payload = makePopupPageWithChildTab({
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'order_items',
        },
      },
      tableSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [
              {
                path: 'order.id',
                operator: '$eq',
                value: '{{ctx.view.inputArgs.filterByTk}}',
              },
            ],
          },
        },
      },
    },
  });

  const result = auditPayload({ payload, metadata, mode: VALIDATION_CASE_MODE });
  assert.equal(result.ok, true);
  assert.equal(result.blockers.some((item) => item.code === 'BELONGS_TO_FILTER_REQUIRES_SCALAR_PATH'), false);
});

test('auditPayload warns on child-side scalar relation filter only when verified parent->child association resource exists', () => {
  const payload = makePopupPageWithChildTab({
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'order_items',
        },
      },
      tableSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [
              {
                path: 'order_id',
                operator: '$eq',
                value: '{{ctx.view.inputArgs.filterByTk}}',
              },
            ],
          },
        },
      },
    },
  });

  const result = auditPayload({ payload, metadata: metadataWithVerifiedOrderItemsRelation, mode: VALIDATION_CASE_MODE });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.some((item) => item.code === 'RELATION_BLOCK_SHOULD_USE_ASSOCIATION_CONTEXT'), true);
  const relationWarning = result.warnings.find((item) => item.code === 'RELATION_BLOCK_SHOULD_USE_ASSOCIATION_CONTEXT');
  assert.equal(relationWarning.details.matchedConditionPath, 'order_id');
});

test('auditPayload falls back to dotted targetKey suggestion when belongsTo metadata has no foreignKey', () => {
  const payload = {
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: makeCollectionResourceInit('team_memberships'),
      },
      tableSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [
              {
                path: 'team',
                operator: '$eq',
                value: '{{ctx.record.teamSlug}}',
              },
            ],
          },
        },
      },
    },
  };

  const blockedResult = auditPayload({ payload, metadata: metadataWithTargetKeyOnlyRelation, mode: VALIDATION_CASE_MODE });
  assert.equal(blockedResult.ok, false);
  const blocker = blockedResult.blockers.find((item) => item.code === 'BELONGS_TO_FILTER_REQUIRES_SCALAR_PATH');
  assert.ok(blocker);
  assert.deepEqual(blocker.details.suggestedPaths, ['team.slug']);

  payload.stepParams.tableSettings.dataScope.filter.items[0].path = 'team.slug';
  const passedResult = auditPayload({ payload, metadata: metadataWithTargetKeyOnlyRelation, mode: VALIDATION_CASE_MODE });
  assert.equal(passedResult.ok, true);
});

test('auditPayload warns and blocks popup relation tables that guess associationName from child belongsTo field', () => {
  const payload = makePopupPageWithChildTab({
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'order_items',
          associationName: 'order',
          sourceId: '{{ctx.view.inputArgs.filterByTk}}',
        },
      },
      tableSettings: {
        pageSize: {
          pageSize: 20,
        },
      },
    },
  });

  const generalResult = auditPayload({ payload, metadata, mode: GENERAL_MODE });
  assert.equal(generalResult.ok, true);
  assert.equal(
    generalResult.warnings.some((item) => item.code === 'ASSOCIATION_CONTEXT_REQUIRES_VERIFIED_RESOURCE'),
    true,
  );

  const validationResult = auditPayload({ payload, metadata, mode: VALIDATION_CASE_MODE });
  assert.equal(validationResult.ok, false);
  assert.equal(
    validationResult.blockers.some((item) => item.code === 'ASSOCIATION_CONTEXT_REQUIRES_VERIFIED_RESOURCE'),
    true,
  );
});

test('auditPayload blocks popup relation tables that guess fully-qualified child belongsTo resourceName', () => {
  const payload = makePopupPageWithChildTab({
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'order_items',
          associationName: 'order_items.order',
          sourceId: '{{ctx.view.inputArgs.filterByTk}}',
        },
      },
      tableSettings: {
        pageSize: {
          pageSize: 20,
        },
      },
    },
  });

  const result = auditPayload({ payload, metadata, mode: VALIDATION_CASE_MODE });
  assert.equal(result.ok, false);
  assert.equal(
    result.blockers.some((item) => item.code === 'ASSOCIATION_CONTEXT_REQUIRES_VERIFIED_RESOURCE'),
    true,
  );
});

test('auditPayload warns and blocks split association display bindings that switch to target collection plus associationPathName', () => {
  const payload = {
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: makeCollectionResourceInit('orders'),
      },
    },
    subModels: {
      columns: [
        {
          use: 'TableColumnModel',
          stepParams: {
            fieldSettings: {
              init: {
                collectionName: 'customers',
                fieldPath: 'name',
                associationPathName: 'customer',
              },
            },
          },
          subModels: {
            field: makeFieldBindingSubModel({
              use: 'DisplayTextFieldModel',
              init: {
                collectionName: 'customers',
                fieldPath: 'name',
                associationPathName: 'customer',
              },
            }),
          },
        },
      ],
    },
  };

  const generalResult = auditPayload({ payload, metadata: metadataWithCustomerTitle, mode: GENERAL_MODE });
  assert.equal(generalResult.ok, true);
  assert.equal(
    generalResult.warnings.some((item) => item.code === 'ASSOCIATION_SPLIT_DISPLAY_BINDING_UNSTABLE'),
    true,
  );

  const validationResult = auditPayload({ payload, metadata: metadataWithCustomerTitle, mode: VALIDATION_CASE_MODE });
  assert.equal(validationResult.ok, false);
  assert.equal(
    validationResult.blockers.some((item) => item.code === 'ASSOCIATION_SPLIT_DISPLAY_BINDING_UNSTABLE'),
    true,
  );
});

test('auditPayload accepts dotted association display bindings on the parent collection', () => {
  const payload = {
    use: 'TableColumnModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer.name',
          associationPathName: 'customer',
        },
      },
    },
    subModels: {
      field: makeFieldBindingSubModel({
        use: 'DisplayTextFieldModel',
        init: {
          collectionName: 'orders',
          fieldPath: 'customer.name',
          associationPathName: 'customer',
        },
      }),
    },
  };

  const result = auditPayload({ payload, metadata: metadataWithCustomerTitle, mode: VALIDATION_CASE_MODE });
  assert.equal(result.blockers.some((item) => item.code === 'ASSOCIATION_SPLIT_DISPLAY_BINDING_UNSTABLE'), false);
  assert.equal(result.blockers.some((item) => item.code === 'FIELD_PATH_NOT_FOUND'), false);
  assert.equal(result.ok, true);
});

test('auditPayload warns and blocks dotted association display bindings without associationPathName', () => {
  const payload = {
    use: 'TableColumnModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer.name',
        },
      },
    },
    subModels: {
      field: makeFieldBindingSubModel({
        use: 'DisplayTextFieldModel',
        init: {
          collectionName: 'orders',
          fieldPath: 'customer.name',
        },
      }),
    },
  };

  const generalResult = auditPayload({ payload, metadata: metadataWithCustomerTitle, mode: GENERAL_MODE });
  assert.equal(
    generalResult.warnings.some((item) => item.code === 'DOTTED_ASSOCIATION_DISPLAY_MISSING_ASSOCIATION_PATH'),
    true,
  );

  const validationResult = auditPayload({ payload, metadata: metadataWithCustomerTitle, mode: VALIDATION_CASE_MODE });
  assert.equal(
    validationResult.blockers.some((item) => item.code === 'DOTTED_ASSOCIATION_DISPLAY_MISSING_ASSOCIATION_PATH'),
    true,
  );
  assert.equal(validationResult.ok, false);
});

test('auditPayload warns and blocks empty details blocks', () => {
  const payload = {
    use: 'DetailsBlockModel',
    stepParams: {
      resourceSettings: {
        init: makeCollectionResourceInit('customers', {
          filterByTk: '{{ctx.view.inputArgs.filterByTk}}',
        }),
      },
    },
    subModels: {
      grid: {
        use: 'DetailsGridModel',
      },
    },
  };

  const generalResult = auditPayload({ payload, metadata: metadataWithCustomerTitle, mode: GENERAL_MODE });
  assert.equal(generalResult.ok, true);
  assert.equal(generalResult.warnings.some((item) => item.code === 'EMPTY_DETAILS_BLOCK'), true);

  const validationResult = auditPayload({ payload, metadata: metadataWithCustomerTitle, mode: VALIDATION_CASE_MODE });
  assert.equal(validationResult.ok, false);
  assert.equal(validationResult.blockers.some((item) => item.code === 'EMPTY_DETAILS_BLOCK'), true);
});

test('auditPayload blocks generic ActionModel in TableBlockModel actions slot', () => {
  const payload = makeActionTargetBlock('order_items', [{ use: 'ActionModel' }]);

  const result = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'TABLE_COLLECTION_ACTION_SLOT_USE_INVALID'), true);
});

test('auditPayload blocks generic ActionModel in TableActionsColumnModel actions slot', () => {
  const payload = makeRowActionTargetBlock('order_items', [{ use: 'ActionModel' }]);

  const result = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'TABLE_RECORD_ACTION_SLOT_USE_INVALID'), true);
});

test('auditPayload blocks generic ActionModel in DetailsBlockModel actions slot', () => {
  const payload = makeDetailsActionTargetBlock('orders', [{ use: 'ActionModel' }]);

  const result = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'DETAILS_ACTION_SLOT_USE_INVALID'), true);
});

test('auditPayload blocks generic ActionModel in FilterFormBlockModel actions slot', () => {
  const payload = makeFilterFormBlock([{ use: 'ActionModel' }]);

  const result = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'FILTER_FORM_ACTION_SLOT_USE_INVALID'), true);
});

test('auditPayload blocks declared edit-record-popup requirements when target block has no stable edit action tree', () => {
  const payload = makeActionTargetBlock('order_items', []);

  const result = auditPayload({
    payload,
    metadata,
    mode: GENERAL_MODE,
    requirements: {
      requiredActions: [
        {
          kind: 'edit-record-popup',
          collectionName: 'order_items',
        },
      ],
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'REQUIRED_EDIT_RECORD_POPUP_ACTION_MISSING'), true);
});

test('auditPayload accepts declared edit-record-popup requirements when stable action tree exists in DetailsBlockModel', () => {
  const payload = makeDetailsActionTargetBlock('order_items', [makeEditRecordPopupAction('order_items')]);

  const result = auditPayload({
    payload,
    metadata,
    mode: GENERAL_MODE,
    requirements: {
      requiredActions: [
        {
          kind: 'edit-record-popup',
          collectionName: 'order_items',
        },
      ],
    },
  });

  assert.equal(result.blockers.some((item) => item.code === 'REQUIRED_EDIT_RECORD_POPUP_ACTION_MISSING'), false);
  assert.equal(result.ok, true);
});

test('auditPayload accepts declared edit-record-popup requirements when stable action tree exists in TableActionsColumnModel', () => {
  const payload = makeRowActionTargetBlock('order_items', [makeEditRecordPopupAction('order_items')]);

  const result = auditPayload({
    payload,
    metadata,
    mode: GENERAL_MODE,
    requirements: {
      requiredActions: [
        {
          kind: 'edit-record-popup',
          collectionName: 'order_items',
        },
      ],
    },
  });

  assert.equal(result.blockers.some((item) => item.code === 'REQUIRED_EDIT_RECORD_POPUP_ACTION_MISSING'), false);
  assert.equal(result.ok, true);
});

test('auditPayload accepts declared create-popup requirements in block actions slot', () => {
  const payload = makeActionTargetBlock('order_items', [makeCreatePopupAction('order_items', '新建订单项')]);

  const result = auditPayload({
    payload,
    metadata,
    mode: GENERAL_MODE,
    requirements: {
      requiredActions: [
        {
          kind: 'create-popup',
          collectionName: 'order_items',
          scope: 'block-actions',
        },
      ],
    },
  });

  assert.equal(result.blockers.some((item) => item.code === 'REQUIRED_CREATE_POPUP_ACTION_MISSING'), false);
  assert.equal(result.ok, true);
});

test('auditPayload accepts declared view-record-popup requirements in row actions slot', () => {
  const payload = makeRowActionTargetBlock('order_items', [makeViewRecordPopupAction('order_items')]);

  const result = auditPayload({
    payload,
    metadata,
    mode: GENERAL_MODE,
    requirements: {
      requiredActions: [
        {
          kind: 'view-record-popup',
          collectionName: 'order_items',
          scope: 'row-actions',
        },
      ],
    },
  });

  assert.equal(result.blockers.some((item) => item.code === 'REQUIRED_VIEW_RECORD_POPUP_ACTION_MISSING'), false);
  assert.equal(result.ok, true);
});

test('auditPayload accepts declared add-child-record-popup requirements in row actions slot', () => {
  const payload = makeRowActionTargetBlock('departments', [makeAddChildPopupAction('departments')]);

  const result = auditPayload({
    payload,
    metadata,
    mode: GENERAL_MODE,
    requirements: {
      requiredActions: [
        {
          kind: 'add-child-record-popup',
          collectionName: 'departments',
          scope: 'row-actions',
        },
      ],
    },
  });

  assert.equal(result.blockers.some((item) => item.code === 'REQUIRED_ADD_CHILD_RECORD_POPUP_ACTION_MISSING'), false);
  assert.equal(result.ok, true);
});

test('auditPayload blocks declared delete-record requirements when row actions slot has no stable delete action', () => {
  const payload = makeRowActionTargetBlock('order_items', []);

  const result = auditPayload({
    payload,
    metadata,
    mode: GENERAL_MODE,
    requirements: {
      requiredActions: [
        {
          kind: 'delete-record',
          collectionName: 'order_items',
          scope: 'row-actions',
        },
      ],
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'REQUIRED_DELETE_RECORD_ACTION_MISSING'), true);
});

test('auditPayload accepts declared delete-record requirements in row actions slot', () => {
  const payload = makeRowActionTargetBlock('order_items', [makeDeleteRecordAction('删除订单项')]);

  const result = auditPayload({
    payload,
    metadata,
    mode: GENERAL_MODE,
    requirements: {
      requiredActions: [
        {
          kind: 'delete-record',
          collectionName: 'order_items',
          scope: 'row-actions',
        },
      ],
    },
  });

  assert.equal(result.blockers.some((item) => item.code === 'REQUIRED_DELETE_RECORD_ACTION_MISSING'), false);
  assert.equal(result.ok, true);
});

test('auditPayload accepts declared record-action requirements in details actions slot', () => {
  const payload = makeDetailsActionTargetBlock('approval_requests', [
    {
      use: 'JSRecordActionModel',
      stepParams: {
        buttonSettings: {
          general: {
            title: '通过',
          },
        },
      },
    },
  ]);

  const result = auditPayload({
    payload,
    metadata,
    mode: GENERAL_MODE,
    requirements: {
      requiredActions: [
        {
          kind: 'record-action',
          collectionName: 'approval_requests',
          scope: 'details-actions',
        },
      ],
    },
  });

  assert.equal(result.blockers.some((item) => item.code === 'REQUIRED_RECORD_ACTION_MISSING'), false);
  assert.equal(result.ok, true);
});

test('auditPayload blocks form actions placed inside FormGridModel items', () => {
  const payload = makeEditFormBlock({
    putSubmitInGridItems: true,
    includeActions: false,
  });

  const result = auditPayload({
    payload,
    metadata,
    mode: GENERAL_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'FORM_ACTION_MUST_USE_ACTIONS_SLOT'), true);
});

test('auditPayload blocks FormItemModel without editable field subModel', () => {
  const payload = makeEditFormBlock({
    includeFieldSubModel: false,
  });

  const result = auditPayload({
    payload,
    metadata,
    mode: GENERAL_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'FORM_ITEM_FIELD_SUBMODEL_MISSING'), true);
});

test('auditPayload blocks TableColumnModel without display field subModel', () => {
  const payload = {
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'orders',
        },
      },
    },
    subModels: {
      columns: [
        {
          use: 'TableColumnModel',
          stepParams: {
            fieldSettings: {
              init: {
                collectionName: 'orders',
                fieldPath: 'order_no',
              },
            },
          },
        },
      ],
    },
  };

  const result = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'TABLE_COLUMN_FIELD_SUBMODEL_MISSING'), true);
});

test('auditPayload blocks TableColumnModel with direct display field model instead of FieldModel binding entry', () => {
  const payload = {
    use: 'TableColumnModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'status',
        },
      },
    },
    subModels: {
      field: {
        use: 'DisplayTextFieldModel',
        stepParams: {
          fieldSettings: {
            init: {
              collectionName: 'orders',
              fieldPath: 'status',
            },
          },
        },
      },
    },
  };

  const result = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'TABLE_COLUMN_FIELD_BINDING_ENTRY_INVALID'), true);
});

test('auditPayload warns in general mode and blocks in validation mode when form submit action is missing', () => {
  const payload = makeEditFormBlock({
    includeActions: false,
  });

  const generalResult = auditPayload({
    payload,
    metadata,
    mode: GENERAL_MODE,
  });
  assert.equal(generalResult.ok, true);
  assert.equal(generalResult.warnings.some((item) => item.code === 'FORM_SUBMIT_ACTION_MISSING'), true);

  const validationResult = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });
  assert.equal(validationResult.ok, false);
  assert.equal(validationResult.blockers.some((item) => item.code === 'FORM_SUBMIT_ACTION_MISSING'), true);
});

test('auditPayload blocks visible tabs with invalid tab slot use', () => {
  const payload = makeVisibleTabsPage({
    tabUse: 'RootPageModel',
  });

  const result = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'TAB_SLOT_USE_INVALID'), true);
});

test('auditPayload blocks visible tabs whose grid items still use page-like models', () => {
  const payload = makeVisibleTabsPage({
    itemUse: 'RootPageModel',
  });

  const result = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'TAB_GRID_ITEM_USE_INVALID'), true);
});

test('auditPayload blocks visible tabs that reuse the page uid across tab subtree', () => {
  const payload = makeVisibleTabsPage({
    pageUid: 'dup-root',
    tabUidPrefix: 'dup-root',
    gridUidPrefix: 'dup-root',
    itemUidPrefix: 'dup-root',
  });

  payload.subModels.tabs.forEach((tabNode) => {
    tabNode.uid = 'dup-root';
    tabNode.subModels.grid.uid = 'dup-root';
    tabNode.subModels.grid.subModels.items[0].uid = 'dup-root';
  });

  const result = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'TAB_SUBTREE_UID_REUSED'), true);
});

test('auditPayload blocks grid layouts that reference orphan uid or leave items outside rows', () => {
  const payload = {
    uid: 'grid-root',
    use: 'BlockGridModel',
    stepParams: {
      gridSettings: {
        grid: {
          rows: {
            row1: [
              ['table-1'],
              ['ghost-1'],
            ],
          },
          sizes: {
            row1: [12, 12],
          },
          rowOrder: ['row1'],
        },
      },
    },
    subModels: {
      items: [
        {
          uid: 'table-1',
          use: 'TableBlockModel',
          stepParams: {
            resourceSettings: {
              init: makeCollectionResourceInit('orders'),
            },
          },
        },
        {
          uid: 'details-1',
          use: 'DetailsBlockModel',
          stepParams: {
            resourceSettings: {
              init: makeCollectionResourceInit('orders'),
            },
          },
        },
      ],
    },
  };

  const result = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'GRID_LAYOUT_ORPHAN_UID'), true);
  assert.equal(result.blockers.some((item) => item.code === 'GRID_ITEM_LAYOUT_MISSING'), true);
});

test('auditPayload blocks reparenting an existing uid when live topology disagrees', () => {
  const payload = {
    uid: 'grid-root',
    use: 'BlockGridModel',
    stepParams: {
      gridSettings: {
        grid: {
          rows: {
            row1: [
              ['existing-table'],
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
          uid: 'existing-table',
          use: 'TableBlockModel',
          stepParams: {
            resourceSettings: {
              init: makeCollectionResourceInit('orders'),
            },
          },
        },
      ],
    },
  };

  const result = auditPayload({
    payload,
    metadata: {
      ...metadata,
      liveTopology: {
        source: 'test',
        byUid: {
          'existing-table': {
            uid: 'existing-table',
            use: 'TableBlockModel',
            parentId: 'other-grid',
            subKey: 'items',
            subType: 'array',
            path: '$.subModels.items[0]',
          },
        },
      },
    },
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'EXISTING_UID_REPARENT_BLOCKED'), true);
});

test('auditPayload validates declared visible tab titles', () => {
  const payload = makeVisibleTabsPage({
    titles: ['客户概览', '联系人', '商机', '跟进记录'],
  });

  const successResult = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
    requirements: {
      requiredTabs: [
        {
          pageUse: 'RootPageModel',
          titles: ['客户概览', '联系人', '商机', '跟进记录'],
        },
      ],
    },
  });

  assert.equal(successResult.ok, true);
  assert.equal(successResult.blockers.some((item) => item.code === 'REQUIRED_VISIBLE_TABS_MISSING'), false);

  const failureResult = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
    requirements: {
      requiredTabs: [
        {
          pageUse: 'RootPageModel',
          titles: ['客户概览', '联系人', '商机', '跟进记录', '续约预测'],
        },
      ],
    },
  });

  assert.equal(failureResult.ok, false);
  assert.equal(failureResult.blockers.some((item) => item.code === 'REQUIRED_VISIBLE_TABS_MISSING'), true);
});

test('auditPayload defaults to validation-case mode when mode is omitted', () => {
  const payload = {
    use: 'DetailsBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'orders',
          filterByTk: 6,
        },
      },
      detailsSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [],
          },
        },
      },
    },
  };

  const result = auditPayload({ payload, metadata });
  assert.equal(result.mode, VALIDATION_CASE_MODE);
  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'HARDCODED_FILTER_BY_TK'), true);
});

test('auditPayload can downgrade blocker with riskAccept', () => {
  const payload = {
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: makeCollectionResourceInit('orders'),
      },
      tableSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [
              {
                field: 'customer_id',
                operator: '$eq',
                value: 1,
              },
            ],
          },
        },
      },
    },
  };

  const result = auditPayload({
    payload,
    metadata,
    mode: GENERAL_MODE,
    riskAccept: ['FILTER_ITEM_USES_FIELD_NOT_PATH'],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.acceptedRiskCodes, ['FILTER_ITEM_USES_FIELD_NOT_PATH']);
  assert.deepEqual(result.ignoredRiskAcceptCodes, []);
  assert.equal(
    result.warnings.some((item) => item.code === 'FILTER_ITEM_USES_FIELD_NOT_PATH' && item.accepted === true),
    true,
  );
});

test('auditPayload does not downgrade ambiguous riskAccept codes that match multiple blockers', () => {
  const emptyPopupAction = {
    use: 'ViewActionModel',
    stepParams: {
      popupSettings: {
        openView: {
          collectionName: 'orders',
          pageModelClass: 'ChildPageModel',
          filterByTk: '{{ctx.record.id}}',
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
                  subModels: {
                    items: [],
                  },
                },
              },
            },
          ],
        },
      },
    },
  };
  const payload = {
    use: 'RootPageModel',
    subModels: {
      actions: [emptyPopupAction, emptyPopupAction],
    },
  };

  const result = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
    riskAccept: ['EMPTY_POPUP_GRID'],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.acceptedRiskCodes, []);
  assert.deepEqual(result.ignoredRiskAcceptCodes, ['EMPTY_POPUP_GRID']);
  assert.equal(result.blockers.filter((item) => item.code === 'EMPTY_POPUP_GRID').length, 2);
});

test('auditPayload does not allow riskAccept to bypass hard validation-case blockers for relation and details integrity', () => {
  const cases = [
    {
      code: 'ASSOCIATION_FIELD_REQUIRES_EXPLICIT_DISPLAY_MODEL',
      payload: {
        use: 'DisplayTextFieldModel',
        stepParams: {
          fieldSettings: {
            init: {
              collectionName: 'orders',
              fieldPath: 'customer',
            },
          },
        },
      },
      metadata: metadataWithCustomerTitle,
    },
    {
      code: 'ASSOCIATION_SPLIT_DISPLAY_BINDING_UNSTABLE',
      payload: {
        use: 'TableBlockModel',
        stepParams: {
          resourceSettings: {
            init: {
              collectionName: 'orders',
            },
          },
        },
        subModels: {
          columns: [
            {
              use: 'TableColumnModel',
              stepParams: {
                fieldSettings: {
                  init: {
                    collectionName: 'customers',
                    fieldPath: 'name',
                    associationPathName: 'customer',
                  },
                },
              },
            },
          ],
        },
      },
      metadata: metadataWithCustomerTitle,
    },
    {
      code: 'ASSOCIATION_CONTEXT_REQUIRES_VERIFIED_RESOURCE',
      payload: makePopupPageWithChildTab({
        use: 'TableBlockModel',
        stepParams: {
          resourceSettings: {
            init: {
              collectionName: 'order_items',
              associationName: 'order',
              sourceId: '{{ctx.view.inputArgs.filterByTk}}',
            },
          },
          tableSettings: {
            pageSize: {
              pageSize: 20,
            },
          },
        },
      }),
      metadata,
    },
    {
      code: 'TABLE_CLICKABLE_ASSOCIATION_TITLE_PATH_UNSTABLE',
      payload: makeClickableAssociationTitleColumn(),
      metadata: metadataWithCustomerTitle,
    },
    {
      code: 'TABLE_JS_WORKAROUND_REQUIRES_EXPLICIT_INTENT',
      payload: makeClickableAssociationTitleColumn({ bindingUse: 'JSFieldModel' }),
      metadata: metadataWithCustomerTitle,
    },
    {
      code: 'BELONGS_TO_FILTER_REQUIRES_SCALAR_PATH',
      payload: makePopupPageWithChildTab({
        use: 'TableBlockModel',
        stepParams: {
          resourceSettings: {
            init: {
              collectionName: 'order_items',
            },
          },
          tableSettings: {
            dataScope: {
              filter: {
                logic: '$and',
                items: [
                  {
                    path: 'order',
                    operator: '$eq',
                    value: '{{ctx.view.inputArgs.filterByTk}}',
                  },
                ],
              },
            },
          },
        },
      }),
      metadata,
    },
    {
      code: 'TAB_SLOT_USE_INVALID',
      payload: makeVisibleTabsPage({
        tabUse: 'RootPageModel',
      }),
      metadata,
    },
    {
      code: 'EMPTY_DETAILS_BLOCK',
      payload: {
        use: 'DetailsBlockModel',
        stepParams: {
          resourceSettings: {
            init: {
              collectionName: 'customers',
              filterByTk: '{{ctx.view.inputArgs.filterByTk}}',
            },
          },
        },
        subModels: {
          grid: {
            use: 'DetailsGridModel',
          },
        },
      },
      metadata: metadataWithCustomerTitle,
    },
    {
      code: 'FORM_ACTION_MUST_USE_ACTIONS_SLOT',
      payload: makeEditFormBlock({
        putSubmitInGridItems: true,
        includeActions: false,
      }),
      metadata,
    },
    {
      code: 'FORM_ITEM_FIELD_SUBMODEL_MISSING',
      payload: makeEditFormBlock({
        includeFieldSubModel: false,
      }),
      metadata,
    },
    {
      code: 'FORM_BLOCK_EMPTY_GRID',
      payload: {
        use: 'EditFormModel',
        stepParams: {
          resourceSettings: {
            init: {
              collectionName: 'order_items',
              filterByTk: '{{ctx.view.inputArgs.filterByTk}}',
            },
          },
        },
        subModels: {
          grid: {
            use: 'FormGridModel',
            subModels: {
              items: [],
            },
          },
          actions: [
            {
              use: 'FormSubmitActionModel',
            },
          ],
        },
      },
      metadata,
    },
    {
      code: 'FORM_SUBMIT_ACTION_DUPLICATED',
      payload: {
        use: 'EditFormModel',
        stepParams: {
          resourceSettings: {
            init: {
              collectionName: 'order_items',
              filterByTk: '{{ctx.view.inputArgs.filterByTk}}',
            },
          },
        },
        subModels: {
          grid: {
            use: 'FormGridModel',
            subModels: {
              items: [
                {
                  use: 'FormItemModel',
                  stepParams: {
                    fieldSettings: {
                      init: {
                        collectionName: 'order_items',
                        fieldPath: 'quantity',
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
          },
          actions: [
            {
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
              use: 'FormSubmitActionModel',
              stepParams: {},
            },
          ],
        },
      },
      metadata,
    },
    {
      code: 'FORM_SUBMIT_ACTION_MISSING',
      payload: makeEditFormBlock({
        includeActions: false,
      }),
      metadata,
    },
    {
      code: 'FILTER_FORM_EMPTY_GRID',
      payload: makeFilterFormBlock([
        {
          use: 'FilterFormSubmitActionModel',
        },
      ]),
      metadata,
    },
    {
      code: 'FILTER_FORM_ITEM_FIELD_SUBMODEL_MISSING',
      payload: makeFilterFormBlockWithItems([
        makeFilterFormItem({
          includeFieldSubModel: false,
        }),
      ]),
      metadata,
    },
    {
      code: 'FILTER_FORM_ITEM_FILTERFIELD_MISSING',
      payload: makeFilterFormBlockWithItems([
        makeFilterFormItem({
          includeFilterField: false,
        }),
      ]),
      metadata,
    },
    {
      code: 'FIELD_MODEL_PAGE_SLOT_UNSUPPORTED',
      payload: {
        use: 'DetailsItemModel',
        stepParams: {
          fieldSettings: {
            init: {
              collectionName: 'orders',
              fieldPath: 'status',
            },
          },
        },
        subModels: {
          field: {
            use: 'DisplayEnumFieldModel',
            subModels: {
              page: {
                use: 'ChildPageModel',
              },
            },
          },
        },
      },
      metadata,
    },
  ];

  for (const testCase of cases) {
    const result = auditPayload({
      payload: testCase.payload,
      metadata: testCase.metadata,
      mode: VALIDATION_CASE_MODE,
      riskAccept: [testCase.code],
    });

    assert.equal(result.ok, false, `${testCase.code} should remain a blocker`);
    assert.equal(result.acceptedRiskCodes.includes(testCase.code), false, `${testCase.code} must not be accepted`);
    assert.equal(
      result.blockers.some((item) => item.code === testCase.code),
      true,
      `${testCase.code} should still appear in blockers`,
    );
  }
});

test('canonicalizePayload rewrites legacy filter field to path', () => {
  const payload = makePopupPageWithChildTab({
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'order_items',
        },
      },
      tableSettings: {
        dataScope: {
          filter: {
            logic: '$and',
            items: [
              {
                field: 'order_id',
                operator: '$eq',
                value: '{{ctx.view.inputArgs.filterByTk}}',
              },
            ],
          },
        },
      },
    },
  });

  const result = canonicalizePayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  const condition = result.payload.subModels.page.subModels.tabs[0].subModels.grid.subModels.items[0].stepParams.tableSettings.dataScope.filter.items[0];
  assert.equal(condition.path, 'order_id');
  assert.equal(Object.hasOwn(condition, 'field'), false);
  assert.equal(result.transforms.some((item) => item.code === 'FILTER_ITEM_FIELD_RENAMED_TO_PATH'), true);

  const auditResult = auditPayload({
    payload: result.payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });
  assert.equal(auditResult.blockers.some((item) => item.code === 'FILTER_ITEM_USES_FIELD_NOT_PATH'), false);
});

test('canonicalizePayload rewrites display foreignKey fieldPath to dotted association display binding', () => {
  const payload = {
    use: 'DetailsItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer_id',
        },
      },
    },
    subModels: {
      field: {
        use: 'DisplayTextFieldModel',
      },
    },
  };

  const result = canonicalizePayload({
    payload,
    metadata: metadataWithCustomerTitle,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.payload.stepParams.fieldSettings.init.fieldPath, 'customer.name');
  assert.equal(result.payload.stepParams.fieldSettings.init.associationPathName, 'customer');
  assert.equal(result.transforms.some((item) => item.code === 'FOREIGN_KEY_FIELDPATH_CANONICALIZED'), true);

  const auditResult = auditPayload({
    payload: result.payload,
    metadata: metadataWithCustomerTitle,
    mode: VALIDATION_CASE_MODE,
  });
  assert.equal(auditResult.blockers.some((item) => item.code === 'FOREIGN_KEY_USED_AS_FIELD_PATH'), false);
});

test('canonicalizePayload fills missing associationPathName for dotted association display bindings', () => {
  const payload = {
    use: 'TableColumnModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer.name',
        },
      },
    },
    subModels: {
      field: makeFieldBindingSubModel({
        use: 'DisplayTextFieldModel',
        init: {
          collectionName: 'orders',
          fieldPath: 'customer.name',
        },
      }),
    },
  };

  const result = canonicalizePayload({
    payload,
    metadata: metadataWithCustomerTitle,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.payload.stepParams.fieldSettings.init.associationPathName, 'customer');
  assert.equal(result.payload.subModels.field.stepParams.fieldSettings.init.associationPathName, 'customer');
  assert.equal(result.transforms.some((item) => item.code === 'ASSOCIATION_PATHNAME_CANONICALIZED'), true);

  const auditResult = auditPayload({
    payload: result.payload,
    metadata: metadataWithCustomerTitle,
    mode: VALIDATION_CASE_MODE,
  });
  assert.equal(auditResult.blockers.some((item) => item.code === 'DOTTED_ASSOCIATION_DISPLAY_MISSING_ASSOCIATION_PATH'), false);
});

test('canonicalizePayload fills missing associationPathName for dotted association filter bindings', () => {
  const payload = {
    use: 'FilterFormItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer.name',
        },
      },
      filterFormItemSettings: {
        init: {
          filterField: {
            name: 'customer.name',
            title: '客户名称',
            interface: 'input',
            type: 'string',
          },
        },
      },
    },
    subModels: {
      field: {
        use: 'InputFieldModel',
        stepParams: {
          fieldSettings: {
            init: {
              collectionName: 'orders',
              fieldPath: 'customer.name',
            },
          },
        },
      },
    },
  };

  const result = canonicalizePayload({
    payload,
    metadata: metadataWithCustomerTitle,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.payload.stepParams.fieldSettings.init.associationPathName, 'customer');
  assert.equal(result.payload.subModels.field.stepParams.fieldSettings.init.associationPathName, 'customer');
  assert.equal(result.transforms.some((item) => item.code === 'ASSOCIATION_PATHNAME_CANONICALIZED'), true);
});

test('canonicalizePayload rewrites filter foreignKey fieldPath to association input binding', () => {
  const payload = {
    use: 'FilterFormItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer_id',
        },
      },
      filterFormItemSettings: {
        init: {
          filterField: {
            name: 'customer_id',
            title: '客户',
            interface: 'number',
            type: 'integer',
          },
        },
      },
    },
    subModels: {
      field: {
        use: 'NumberFieldModel',
        stepParams: {
          fieldSettings: {
            init: {
              collectionName: 'orders',
              fieldPath: 'customer_id',
            },
          },
        },
      },
    },
  };

  const result = canonicalizePayload({
    payload,
    metadata: metadataWithCustomerTitle,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.payload.stepParams.fieldSettings.init.fieldPath, 'customer');
  assert.equal(result.payload.stepParams.filterFormItemSettings.init.filterField.name, 'customer');
  assert.equal(result.payload.stepParams.filterFormItemSettings.init.filterField.interface, 'm2o');
  assert.equal(result.payload.subModels.field.use, 'FilterFormRecordSelectFieldModel');
  assert.equal(result.payload.subModels.field.stepParams.fieldSettings.init.fieldPath, 'customer');
  assert.equal(result.transforms.some((item) => item.code === 'FOREIGN_KEY_ASSOCIATION_INPUT_CANONICALIZED'), true);

  const auditResult = auditPayload({
    payload: result.payload,
    metadata: metadataWithCustomerTitle,
    mode: VALIDATION_CASE_MODE,
  });
  assert.equal(auditResult.blockers.some((item) => item.code === 'FOREIGN_KEY_USED_AS_FIELD_PATH'), false);
});

test('canonicalizePayload rewrites form foreignKey fieldPath to association input binding', () => {
  const payload = {
    use: 'FormItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer_id',
        },
      },
    },
    subModels: {
      field: {
        use: 'NumberFieldModel',
        stepParams: {
          fieldSettings: {
            init: {
              collectionName: 'orders',
              fieldPath: 'customer_id',
            },
          },
        },
      },
    },
  };

  const result = canonicalizePayload({
    payload,
    metadata: metadataWithCustomerTitle,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.payload.stepParams.fieldSettings.init.fieldPath, 'customer');
  assert.equal(result.payload.subModels.field.use, 'RecordSelectFieldModel');
  assert.equal(result.payload.subModels.field.stepParams.fieldSettings.init.fieldPath, 'customer');
  assert.equal(result.transforms.some((item) => item.code === 'FOREIGN_KEY_ASSOCIATION_INPUT_CANONICALIZED'), true);

  const auditResult = auditPayload({
    payload: result.payload,
    metadata: metadataWithCustomerTitle,
    mode: VALIDATION_CASE_MODE,
  });
  assert.equal(auditResult.blockers.some((item) => item.code === 'FOREIGN_KEY_USED_AS_FIELD_PATH'), false);
});

test('canonicalizePayload fills missing BlockGridModel filterManager for filter-form to table bindings', () => {
  const payload = makeOrdersFilterTableGrid();

  const result = canonicalizePayload({
    payload,
    metadata: metadataWithCustomerTitle,
    mode: VALIDATION_CASE_MODE,
  });

  assert.deepEqual(result.payload.filterManager, [
    {
      filterId: 'customer-filter',
      targetId: 'orders-table',
      filterPaths: ['customer.id'],
    },
    {
      filterId: 'order-no-filter',
      targetId: 'orders-table',
      filterPaths: ['order_no'],
    },
  ]);
  assert.equal(result.transforms.some((item) => item.code === 'FILTER_MANAGER_CANONICALIZED'), true);

  const auditResult = auditPayload({
    payload: result.payload,
    metadata: metadataWithCustomerTitle,
    mode: VALIDATION_CASE_MODE,
  });
  assert.equal(auditResult.blockers.some((item) => item.code === 'FILTER_MANAGER_MISSING'), false);
  assert.equal(auditResult.blockers.some((item) => item.code === 'FILTER_MANAGER_FILTER_ITEM_UNBOUND'), false);
  assert.equal(auditResult.blockers.some((item) => item.code === 'FILTER_MANAGER_TARGET_MISSING'), false);
  assert.equal(auditResult.blockers.some((item) => item.code === 'FILTER_MANAGER_FILTER_PATH_UNRESOLVED'), false);
});

test('auditPayload blocks filter-form grids that omit BlockGridModel filterManager', () => {
  const result = auditPayload({
    payload: makeOrdersFilterTableGrid(),
    metadata: metadataWithCustomerTitle,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.blockers.some((item) => item.code === 'FILTER_MANAGER_MISSING'), true);
  assert.equal(result.blockers.some((item) => item.code === 'FILTER_MANAGER_FILTER_ITEM_UNBOUND'), true);
});

test('auditPayload blocks filterManager entries whose filterPaths drift from runtime expectations', () => {
  const result = auditPayload({
    payload: makeOrdersFilterTableGrid({
      filterManager: [
        {
          filterId: 'order-no-filter',
          targetId: 'orders-table',
          filterPaths: ['status'],
        },
        {
          filterId: 'customer-filter',
          targetId: 'orders-table',
          filterPaths: ['customer.name'],
        },
      ],
    }),
    metadata: metadataWithCustomerTitle,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.blockers.some((item) => item.code === 'FILTER_MANAGER_FILTER_PATH_UNRESOLVED'), true);
});

test('canonicalizePayload fills form association record select title fallback when target collection has no titleField', () => {
  const payload = {
    use: 'FormItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer',
        },
      },
    },
    subModels: {
      field: {
        use: 'RecordSelectFieldModel',
        stepParams: {
          fieldSettings: {
            init: {
              collectionName: 'orders',
              fieldPath: 'customer',
            },
          },
        },
      },
    },
  };

  const result = canonicalizePayload({
    payload,
    metadata: metadataWithAssociationFormTargetFilterKeyOnly,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.payload.props.titleField, 'name');
  assert.equal(result.payload.stepParams.editItemSettings.titleField.titleField, 'name');
  assert.equal(result.payload.subModels.field.props.titleField, 'name');
  assert.deepEqual(result.payload.subModels.field.props.fieldNames, { label: 'name', value: 'id' });
  assert.equal(result.transforms.some((item) => item.code === 'FORM_ASSOCIATION_TITLEFIELD_CANONICALIZED'), true);
  assert.equal(result.transforms.some((item) => item.code === 'FORM_ASSOCIATION_FIELDNAMES_CANONICALIZED'), true);

  const auditResult = auditPayload({
    payload: result.payload,
    metadata: metadataWithAssociationFormTargetFilterKeyOnly,
    mode: VALIDATION_CASE_MODE,
  });
  assert.equal(auditResult.ok, true);
});

test('canonicalizePayload inserts missing submit action for form blocks', () => {
  const payload = makeEditFormBlock({
    includeActions: false,
  });

  const result = canonicalizePayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.payload.subModels.actions.some((item) => item.use === 'FormSubmitActionModel'), true);
  assert.equal(result.transforms.some((item) => item.code === 'FORM_SUBMIT_ACTION_INSERTED'), true);

  const auditResult = auditPayload({
    payload: result.payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });
  assert.equal(auditResult.blockers.some((item) => item.code === 'FORM_SUBMIT_ACTION_MISSING'), false);
});

test('auditPayload blocks duplicate submit-like actions in form blocks', () => {
  const payload = {
    use: 'EditFormModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'order_items',
          filterByTk: '{{ctx.view.inputArgs.filterByTk}}',
        },
      },
    },
    subModels: {
      grid: {
        use: 'FormGridModel',
        subModels: {
          items: [
            {
              use: 'FormItemModel',
              stepParams: {
                fieldSettings: {
                  init: {
                    collectionName: 'order_items',
                    fieldPath: 'quantity',
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
      },
      actions: [
        {
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
          use: 'FormSubmitActionModel',
          stepParams: {},
        },
      ],
    },
  };

  const result = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.blockers.some((item) => item.code === 'FORM_SUBMIT_ACTION_DUPLICATED'), true);
});

test('canonicalizePayload inserts default details item for empty details blocks', () => {
  const payload = makeDetailsActionTargetBlock('orders');
  delete payload.subModels.actions;

  const result = canonicalizePayload({
    payload,
    metadata: metadataWithCustomerTitle,
    mode: VALIDATION_CASE_MODE,
  });

  const items = result.payload.subModels.grid.subModels.items;
  assert.equal(Array.isArray(items), true);
  assert.equal(items.length, 1);
  assert.equal(items[0].stepParams.fieldSettings.init.fieldPath, 'order_no');
  assert.equal(items[0].subModels.field.use, 'FieldModel');
  assert.equal(items[0].subModels.field.stepParams.fieldBinding.use, 'DisplayTextFieldModel');
  assert.equal(result.transforms.some((item) => item.code === 'DETAILS_BLOCK_DEFAULT_ITEM_INSERTED'), true);

  const auditResult = auditPayload({
    payload: result.payload,
    metadata: metadataWithCustomerTitle,
    mode: VALIDATION_CASE_MODE,
  });
  assert.equal(auditResult.blockers.some((item) => item.code === 'EMPTY_DETAILS_BLOCK'), false);
});

test('auditPayload warns instead of blocking on direct details field model entry', () => {
  const payload = {
    use: 'DetailsBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName: 'orders',
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
                    collectionName: 'orders',
                    fieldPath: 'status',
                  },
                },
              },
              subModels: {
                field: {
                  use: 'DisplayTextFieldModel',
                  stepParams: {
                    fieldSettings: {
                      init: {
                        collectionName: 'orders',
                        fieldPath: 'status',
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    },
  };

  const result = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.blockers.some((item) => item.code === 'DETAILS_ITEM_FIELD_BINDING_ENTRY_INVALID'), false);
  assert.equal(result.warnings.some((item) => item.code === 'DETAILS_ITEM_FIELD_BINDING_ENTRY_INVALID'), true);
});

test('canonicalizePayload rewrites hardcoded popup and resource filterByTk inside popup context', () => {
  const payload = cloneJson(makeViewRecordPopupAction('order_items'));
  payload.stepParams.popupSettings.openView.filterByTk = 1;
  payload.subModels.page.subModels.tabs[0].subModels.grid.subModels.items[0].stepParams.resourceSettings.init.filterByTk = 1;

  const result = canonicalizePayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.payload.stepParams.popupSettings.openView.filterByTk, '{{ctx.record.id}}');
  assert.equal(
    result.payload.subModels.page.subModels.tabs[0].subModels.grid.subModels.items[0].stepParams.resourceSettings.init.filterByTk,
    '{{ctx.view.inputArgs.filterByTk}}',
  );
  assert.equal(result.transforms.some((item) => item.code === 'POPUP_FILTER_BY_TK_CANONICALIZED'), true);
  assert.equal(result.transforms.some((item) => item.code === 'RESOURCE_FILTER_BY_TK_CANONICALIZED'), true);

  const auditResult = auditPayload({
    payload: result.payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });
  assert.equal(auditResult.blockers.some((item) => item.code === 'HARDCODED_FILTER_BY_TK'), false);
});

test('canonicalizePayload rewrites legacy record popup filterByTk to a non-id filterTargetKey template', () => {
  const namedFilterKeyMetadata = {
    collections: {
      ...metadata.collections,
      order_items: {
        ...metadata.collections.order_items,
        filterTargetKey: 'code',
        fields: [
          ...metadata.collections.order_items.fields,
          { name: 'code', type: 'string', interface: 'input' },
        ],
      },
    },
  };
  const payload = cloneJson(makeEditRecordPopupAction('order_items'));

  const result = canonicalizePayload({
    payload,
    metadata: namedFilterKeyMetadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.payload.stepParams.popupSettings.openView.filterByTk, '{{ctx.record.code}}');
  assert.equal(result.transforms.some((item) => item.code === 'POPUP_FILTER_BY_TK_CANONICALIZED'), true);
});

test('canonicalizePayload rewrites legacy record popup filterByTk to composite record context template', () => {
  const payload = cloneJson(makeEditRecordPopupAction('project_members'));

  const result = canonicalizePayload({
    payload,
    metadata: metadataWithCompositeProjectMembers,
    mode: VALIDATION_CASE_MODE,
  });

  assert.deepEqual(result.payload.stepParams.popupSettings.openView.filterByTk, {
    project_id: '{{ctx.record.project_id}}',
    user_id: '{{ctx.record.user_id}}',
  });
  assert.equal(result.transforms.some((item) => item.code === 'POPUP_FILTER_BY_TK_CANONICALIZED'), true);

  const auditResult = auditPayload({
    payload: result.payload,
    metadata: metadataWithCompositeProjectMembers,
    mode: VALIDATION_CASE_MODE,
    requirements: {
      metadataTrust: {
        runtimeSensitive: 'live',
      },
    },
  });
  assert.equal(auditResult.blockers.some((item) => item.code === 'POPUP_FILTER_BY_TK_RUNTIME_METADATA_REQUIRED'), false);
  assert.equal(auditResult.blockers.some((item) => item.code === 'POPUP_FILTER_BY_TK_TARGET_KEY_MISSING'), false);
});

test('canonicalizePayload keeps nested record popup on record context instead of ancestor popup inputArgs', () => {
  const payload = cloneJson(
    makePopupPageWithChildTab(
      makeRowActionTargetBlock('project_members', [makeEditRecordPopupAction('project_members')]),
    ),
  );

  const nestedAction = payload.subModels.page.subModels.tabs[0].subModels.grid.subModels.items[0]
    .subModels.columns[0].subModels.actions[0];
  nestedAction.stepParams.popupSettings.openView.filterByTk = '{{ctx.record.id}}';

  const result = canonicalizePayload({
    payload,
    metadata: metadataWithCompositeProjectMembers,
    mode: VALIDATION_CASE_MODE,
  });

  assert.deepEqual(
    result.payload.subModels.page.subModels.tabs[0].subModels.grid.subModels.items[0]
      .subModels.columns[0].subModels.actions[0].stepParams.popupSettings.openView.filterByTk,
    {
      project_id: '{{ctx.record.project_id}}',
      user_id: '{{ctx.record.user_id}}',
    },
  );
});

test('canonicalizePayload leaves unresolved hardcoded resource filterByTk outside popup context', () => {
  const payload = makeDetailsActionTargetBlock('orders');
  payload.stepParams.resourceSettings.init.filterByTk = 1;

  const result = canonicalizePayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(
    result.unresolved.some((item) => item.code === 'RESOURCE_FILTER_BY_TK_CONTEXT_UNRESOLVED'),
    true,
  );
});

test('auditPayload blocks empty filter forms and malformed filter form items', () => {
  const emptyBlockResult = auditPayload({
    payload: makeFilterFormBlock(),
    metadata,
    mode: VALIDATION_CASE_MODE,
  });
  assert.equal(emptyBlockResult.blockers.some((item) => item.code === 'FILTER_FORM_EMPTY_GRID'), true);

  const missingFieldModelResult = auditPayload({
    payload: makeFilterFormBlockWithItems([
      makeFilterFormItem({
        includeFieldSubModel: false,
      }),
    ]),
    metadata,
    mode: VALIDATION_CASE_MODE,
  });
  assert.equal(missingFieldModelResult.blockers.some((item) => item.code === 'FILTER_FORM_ITEM_FIELD_SUBMODEL_MISSING'), true);

  const missingFilterFieldResult = auditPayload({
    payload: makeFilterFormBlockWithItems([
      makeFilterFormItem({
        includeFilterField: false,
      }),
    ]),
    metadata,
    mode: VALIDATION_CASE_MODE,
  });
  assert.equal(missingFilterFieldResult.blockers.some((item) => item.code === 'FILTER_FORM_ITEM_FILTERFIELD_MISSING'), true);
});

test('canonicalizePayload rewrites select filter form items to SelectFieldModel and metadata-derived descriptor', () => {
  const payload = makeFilterFormItem({
    collectionName: 'orders',
    fieldPath: 'status',
  });

  const result = canonicalizePayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.payload.subModels.field.use, 'SelectFieldModel');
  assert.deepEqual(result.payload.stepParams.filterFormItemSettings.init.filterField, {
    name: 'status',
    title: 'status',
    interface: 'select',
    type: 'string',
  });
  assert.equal(result.transforms.some((item) => item.code === 'FILTER_FORM_FIELD_MODEL_CANONICALIZED'), true);

  const auditResult = auditPayload({
    payload: result.payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });
  assert.equal(auditResult.blockers.some((item) => item.code === 'FILTER_FORM_FIELD_MODEL_MISMATCH'), false);
});

test('auditPayload blocks filter form field model mismatches against metadata', () => {
  const result = auditPayload({
    payload: makeFilterFormBlockWithItems([
      makeFilterFormItem({
        collectionName: 'orders',
        fieldPath: 'status',
      }),
    ]),
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.blockers.some((item) => item.code === 'FILTER_FORM_FIELD_MODEL_MISMATCH'), true);
});

test('auditPayload blocks field models that carry unsupported page slots', () => {
  const payload = {
    use: 'DetailsItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'status',
        },
      },
    },
    subModels: {
      field: {
        use: 'DisplayEnumFieldModel',
        subModels: {
          page: {
            use: 'ChildPageModel',
          },
        },
      },
    },
  };

  const result = auditPayload({
    payload,
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.blockers.some((item) => item.code === 'FIELD_MODEL_PAGE_SLOT_UNSUPPORTED'), true);
});

test('build-filter CLI prints normalized JSON', () => {
  const output = execFileSync(
    process.execPath,
    [
      SCRIPT_PATH,
      'build-filter',
      '--path',
      'customer',
      '--operator',
      '$eq',
      '--value-json',
      '"{{ctx.record.id}}"',
    ],
    {
      cwd: SKILL_ROOT,
      encoding: 'utf8',
    },
  );
  const result = JSON.parse(output);
  assert.equal(result.filter.items[0].path, 'customer');
  assert.equal(result.filter.items[0].operator, '$eq');
});

test('build-query-filter CLI prints server query JSON', () => {
  const output = execFileSync(
    process.execPath,
    [
      SCRIPT_PATH,
      'build-query-filter',
      '--path',
      'customer',
      '--operator',
      '$eq',
      '--value-json',
      '"{{ctx.record.id}}"',
    ],
    {
      cwd: SKILL_ROOT,
      encoding: 'utf8',
    },
  );
  const result = JSON.parse(output);
  assert.equal(Array.isArray(result.filter.$and), true);
  assert.equal(result.filter.$and[0].customer.$eq, '{{ctx.record.id}}');
});

test('canonicalize-payload CLI prints normalized JSON', () => {
  const payload = JSON.stringify(makeEditFormBlock({ includeActions: false }));
  const output = execFileSync(
    process.execPath,
    [
      SCRIPT_PATH,
      'canonicalize-payload',
      '--payload-json',
      payload,
      '--metadata-json',
      JSON.stringify(metadata),
      '--mode',
      VALIDATION_CASE_MODE,
    ],
    {
      cwd: SKILL_ROOT,
      encoding: 'utf8',
    },
  );
  const result = JSON.parse(output);
  assert.equal(result.payload.subModels.actions.some((item) => item.use === 'FormSubmitActionModel'), true);
  assert.equal(result.transforms.some((item) => item.code === 'FORM_SUBMIT_ACTION_INSERTED'), true);
});

test('audit-payload CLI exits with blocker code when payload is invalid', () => {
  const payload = JSON.stringify({
    use: 'FormItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          collectionName: 'orders',
          fieldPath: 'customer_id',
        },
      },
    },
  });
  const result = spawnSync(
    process.execPath,
    [
      SCRIPT_PATH,
      'audit-payload',
      '--payload-json',
      payload,
      '--metadata-json',
      JSON.stringify(metadata),
      '--mode',
      GENERAL_MODE,
    ],
    {
      cwd: SKILL_ROOT,
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, BLOCKER_EXIT_CODE);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.blockers.some((item) => item.code === 'FOREIGN_KEY_USED_AS_FIELD_PATH'), true);
});

test('auditPayload blocks forbidden RunJS globals and exposes runjs inspection summary', () => {
  const result = auditPayload({
    payload: {
      use: 'JSBlockModel',
      stepParams: {
        jsSettings: {
          runJs: {
            code: "await fetch('/api/auth:check')",
            version: 'v1',
          },
        },
      },
    },
    metadata: {},
    mode: GENERAL_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'RUNJS_FORBIDDEN_GLOBAL'), true);
  assert.deepEqual(result.runjsInspection, {
    ok: false,
    blockerCount: 1,
    warningCount: 0,
    inspectedNodeCount: 1,
    contractSource: 'live',
    semanticBlockerCount: 0,
    semanticWarningCount: 0,
    autoRewriteCount: 0,
  });
});

test('canonicalizePayload rewrites render-model innerHTML writes to ctx.render', () => {
  const result = canonicalizePayload({
    payload: {
      use: 'JSColumnModel',
      stepParams: {
        tableColumnSettings: {
          title: {
            title: '概览',
          },
        },
        jsSettings: {
          runJs: {
            version: 'v2',
            code: "ctx.element.innerHTML = '<span>Preview</span>';",
          },
        },
      },
    },
    metadata: {},
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.payload.stepParams.jsSettings.runJs.code.includes("ctx.render('<span>Preview</span>');"), true);
  assert.equal(result.transforms.some((item) => item.code === 'RUNJS_ELEMENT_INNERHTML_TO_CTX_RENDER'), true);
  assert.deepEqual(result.runjsCanonicalization, {
    blockerCount: 0,
    warningCount: 1,
    autoRewriteCount: 1,
  });
});

test('auditPayload blocks render-model innerHTML writes when later DOM access remains', () => {
  const result = auditPayload({
    payload: {
      use: 'JSBlockModel',
      stepParams: {
        jsSettings: {
          runJs: {
            version: 'v2',
            code: `ctx.element.innerHTML = '<a>Open</a>';
ctx.element.querySelector('a')?.addEventListener('click', () => {
  console.log('open');
});`,
          },
        },
      },
    },
    metadata: {},
    mode: GENERAL_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'RUNJS_ELEMENT_INNERHTML_FORBIDDEN'), true);
  assert.equal(result.runjsInspection.semanticBlockerCount > 0, true);
});

test('auditPayload does not downgrade RunJS blockers through risk accept', () => {
  const result = auditPayload({
    payload: {
      use: 'JSActionModel',
      clickSettings: {
        runJs: {
          code: 'await ctx.notAllowed()',
          version: 'v1',
        },
      },
    },
    metadata: {},
    mode: GENERAL_MODE,
    riskAccept: ['RUNJS_UNKNOWN_CTX_MEMBER'],
  });

  assert.equal(result.ok, false);
  assert.equal(result.acceptedRiskCodes.includes('RUNJS_UNKNOWN_CTX_MEMBER'), false);
  assert.equal(result.blockers.some((item) => item.code === 'RUNJS_UNKNOWN_CTX_MEMBER'), true);
});

function makeValidChartBlock(overrides = {}) {
  return {
    use: 'ChartBlockModel',
    stepParams: {
      chartSettings: {
        configure: {
          query: {
            mode: 'builder',
            collectionPath: ['main', 'orders'],
            measures: [
              {
                field: 'title',
                aggregation: 'count',
                alias: 'count_title',
              },
            ],
            dimensions: [
              {
                field: 'status',
              },
            ],
          },
          chart: {
            option: {
              mode: 'basic',
              builder: {
                type: 'pie',
                pieCategory: 'status',
                pieValue: 'count_title',
              },
            },
          },
        },
      },
      ...overrides.stepParams,
    },
    ...overrides,
  };
}

function makeValidGridCardBlock(overrides = {}) {
  const base = {
    use: 'GridCardBlockModel',
    stepParams: {
      resourceSettings: {
        init: makeCollectionResourceInit('orders'),
      },
      GridCardSettings: {
        columnCount: {
          xs: 1,
          md: 2,
        },
      },
    },
    subModels: {
      item: {
        use: 'GridCardItemModel',
        subModels: {
          grid: {
            use: 'DetailsGridModel',
            subModels: {
              items: [],
            },
          },
          actions: [],
        },
      },
      actions: [],
    },
  };
  return {
    ...base,
    ...overrides,
    stepParams: {
      ...base.stepParams,
      ...overrides.stepParams,
    },
    subModels: {
      ...base.subModels,
      ...overrides.subModels,
    },
  };
}

test('canonicalizePayload defaults chart query and option modes without guessing runtime config', () => {
  const result = canonicalizePayload({
    payload: {
      use: 'ChartBlockModel',
      stepParams: {
        chartSettings: {
          configure: {
            query: {
              collectionPath: ['main', 'orders'],
            },
            chart: {
              option: {},
            },
          },
        },
      },
    },
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.payload.stepParams.chartSettings.configure.query.mode, 'builder');
  assert.equal(result.payload.stepParams.chartSettings.configure.chart.option.mode, 'basic');
  assert.deepEqual(result.payload.stepParams.chartSettings.configure.query.collectionPath, ['main', 'orders']);
  assert.equal(result.transforms.some((item) => item.code === 'CHART_QUERY_MODE_DEFAULTED'), true);
  assert.equal(result.transforms.some((item) => item.code === 'CHART_OPTION_MODE_DEFAULTED'), true);
});

test('auditPayload blocks invalid chart payloads and wrong config paths', () => {
  const result = auditPayload({
    payload: {
      use: 'ChartBlockModel',
      stepParams: {
        resourceSettings: {
          init: makeCollectionResourceInit('orders'),
        },
        chartSettings: {
          configure: {
            query: {
              mode: 'builder',
              collectionPath: ['orders'],
            },
            chart: {
              option: {
                mode: 'basic',
              },
            },
          },
        },
      },
    },
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'CHART_COLLECTION_PATH_SHAPE_INVALID'), true);
  assert.equal(result.blockers.some((item) => item.code === 'CHART_BUILDER_MEASURES_MISSING'), true);
  assert.equal(result.blockers.some((item) => item.code === 'CHART_BASIC_OPTION_BUILDER_MISSING'), true);
});

test('canonicalizePayload normalizes chart scalar-array and relation dotted fields', () => {
  const result = canonicalizePayload({
    payload: makeValidChartBlock({
      stepParams: {
        chartSettings: {
          configure: {
            query: {
              mode: 'builder',
              collectionPath: ['main', 'orders'],
              measures: [
                {
                  field: ['order_no'],
                  aggregation: 'count',
                  alias: 'count_order_no',
                },
              ],
              dimensions: [
                {
                  field: 'customer.name',
                  alias: 'customer_name',
                },
              ],
              orders: [
                {
                  field: 'customer.name',
                  alias: 'customer_name',
                  order: 'ASC',
                },
              ],
            },
            chart: {
              option: {
                mode: 'basic',
                builder: {
                  type: 'pie',
                  pieCategory: 'customer_name',
                  pieValue: 'count_order_no',
                },
              },
            },
          },
        },
      },
    }),
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.payload.stepParams.chartSettings.configure.query.measures[0].field, 'order_no');
  assert.deepEqual(result.payload.stepParams.chartSettings.configure.query.dimensions[0].field, ['customer', 'name']);
  assert.deepEqual(result.payload.stepParams.chartSettings.configure.query.orders[0].field, ['customer', 'name']);
  assert.equal(result.transforms.some((item) => item.code === 'CHART_QUERY_SCALAR_FIELD_CANONICALIZED'), true);
  assert.equal(result.transforms.some((item) => item.code === 'CHART_QUERY_RELATION_FIELD_CANONICALIZED'), true);
});

test('auditPayload accepts chart relation array paths resolved by metadata', () => {
  const result = auditPayload({
    payload: makeValidChartBlock({
      stepParams: {
        chartSettings: {
          configure: {
            query: {
              mode: 'builder',
              collectionPath: ['main', 'orders'],
              measures: [
                {
                  field: 'order_no',
                  aggregation: 'count',
                  alias: 'count_order_no',
                },
              ],
              dimensions: [
                {
                  field: ['customer', 'name'],
                  alias: 'customer_name',
                },
              ],
            },
            chart: {
              option: {
                mode: 'basic',
                builder: {
                  type: 'pie',
                  pieCategory: 'customer_name',
                  pieValue: 'count_order_no',
                },
              },
            },
          },
        },
      },
    }),
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, true);
  assert.equal(result.blockers.some((item) => item.code.startsWith('CHART_QUERY_')), false);
});

test('auditPayload blocks chart association field without explicit target field', () => {
  const result = auditPayload({
    payload: makeValidChartBlock({
      stepParams: {
        chartSettings: {
          configure: {
            query: {
              mode: 'builder',
              collectionPath: ['main', 'orders'],
              measures: [
                {
                  field: 'order_no',
                  aggregation: 'count',
                  alias: 'count_order_no',
                },
              ],
              dimensions: [
                {
                  field: 'customer',
                },
              ],
            },
          },
        },
      },
    }),
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'CHART_QUERY_ASSOCIATION_FIELD_TARGET_MISSING'), true);
});

test('auditPayload blocks unresolved chart relation target fields', () => {
  const result = auditPayload({
    payload: makeValidChartBlock({
      stepParams: {
        chartSettings: {
          configure: {
            query: {
              mode: 'builder',
              collectionPath: ['main', 'orders'],
              measures: [
                {
                  field: 'order_no',
                  aggregation: 'count',
                  alias: 'count_order_no',
                },
              ],
              dimensions: [
                {
                  field: ['customer', 'email'],
                  alias: 'customer_email',
                },
              ],
            },
            chart: {
              option: {
                mode: 'basic',
                builder: {
                  type: 'pie',
                  pieCategory: 'customer_email',
                  pieValue: 'count_order_no',
                },
              },
            },
          },
        },
      },
    }),
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'CHART_QUERY_RELATION_TARGET_FIELD_UNRESOLVED'), true);
});

test('auditPayload blocks unsupported chart field path shapes', () => {
  const result = auditPayload({
    payload: makeValidChartBlock({
      stepParams: {
        chartSettings: {
          configure: {
            query: {
              mode: 'builder',
              collectionPath: ['main', 'orders'],
              measures: [
                {
                  field: 'order_no',
                  aggregation: 'count',
                  alias: 'count_order_no',
                },
              ],
              dimensions: [
                {
                  field: ['customer', 'name', 'extra'],
                  alias: 'customer_name',
                },
              ],
            },
          },
        },
      },
    }),
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((item) => item.code === 'CHART_QUERY_FIELD_PATH_SHAPE_UNSUPPORTED'), true);
});

test('auditPayload blocks grid card payloads missing item subtree or invalid action slots', () => {
  const missingItemResult = auditPayload({
    payload: {
      use: 'GridCardBlockModel',
      stepParams: {
        resourceSettings: {
          init: makeCollectionResourceInit('orders'),
        },
      },
      subModels: {
        actions: [],
      },
    },
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(missingItemResult.ok, false);
  assert.equal(missingItemResult.blockers.some((item) => item.code === 'GRID_CARD_ITEM_SUBMODEL_MISSING'), true);

  const invalidActionsResult = auditPayload({
    payload: makeValidGridCardBlock({
      subModels: {
        item: {
          use: 'GridCardItemModel',
          subModels: {
            grid: {
              use: 'BlockGridModel',
            },
            actions: [
              { use: 'AddNewActionModel' },
            ],
          },
        },
        actions: [
          { use: 'ViewActionModel' },
        ],
      },
    }),
    metadata,
    mode: VALIDATION_CASE_MODE,
  });

  assert.equal(invalidActionsResult.ok, false);
  assert.equal(invalidActionsResult.blockers.some((item) => item.code === 'GRID_CARD_ITEM_GRID_MISSING_OR_INVALID'), true);
  assert.equal(invalidActionsResult.blockers.some((item) => item.code === 'GRID_CARD_BLOCK_ACTION_SLOT_USE_INVALID'), true);
  assert.equal(invalidActionsResult.blockers.some((item) => item.code === 'GRID_CARD_ITEM_ACTION_SLOT_USE_INVALID'), true);
});
