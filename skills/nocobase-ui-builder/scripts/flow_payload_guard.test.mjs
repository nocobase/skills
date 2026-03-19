import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import {
  BLOCKER_EXIT_CODE,
  GENERAL_MODE,
  VALIDATION_CASE_MODE,
  auditPayload,
  buildFilterGroup,
  extractRequiredMetadata,
} from './flow_payload_guard.mjs';

const SCRIPT_PATH = path.join(
  process.cwd(),
  'skills',
  'nocobase-ui-builder',
  'scripts',
  'flow_payload_guard.mjs',
);

const metadata = {
  collections: {
    orders: {
      titleField: 'order_no',
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
  },
};

const metadataWithCustomerTitle = {
  collections: {
    ...metadata.collections,
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
              use: 'PageTabModel',
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
                    items: [tableBlock],
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
              use: 'PageTabModel',
              subModels: {
                grid: {
                  use: 'BlockGridModel',
                  subModels: {
                    items: [
                      {
                        use: 'EditFormModel',
                        stepParams: {
                          resourceSettings: {
                            init: {
                              collectionName,
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
                                        collectionName,
                                        fieldPath: 'quantity',
                                      },
                                    },
                                  },
                                },
                                {
                                  use: 'FormSubmitActionModel',
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

function makeActionTargetBlock(collectionName = 'order_items', actions = []) {
  return {
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName,
        },
      },
    },
    subModels: {
      actions,
    },
  };
}

function makeRowActionTargetBlock(collectionName = 'order_items', actions = []) {
  return {
    use: 'TableBlockModel',
    stepParams: {
      resourceSettings: {
        init: {
          collectionName,
        },
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
                      init: {
                        collectionName: 'orders',
                      },
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
              use: 'PageTabModel',
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

test('auditPayload blocks malformed filter items that use field instead of path', () => {
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

test('auditPayload warns on hardcoded filterByTk in general mode and blocks in validation-case mode', () => {
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
              use: 'PageTabModel',
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
        init: {
          collectionName: 'team_memberships',
        },
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
          subModels: {
            field: {
              use: 'DisplayTextFieldModel',
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
              fieldPath: 'customer.name',
            },
          },
        },
      },
    },
  };

  const result = auditPayload({ payload, metadata: metadataWithCustomerTitle, mode: VALIDATION_CASE_MODE });
  assert.equal(result.blockers.some((item) => item.code === 'ASSOCIATION_SPLIT_DISPLAY_BINDING_UNSTABLE'), false);
  assert.equal(result.blockers.some((item) => item.code === 'FIELD_PATH_NOT_FOUND'), false);
  assert.equal(result.ok, true);
});

test('auditPayload warns and blocks empty details blocks', () => {
  const payload = {
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
  };

  const generalResult = auditPayload({ payload, metadata: metadataWithCustomerTitle, mode: GENERAL_MODE });
  assert.equal(generalResult.ok, true);
  assert.equal(generalResult.warnings.some((item) => item.code === 'EMPTY_DETAILS_BLOCK'), true);

  const validationResult = auditPayload({ payload, metadata: metadataWithCustomerTitle, mode: VALIDATION_CASE_MODE });
  assert.equal(validationResult.ok, false);
  assert.equal(validationResult.blockers.some((item) => item.code === 'EMPTY_DETAILS_BLOCK'), true);
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

test('auditPayload accepts declared edit-record-popup requirements when stable action tree exists', () => {
  const payload = makeActionTargetBlock('order_items', [makeEditRecordPopupAction('order_items')]);

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
        init: {
          collectionName: 'orders',
        },
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
              use: 'PageTabModel',
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
      cwd: path.join(process.cwd(), 'skills', 'nocobase-ui-builder'),
      encoding: 'utf8',
    },
  );
  const result = JSON.parse(output);
  assert.equal(result.filter.items[0].path, 'customer');
  assert.equal(result.filter.items[0].operator, '$eq');
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
      cwd: path.join(process.cwd(), 'skills', 'nocobase-ui-builder'),
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, BLOCKER_EXIT_CODE);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.blockers.some((item) => item.code === 'FOREIGN_KEY_USED_AS_FIELD_PATH'), true);
});
