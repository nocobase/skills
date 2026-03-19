import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_BLOCK_USES = [
  'FilterFormBlockModel',
  'TableBlockModel',
  'DetailsBlockModel',
  'CreateFormModel',
  'EditFormModel',
  'RootPageTabModel',
];

export const VALIDATION_PATTERN_IDS = [
  'table-column-rendering',
  'popup-openview',
  'relation-context',
  'record-actions',
  'tree-table',
  'many-to-many-and-through',
];

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeLookup(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/case\s+/g, 'case')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gu, '');
}

function buildCaseDefinition(definition) {
  return {
    ...definition,
    aliases: Array.isArray(definition.aliases) ? [...definition.aliases] : [],
    coverage: {
      blocks: Array.isArray(definition.coverage?.blocks) ? [...definition.coverage.blocks] : [],
      patterns: Array.isArray(definition.coverage?.patterns) ? [...definition.coverage.patterns] : [],
    },
    buildSpecInput: cloneValue(definition.buildSpecInput || {}),
    verifySpecInput: cloneValue(definition.verifySpecInput || {}),
  };
}

export const BLOCK_COVERAGE_MATRIX = [
  {
    target: 'FilterFormBlockModel',
    primaryCaseId: 'case1',
    secondaryCaseIds: ['case4', 'case5'],
  },
  {
    target: 'TableBlockModel',
    primaryCaseId: 'case4',
    secondaryCaseIds: ['case1', 'case3', 'case6', 'case7', 'case8', 'case10'],
  },
  {
    target: 'DetailsBlockModel',
    primaryCaseId: 'case2',
    secondaryCaseIds: ['case3', 'case5', 'case10'],
  },
  {
    target: 'CreateFormModel',
    primaryCaseId: 'case1',
    secondaryCaseIds: ['case4', 'case6', 'case8'],
  },
  {
    target: 'EditFormModel',
    primaryCaseId: 'case6',
    secondaryCaseIds: ['case1', 'case4', 'case8', 'case10'],
  },
  {
    target: 'RootPageTabModel',
    primaryCaseId: 'case9',
    secondaryCaseIds: ['case10'],
  },
];

export const PATTERN_COVERAGE_MATRIX = [
  {
    target: 'table-column-rendering',
    primaryCaseId: 'case1',
    secondaryCaseIds: ['case10'],
  },
  {
    target: 'popup-openview',
    primaryCaseId: 'case3',
    secondaryCaseIds: ['case4', 'case6', 'case10'],
  },
  {
    target: 'relation-context',
    primaryCaseId: 'case2',
    secondaryCaseIds: ['case3', 'case5', 'case6', 'case8', 'case10'],
  },
  {
    target: 'record-actions',
    primaryCaseId: 'case5',
    secondaryCaseIds: ['case7', 'case8', 'case10'],
  },
  {
    target: 'tree-table',
    primaryCaseId: 'case7',
    secondaryCaseIds: [],
  },
  {
    target: 'many-to-many-and-through',
    primaryCaseId: 'case8',
    secondaryCaseIds: [],
  },
];

export const VALIDATION_CASE_REGISTRY = [
  buildCaseDefinition({
    id: 'case1',
    title: '订单中心主页面',
    tier: 'core-pass',
    expectedOutcome: 'pass',
    aliases: ['订单中心', 'ordercenter', 'orderscenter'],
    docPath: 'references/validation-cases/case1.md',
    coverage: {
      blocks: ['FilterFormBlockModel', 'TableBlockModel', 'CreateFormModel', 'EditFormModel'],
      patterns: ['table-column-rendering', 'popup-openview'],
    },
    buildSpecInput: {
      target: {
        title: '订单中心',
      },
      layout: {
        blocks: [
          {
            kind: 'Filter',
            title: '订单筛选',
            collectionName: 'orders',
            fields: ['order_no', 'customer.name', 'status', 'created_at'],
          },
          {
            kind: 'Table',
            title: '订单列表',
            collectionName: 'orders',
            fields: ['order_no', 'customer.name', 'status', 'total_amount', 'created_at'],
            actions: [
              {
                kind: 'create-popup',
                label: '新建订单',
                popup: {
                  blocks: [
                    {
                      kind: 'Form',
                      mode: 'create',
                      collectionName: 'orders',
                      fields: ['order_no', 'customer_id', 'status', 'total_amount'],
                    },
                  ],
                },
              },
            ],
            rowActions: [
              {
                kind: 'edit-record-popup',
                label: '编辑订单',
                popup: {
                  blocks: [
                    {
                      kind: 'Form',
                      mode: 'edit',
                      collectionName: 'orders',
                      fields: ['status', 'total_amount'],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      dataBindings: {
        collections: ['customers', 'orders', 'order_items', 'products'],
        relations: [
          { sourceCollection: 'orders', targetCollection: 'customers', associationName: 'customer' },
          { sourceCollection: 'order_items', targetCollection: 'orders', associationName: 'order' },
          { sourceCollection: 'order_items', targetCollection: 'products', associationName: 'product' },
        ],
      },
    },
    verifySpecInput: {
      preOpen: {
        assertions: [
          {
            kind: 'bodyTextIncludesAll',
            values: ['订单中心', '订单列表'],
            severity: 'blocking',
          },
        ],
      },
      stages: [
        {
          id: 'orders-filter',
          title: '订单筛选可见',
          trigger: { kind: 'focus-filter', text: '订单筛选' },
          waitFor: { kind: 'bodyTextIncludesAll', values: ['订单号', '状态'] },
        },
        {
          id: 'orders-table',
          title: '订单主表可见',
          trigger: { kind: 'noop' },
          waitFor: { kind: 'bodyTextIncludesAll', values: ['订单号', '客户名称'] },
        },
      ],
    },
  }),
  buildCaseDefinition({
    id: 'case2',
    title: '客户 360 工作台',
    tier: 'core-pass',
    expectedOutcome: 'pass',
    aliases: ['客户360', '客户工作台', 'customer360'],
    docPath: 'references/validation-cases/case2.md',
    coverage: {
      blocks: ['DetailsBlockModel', 'TableBlockModel'],
      patterns: ['relation-context', 'popup-openview'],
    },
    buildSpecInput: {
      target: {
        title: '客户 360 工作台',
      },
      layout: {
        blocks: [
          {
            kind: 'Details',
            title: '客户详情',
            collectionName: 'customers',
            fields: ['name', 'level', 'owner_id'],
            blocks: [
              {
                kind: 'Table',
                title: '联系人',
                collectionName: 'contacts',
                fields: ['name', 'phone', 'email'],
                relationScope: {
                  sourceCollection: 'customers',
                  targetCollection: 'contacts',
                  associationName: 'contacts',
                },
                rowActions: [
                  {
                    kind: 'view-record-popup',
                    label: '查看联系人',
                    popup: {
                      blocks: [
                        {
                          kind: 'Details',
                          collectionName: 'contacts',
                          fields: ['name', 'phone', 'email'],
                        },
                      ],
                    },
                  },
                ],
              },
              {
                kind: 'Table',
                title: '商机',
                collectionName: 'opportunities',
                fields: ['title', 'status', 'amount'],
                relationScope: {
                  sourceCollection: 'customers',
                  targetCollection: 'opportunities',
                  associationName: 'opportunities',
                },
                rowActions: [
                  {
                    kind: 'edit-record-popup',
                    label: '编辑商机',
                    popup: {
                      blocks: [
                        {
                          kind: 'Form',
                          mode: 'edit',
                          collectionName: 'opportunities',
                          fields: ['title', 'status', 'amount'],
                        },
                      ],
                    },
                  },
                ],
              },
              {
                kind: 'Table',
                title: '跟进记录',
                collectionName: 'activities',
                fields: ['type', 'content', 'created_at'],
                relationScope: {
                  sourceCollection: 'customers',
                  targetCollection: 'activities',
                  associationName: 'activities',
                },
              },
            ],
          },
        ],
      },
      dataBindings: {
        collections: ['customers', 'contacts', 'opportunities', 'activities'],
        relations: [
          { sourceCollection: 'contacts', targetCollection: 'customers', associationName: 'customer' },
          { sourceCollection: 'opportunities', targetCollection: 'customers', associationName: 'customer' },
          { sourceCollection: 'activities', targetCollection: 'customers', associationName: 'customer' },
        ],
      },
    },
    verifySpecInput: {
      preOpen: {
        assertions: [
          {
            kind: 'bodyTextIncludesAll',
            values: ['客户 360 工作台', '客户详情'],
            severity: 'blocking',
          },
        ],
      },
      stages: [
        {
          id: 'customer-rich-sample',
          title: '富样本客户可见',
          trigger: { kind: 'noop' },
          waitFor: { kind: 'bodyTextIncludesAll', values: ['联系人', '商机', '跟进记录'] },
        },
      ],
    },
  }),
  buildCaseDefinition({
    id: 'case3',
    title: '采购单与明细抽屉',
    tier: 'composite-pass',
    expectedOutcome: 'partial',
    aliases: ['采购单中心', '采购单抽屉', 'purchaseorderdrawer'],
    docPath: 'references/validation-cases/case3.md',
    coverage: {
      blocks: ['TableBlockModel', 'DetailsBlockModel'],
      patterns: ['popup-openview', 'relation-context'],
    },
    buildSpecInput: {
      target: {
        title: '采购单中心',
      },
      layout: {
        blocks: [
          {
            kind: 'Table',
            title: '采购单列表',
            collectionName: 'purchase_orders',
            fields: ['po_no', 'supplier.name', 'status', 'total_amount'],
            rowActions: [
              {
                kind: 'view-record-popup',
                label: '查看详情',
                popup: {
                  blocks: [
                    {
                      kind: 'Details',
                      title: '采购单详情',
                      collectionName: 'purchase_orders',
                      fields: ['po_no', 'status', 'total_amount'],
                      blocks: [
                        {
                          kind: 'Table',
                          title: '采购明细',
                          collectionName: 'purchase_order_items',
                          fields: ['material.name', 'quantity', 'amount'],
                          relationScope: {
                            sourceCollection: 'purchase_orders',
                            targetCollection: 'purchase_order_items',
                            associationName: 'items',
                          },
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
      dataBindings: {
        collections: ['suppliers', 'purchase_orders', 'purchase_order_items', 'materials'],
        relations: [
          { sourceCollection: 'purchase_orders', targetCollection: 'suppliers', associationName: 'supplier' },
          { sourceCollection: 'purchase_order_items', targetCollection: 'purchase_orders', associationName: 'purchase_order' },
          { sourceCollection: 'purchase_order_items', targetCollection: 'materials', associationName: 'material' },
        ],
      },
    },
    verifySpecInput: {
      preOpen: {
        assertions: [
          {
            kind: 'bodyTextIncludesAll',
            values: ['采购单中心', '采购单列表'],
            severity: 'blocking',
          },
        ],
      },
      stages: [
        {
          id: 'purchase-order-popup',
          title: '采购单详情抽屉',
          trigger: { kind: 'click-row-action', text: '查看详情' },
          waitFor: { kind: 'bodyTextIncludesAll', values: ['采购单详情', '采购明细'] },
        },
      ],
    },
  }),
  buildCaseDefinition({
    id: 'case4',
    title: '项目与任务协同页面',
    tier: 'core-pass',
    expectedOutcome: 'pass',
    aliases: ['项目协同工作台', '项目工作台', 'projectworkbench'],
    docPath: 'references/validation-cases/case4.md',
    coverage: {
      blocks: ['FilterFormBlockModel', 'TableBlockModel', 'DetailsBlockModel', 'CreateFormModel', 'EditFormModel'],
      patterns: ['popup-openview', 'relation-context'],
    },
    buildSpecInput: {
      target: {
        title: '项目协同工作台',
      },
      layout: {
        blocks: [
          {
            kind: 'Filter',
            title: '项目筛选',
            collectionName: 'projects',
            fields: ['name', 'status', 'owner_id'],
          },
          {
            kind: 'Table',
            title: '项目列表',
            collectionName: 'projects',
            fields: ['name', 'status', 'owner_id', 'start_date', 'end_date'],
            rowActions: [
              {
                kind: 'view-record-popup',
                label: '查看项目',
                popup: {
                  blocks: [
                    {
                      kind: 'Details',
                      title: '项目详情',
                      collectionName: 'projects',
                      fields: ['name', 'status', 'owner_id', 'start_date', 'end_date'],
                      blocks: [
                        {
                          kind: 'Table',
                          title: '任务列表',
                          collectionName: 'tasks',
                          fields: ['title', 'status', 'priority', 'assignee_id'],
                          relationScope: {
                            sourceCollection: 'projects',
                            targetCollection: 'tasks',
                            associationName: 'tasks',
                          },
                          actions: [
                            {
                              kind: 'create-popup',
                              label: '新增任务',
                              popup: {
                                blocks: [
                                  {
                                    kind: 'Form',
                                    mode: 'create',
                                    collectionName: 'tasks',
                                    fields: ['title', 'status', 'priority', 'assignee_id'],
                                  },
                                ],
                              },
                            },
                          ],
                          rowActions: [
                            {
                              kind: 'edit-record-popup',
                              label: '编辑任务',
                              popup: {
                                blocks: [
                                  {
                                    kind: 'Form',
                                    mode: 'edit',
                                    collectionName: 'tasks',
                                    fields: ['title', 'status', 'priority', 'assignee_id'],
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
            ],
          },
        ],
      },
      dataBindings: {
        collections: ['projects', 'tasks', 'users'],
        relations: [
          { sourceCollection: 'tasks', targetCollection: 'projects', associationName: 'project' },
          { sourceCollection: 'tasks', targetCollection: 'users', associationName: 'assignee' },
        ],
      },
    },
    verifySpecInput: {
      preOpen: {
        assertions: [
          {
            kind: 'bodyTextIncludesAll',
            values: ['项目协同工作台', '项目列表'],
            severity: 'blocking',
          },
        ],
      },
      stages: [
        {
          id: 'project-details',
          title: '项目详情抽屉',
          trigger: { kind: 'click-row-action', text: '查看项目' },
          waitFor: { kind: 'bodyTextIncludesAll', values: ['项目详情', '任务列表'] },
        },
      ],
    },
  }),
  buildCaseDefinition({
    id: 'case5',
    title: '审批处理台',
    tier: 'composite-pass',
    expectedOutcome: 'partial',
    aliases: ['审批处理台', '审批日志', 'approvaldesk'],
    docPath: 'references/validation-cases/case5.md',
    coverage: {
      blocks: ['FilterFormBlockModel', 'DetailsBlockModel', 'TableBlockModel'],
      patterns: ['record-actions', 'relation-context'],
    },
    buildSpecInput: {
      target: {
        title: '审批处理台',
      },
      layout: {
        blocks: [
          {
            kind: 'Filter',
            title: '审批筛选',
            collectionName: 'approval_requests',
            fields: ['title', 'status', 'applicant_id', 'department_id'],
          },
          {
            kind: 'Table',
            title: '审批单列表',
            collectionName: 'approval_requests',
            fields: ['title', 'applicant_id', 'department_id', 'status', 'submitted_at'],
            rowActions: [
              {
                kind: 'view-record-popup',
                label: '查看审批',
                popup: {
                  blocks: [
                    {
                      kind: 'Details',
                      title: '审批详情',
                      collectionName: 'approval_requests',
                      fields: ['title', 'status', 'submitted_at'],
                      actions: [
                        {
                          kind: 'record-action',
                          label: '通过',
                        },
                        {
                          kind: 'record-action',
                          label: '驳回',
                        },
                      ],
                      blocks: [
                        {
                          kind: 'Table',
                          title: '审批日志',
                          collectionName: 'approval_logs',
                          fields: ['operator_id', 'action', 'comment', 'created_at'],
                          relationScope: {
                            sourceCollection: 'approval_requests',
                            targetCollection: 'approval_logs',
                            associationName: 'approval_logs',
                          },
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
      dataBindings: {
        collections: ['approval_requests', 'approval_logs', 'users', 'departments'],
        relations: [
          { sourceCollection: 'approval_requests', targetCollection: 'users', associationName: 'applicant' },
          { sourceCollection: 'approval_requests', targetCollection: 'departments', associationName: 'department' },
          { sourceCollection: 'approval_logs', targetCollection: 'approval_requests', associationName: 'approval_request' },
        ],
      },
    },
    verifySpecInput: {
      preOpen: {
        assertions: [
          {
            kind: 'bodyTextIncludesAll',
            values: ['审批处理台', '审批单列表'],
            severity: 'blocking',
          },
        ],
      },
      stages: [
        {
          id: 'approval-details',
          title: '审批详情链路',
          trigger: { kind: 'click-row-action', text: '查看审批' },
          waitFor: { kind: 'bodyTextIncludesAll', values: ['审批详情', '审批日志'] },
        },
      ],
    },
  }),
  buildCaseDefinition({
    id: 'case6',
    title: '发票与回款工作台',
    tier: 'core-pass',
    expectedOutcome: 'pass',
    aliases: ['发票回款', 'invoicepayments', '发票工作台'],
    docPath: 'references/validation-cases/case6.md',
    coverage: {
      blocks: ['TableBlockModel', 'CreateFormModel', 'EditFormModel', 'DetailsBlockModel'],
      patterns: ['popup-openview', 'relation-context'],
    },
    buildSpecInput: {
      target: {
        title: '发票与回款工作台',
      },
      layout: {
        blocks: [
          {
            kind: 'Table',
            title: '发票列表',
            collectionName: 'invoices',
            fields: ['invoice_no', 'customer.name', 'order.order_no', 'status', 'amount'],
            actions: [
              {
                kind: 'create-popup',
                label: '新建发票',
                popup: {
                  blocks: [
                    {
                      kind: 'Form',
                      mode: 'create',
                      collectionName: 'invoices',
                      fields: ['invoice_no', 'customer_id', 'order_id', 'status', 'amount'],
                    },
                  ],
                },
              },
            ],
            rowActions: [
              {
                kind: 'edit-record-popup',
                label: '编辑发票',
                popup: {
                  blocks: [
                    {
                      kind: 'Form',
                      mode: 'edit',
                      collectionName: 'invoices',
                      fields: ['status', 'amount'],
                    },
                  ],
                },
              },
              {
                kind: 'view-record-popup',
                label: '查看发票',
                popup: {
                  blocks: [
                    {
                      kind: 'Details',
                      title: '发票详情',
                      collectionName: 'invoices',
                      fields: ['invoice_no', 'status', 'amount'],
                      blocks: [
                        {
                          kind: 'Table',
                          title: '回款记录',
                          collectionName: 'payments',
                          fields: ['paid_amount', 'paid_at', 'remark'],
                          relationScope: {
                            sourceCollection: 'invoices',
                            targetCollection: 'payments',
                            associationName: 'payments',
                          },
                          actions: [
                            {
                              kind: 'create-popup',
                              label: '登记回款',
                              popup: {
                                blocks: [
                                  {
                                    kind: 'Form',
                                    mode: 'create',
                                    collectionName: 'payments',
                                    fields: ['paid_amount', 'paid_at', 'remark'],
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
            ],
          },
        ],
      },
      dataBindings: {
        collections: ['customers', 'orders', 'invoices', 'payments'],
        relations: [
          { sourceCollection: 'invoices', targetCollection: 'customers', associationName: 'customer' },
          { sourceCollection: 'invoices', targetCollection: 'orders', associationName: 'order' },
          { sourceCollection: 'payments', targetCollection: 'invoices', associationName: 'invoice' },
        ],
      },
    },
    verifySpecInput: {
      preOpen: {
        assertions: [
          {
            kind: 'bodyTextIncludesAll',
            values: ['发票与回款工作台', '发票列表'],
            severity: 'blocking',
          },
        ],
      },
      stages: [
        {
          id: 'invoice-details',
          title: '发票详情与回款',
          trigger: { kind: 'click-row-action', text: '查看发票' },
          waitFor: { kind: 'bodyTextIncludesAll', values: ['发票详情', '回款记录'] },
        },
      ],
    },
  }),
  buildCaseDefinition({
    id: 'case7',
    title: '组织架构树页面',
    tier: 'edge-detect',
    expectedOutcome: 'partial',
    aliases: ['组织架构', '组织树', 'departmenttree'],
    docPath: 'references/validation-cases/case7.md',
    coverage: {
      blocks: ['TableBlockModel'],
      patterns: ['tree-table', 'record-actions'],
    },
    buildSpecInput: {
      target: {
        title: '组织架构',
      },
      layout: {
        blocks: [
          {
            kind: 'Table',
            title: '部门树表',
            collectionName: 'departments',
            fields: ['name', 'parent_id', 'manager_id'],
            treeTable: true,
            rowActions: [
              {
                kind: 'add-child-record-popup',
                label: '新增下级部门',
                popup: {
                  blocks: [
                    {
                      kind: 'Form',
                      mode: 'create',
                      collectionName: 'departments',
                      fields: ['name', 'manager_id'],
                    },
                  ],
                },
              },
              {
                kind: 'edit-record-popup',
                label: '编辑部门',
                popup: {
                  blocks: [
                    {
                      kind: 'Form',
                      mode: 'edit',
                      collectionName: 'departments',
                      fields: ['name', 'manager_id'],
                    },
                  ],
                },
              },
              {
                kind: 'view-record-popup',
                label: '查看部门成员',
                popup: {
                  blocks: [
                    {
                      kind: 'Details',
                      title: '部门详情',
                      collectionName: 'departments',
                      fields: ['name', 'manager_id'],
                      blocks: [
                        {
                          kind: 'Table',
                          title: '部门成员',
                          collectionName: 'users',
                          fields: ['nickname', 'email'],
                          relationScope: {
                            sourceCollection: 'departments',
                            targetCollection: 'users',
                            associationName: 'users',
                          },
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
      dataBindings: {
        collections: ['departments', 'users'],
        relations: [
          { sourceCollection: 'departments', targetCollection: 'departments', associationName: 'parent' },
          { sourceCollection: 'users', targetCollection: 'departments', associationName: 'department' },
        ],
      },
    },
    verifySpecInput: {
      preOpen: {
        assertions: [
          {
            kind: 'bodyTextIncludesAll',
            values: ['组织架构', '部门树表'],
            severity: 'blocking',
          },
        ],
      },
      stages: [
        {
          id: 'department-tree',
          title: '树表渲染',
          trigger: { kind: 'noop' },
          waitFor: { kind: 'bodyTextIncludesAll', values: ['新增下级部门', '编辑部门'] },
        },
      ],
    },
  }),
  buildCaseDefinition({
    id: 'case8',
    title: '项目成员多对多管理',
    tier: 'edge-detect',
    expectedOutcome: 'blocker-expected',
    aliases: ['项目成员管理', '多对多成员', 'projectmembers'],
    docPath: 'references/validation-cases/case8.md',
    coverage: {
      blocks: ['TableBlockModel', 'CreateFormModel', 'EditFormModel'],
      patterns: ['many-to-many-and-through', 'record-actions', 'relation-context'],
    },
    buildSpecInput: {
      target: {
        title: '项目成员管理',
      },
      layout: {
        blocks: [
          {
            kind: 'Table',
            title: '项目列表',
            collectionName: 'projects',
            fields: ['name', 'status'],
            rowActions: [
              {
                kind: 'view-record-popup',
                label: '查看成员',
                popup: {
                  blocks: [
                    {
                      kind: 'Details',
                      title: '项目成员详情',
                      collectionName: 'projects',
                      fields: ['name', 'status'],
                      blocks: [
                        {
                          kind: 'Table',
                          title: '项目成员',
                          collectionName: 'project_members',
                          fields: ['user.nickname', 'role', 'joined_at'],
                          relationScope: {
                            sourceCollection: 'projects',
                            targetCollection: 'project_members',
                            associationName: 'project_members',
                          },
                          actions: [
                            {
                              kind: 'create-popup',
                              label: '添加成员',
                              popup: {
                                blocks: [
                                  {
                                    kind: 'Form',
                                    mode: 'create',
                                    collectionName: 'project_members',
                                    fields: ['user_id', 'role', 'joined_at'],
                                  },
                                ],
                              },
                            },
                          ],
                          rowActions: [
                            {
                              kind: 'edit-record-popup',
                              label: '编辑成员角色',
                              popup: {
                                blocks: [
                                  {
                                    kind: 'Form',
                                    mode: 'edit',
                                    collectionName: 'project_members',
                                    fields: ['role', 'joined_at'],
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
            ],
          },
        ],
      },
      dataBindings: {
        collections: ['projects', 'users', 'project_members'],
        relations: [
          { sourceCollection: 'project_members', targetCollection: 'projects', associationName: 'project' },
          { sourceCollection: 'project_members', targetCollection: 'users', associationName: 'user' },
        ],
      },
    },
    verifySpecInput: {
      preOpen: {
        assertions: [
          {
            kind: 'bodyTextIncludesAll',
            values: ['项目成员管理', '项目列表'],
            severity: 'blocking',
          },
        ],
      },
      stages: [
        {
          id: 'project-members',
          title: '成员关系表',
          trigger: { kind: 'click-row-action', text: '查看成员' },
          waitFor: { kind: 'bodyTextIncludesAll', values: ['项目成员', '编辑成员角色'] },
        },
      ],
    },
  }),
  buildCaseDefinition({
    id: 'case9',
    title: '客户运营多标签工作台',
    tier: 'edge-detect',
    expectedOutcome: 'partial',
    aliases: ['多标签页', '多标签工作台', 'multitabs'],
    docPath: 'references/validation-cases/case9.md',
    coverage: {
      blocks: ['RootPageTabModel', 'DetailsBlockModel', 'TableBlockModel'],
      patterns: [],
    },
    buildSpecInput: {
      target: {
        title: '客户运营工作台',
      },
      layout: {
        tabs: [
          {
            title: '客户概览',
            blocks: [
              {
                kind: 'Details',
                collectionName: 'customers',
                fields: ['name', 'level'],
              },
            ],
          },
          {
            title: '联系人',
            blocks: [
              {
                kind: 'Table',
                collectionName: 'contacts',
                fields: ['name'],
              },
            ],
          },
          {
            title: '商机',
            blocks: [
              {
                kind: 'Table',
                collectionName: 'opportunities',
                fields: ['title', 'status'],
              },
            ],
          },
          {
            title: '跟进记录',
            blocks: [
              {
                kind: 'Table',
                collectionName: 'activities',
                fields: ['content', 'created_at'],
              },
            ],
          },
        ],
      },
      requirements: {
        requiredTabs: [
          {
            pageUse: 'RootPageModel',
            titles: ['客户概览', '联系人', '商机', '跟进记录'],
            requireBlockGrid: true,
          },
        ],
      },
      dataBindings: {
        collections: ['customers', 'contacts', 'opportunities', 'activities'],
        relations: [
          { sourceCollection: 'contacts', targetCollection: 'customers', associationName: 'customer' },
          { sourceCollection: 'opportunities', targetCollection: 'customers', associationName: 'customer' },
          { sourceCollection: 'activities', targetCollection: 'customers', associationName: 'customer' },
        ],
      },
    },
    verifySpecInput: {
      preOpen: {
        assertions: [
          {
            kind: 'bodyTextIncludesAll',
            values: ['客户概览', '联系人', '商机', '跟进记录'],
            severity: 'blocking',
          },
        ],
      },
      stages: [
        {
          id: 'contacts-tab',
          title: '联系人标签',
          trigger: { kind: 'click-tab', text: '联系人' },
          waitFor: { kind: 'bodyTextIncludesAll', values: ['联系人'] },
        },
        {
          id: 'activities-tab',
          title: '跟进记录标签',
          trigger: { kind: 'click-tab', text: '跟进记录' },
          waitFor: { kind: 'bodyTextIncludesAll', values: ['跟进记录'] },
        },
      ],
    },
  }),
  buildCaseDefinition({
    id: 'case10',
    title: '嵌套弹窗链路',
    tier: 'edge-detect',
    expectedOutcome: 'blocker-expected',
    aliases: ['订单嵌套弹窗', '嵌套弹窗', 'nestedpopup'],
    docPath: 'references/validation-cases/case10.md',
    coverage: {
      blocks: ['TableBlockModel', 'DetailsBlockModel', 'EditFormModel'],
      patterns: ['popup-openview', 'relation-context', 'record-actions', 'table-column-rendering'],
    },
    buildSpecInput: {
      target: {
        title: '订单嵌套弹窗',
      },
      layout: {
        blocks: [
          {
            kind: 'Table',
            title: '订单列表',
            collectionName: 'orders',
            fields: ['order_no', 'customer.name', 'status'],
            rowActions: [
              {
                kind: 'view-record-popup',
                label: '查看详情',
                popup: {
                  blocks: [
                    {
                      kind: 'Details',
                      title: '订单详情',
                      collectionName: 'orders',
                      fields: ['order_no', 'customer.name', 'status'],
                      actions: [
                        {
                          kind: 'view-record-popup',
                          label: '查看客户',
                          popup: {
                            blocks: [
                              {
                                kind: 'Details',
                                title: '客户详情',
                                collectionName: 'customers',
                                fields: ['name'],
                              },
                            ],
                          },
                        },
                      ],
                      blocks: [
                        {
                          kind: 'Table',
                          title: '订单项',
                          collectionName: 'order_items',
                          fields: ['product.name', 'quantity', 'amount'],
                          relationScope: {
                            sourceCollection: 'orders',
                            targetCollection: 'order_items',
                            associationName: 'order_items',
                          },
                          rowActions: [
                            {
                              kind: 'edit-record-popup',
                              label: '编辑订单项',
                              popup: {
                                blocks: [
                                  {
                                    kind: 'Form',
                                    mode: 'edit',
                                    collectionName: 'order_items',
                                    fields: ['quantity', 'amount'],
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
            ],
          },
        ],
      },
      dataBindings: {
        collections: ['customers', 'orders', 'order_items', 'products'],
        relations: [
          { sourceCollection: 'orders', targetCollection: 'customers', associationName: 'customer' },
          { sourceCollection: 'order_items', targetCollection: 'orders', associationName: 'order' },
          { sourceCollection: 'order_items', targetCollection: 'products', associationName: 'product' },
        ],
      },
    },
    verifySpecInput: {
      preOpen: {
        assertions: [
          {
            kind: 'bodyTextIncludesAll',
            values: ['订单嵌套弹窗', '订单列表'],
            severity: 'blocking',
          },
        ],
      },
      stages: [
        {
          id: 'order-details',
          title: '订单详情弹窗',
          trigger: { kind: 'click-row-action', text: '查看详情' },
          waitFor: { kind: 'bodyTextIncludesAll', values: ['订单详情', '订单项'] },
        },
        {
          id: 'customer-popup',
          title: '客户详情弹窗',
          trigger: { kind: 'click-action', text: '查看客户' },
          waitFor: { kind: 'bodyTextIncludesAll', values: ['客户详情'] },
        },
      ],
    },
  }),
];

const CASES_BY_ID = new Map(VALIDATION_CASE_REGISTRY.map((entry) => [entry.id, entry]));

export function getValidationCaseById(caseId) {
  const id = normalizeLookup(caseId);
  return CASES_BY_ID.get(id) || null;
}

export function resolveValidationCase({ caseRequest, baseSlug } = {}) {
  const requestText = String(caseRequest || '').trim();
  const normalizedRequest = normalizeLookup(requestText);
  const normalizedBaseSlug = normalizeLookup(baseSlug);
  const candidates = [];

  if (normalizedBaseSlug) {
    candidates.push({
      type: 'base-slug',
      value: normalizedBaseSlug,
    });
  }

  const caseMatch = requestText.match(/\bcase\s*([0-9]{1,2})\b/i);
  if (caseMatch) {
    candidates.push({
      type: 'request-case-id',
      value: `case${caseMatch[1]}`,
    });
  }

  if (normalizedRequest) {
    candidates.push({
      type: 'request-text',
      value: normalizedRequest,
    });
  }

  for (const candidate of candidates) {
    const direct = getValidationCaseById(candidate.value);
    if (direct) {
      return {
        matched: true,
        matchedBy: candidate.type,
        matchedValue: candidate.value,
        caseId: direct.id,
        caseDefinition: cloneValue(direct),
      };
    }
  }

  const aliasMatches = [];
  for (const entry of VALIDATION_CASE_REGISTRY) {
    const allKeys = [entry.id, entry.title, ...entry.aliases].map((item) => normalizeLookup(item));
    for (const candidate of candidates) {
      const matchedKey = allKeys.find((key) => key && candidate.value.includes(key));
      if (!matchedKey) {
        continue;
      }
      aliasMatches.push({
        caseDefinition: entry,
        matchedBy: candidate.type,
        matchedValue: matchedKey,
        score: matchedKey.length,
      });
    }
  }

  if (aliasMatches.length > 0) {
    aliasMatches.sort((left, right) => right.score - left.score);
    const winner = aliasMatches[0];
    return {
      matched: true,
      matchedBy: winner.matchedBy,
      matchedValue: winner.matchedValue,
      caseId: winner.caseDefinition.id,
      caseDefinition: cloneValue(winner.caseDefinition),
    };
  }

  return {
    matched: false,
    matchedBy: '',
    matchedValue: '',
    caseId: '',
    caseDefinition: null,
    fallbackReason: 'CASE_REGISTRY_UNMATCHED',
  };
}

export function listValidationCases() {
  return cloneValue(VALIDATION_CASE_REGISTRY);
}

export function resolveValidationCaseDocPath(caseDefinition) {
  if (!caseDefinition?.docPath) {
    return '';
  }
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, '..', caseDefinition.docPath);
}
