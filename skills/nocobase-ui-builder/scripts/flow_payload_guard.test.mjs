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
        { name: 'customer', type: 'belongsTo', interface: 'm2o', target: 'customers', foreignKey: 'customer_id' },
      ],
    },
    customers: {
      fields: [
        { name: 'name', type: 'string', interface: 'input' },
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
  assert.equal(
    result.warnings.some((item) => item.code === 'FILTER_ITEM_USES_FIELD_NOT_PATH' && item.accepted === true),
    true,
  );
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
