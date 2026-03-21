#!/usr/bin/env node

const BUSINESS_BLOCK_MODEL_USES = new Set([
  'FilterFormBlockModel',
  'TableBlockModel',
  'DetailsBlockModel',
  'CreateFormModel',
  'EditFormModel',
]);

function withAliases(aliases, fieldMap) {
  return Object.fromEntries(
    aliases.map((alias) => [alias, { ...fieldMap }]),
  );
}

const ADAPTERS = {
  case1: {
    collections: {
      val03217_c1_orders: 'order',
      orders: 'order',
    },
    fields: {
      ...withAliases(['val03217_c1_orders', 'orders', 'order'], {
        created_at: 'createdAt',
        'customer.name': 'account.name',
        customer: 'account',
        customer_id: 'account_id',
        order_no: 'order_number',
      }),
    },
    postTransform: ensureCase1RequiredActions,
  },
  case2: {
    collections: {
      val03217_c2_customers: 'account',
      val03217_c2_contacts: 'contact',
      val03217_c2_opportunities: 'opportunity',
      val03217_c2_activities: 'event',
      customers: 'account',
      contacts: 'contact',
      opportunities: 'opportunity',
      activities: 'event',
    },
    fields: {
      ...withAliases(['val03217_c2_customers', 'customers', 'account'], {
        level: 'type',
        owner_id: 'owner.nickname',
      }),
      ...withAliases(['val03217_c2_contacts', 'contacts', 'contact'], {
        customer_id: 'account_id',
      }),
      ...withAliases(['val03217_c2_opportunities', 'opportunities', 'opportunity'], {
        customer_id: 'account_id',
        status: 'stage',
        title: 'name',
      }),
      ...withAliases(['val03217_c2_activities', 'activities', 'event'], {
        content: 'subject',
        created_at: 'start_datetime',
        customer_id: 'account_id',
        type: 'description',
      }),
    },
  },
  case3: {
    collections: {
      materials: 'val03217_c3_materials',
      purchase_order_items: 'val03217_c3_purchase_order_items',
      purchase_orders: 'val03217_c3_purchase_orders',
      suppliers: 'val03217_c3_suppliers',
    },
    fields: {
      ...withAliases(['val03217_c3_purchase_orders', 'purchase_orders'], {
        supplier_id: 'supplier.name',
      }),
      ...withAliases(['val03217_c3_purchase_order_items', 'purchase_order_items'], {
        material_id: 'material.name',
      }),
    },
  },
  case4: {
    collections: {
      val03217_c4_projects_r1: 'projects',
      val03217_c4_tasks_r1: 'tasks',
      projects_r1: 'projects',
      tasks_r1: 'tasks',
    },
    fields: {
      ...withAliases(['val03217_c4_projects_r1', 'projects_r1', 'projects'], {
        end_date: 'updatedAt',
        owner: 'manager.nickname',
        owner_id: 'manager_id',
        start_date: 'planned_start',
      }),
    },
    postTransform: normalizeCase4ProjectOwnerFilter,
  },
  case5: {
    collections: {
      approval_logs: 'val03217_c5_approval_logs',
      approval_requests: 'val03217_c5_approval_requests',
      departments: 'val03217_c5_departments',
      users: 'val03217_c5_users',
    },
    fields: {},
  },
  case6: {
    collections: {
      customers: 'val03217_c6_customers',
      invoices: 'val03217_c6_invoices',
      orders: 'val03217_c6_orders',
      payments: 'val03217_c6_payments',
    },
    fields: {},
  },
  case7: {
    collections: {
      val03217_c7_departments: 'departments',
      departments_r1: 'departments',
    },
    fields: {
      ...withAliases(['val03217_c7_departments', 'departments_r1', 'departments'], {
        manager: 'owners.nickname',
        name: 'title',
        parent: 'parent.title',
      }),
    },
    postTransform: stripCase7EmptyPopupPages,
  },
  case8: {
    collections: {
      val03217_c8_projects: 'projects',
      val03217_c8_project_members: 'team_members',
      project_members: 'team_members',
    },
    fields: {
      ...withAliases(['val03217_c8_project_members', 'project_members', 'team_members'], {
        joined_at: 'createdAt',
        project_id: 'team_id',
        user: 'user.nickname',
      }),
    },
  },
  case9: {
    collections: {
      val03217_c9_customers: 'account',
      val03217_c9_contacts: 'contact',
      val03217_c9_opportunities: 'opportunity',
      val03217_c9_activities: 'event',
      customers: 'account',
      contacts: 'contact',
      opportunities: 'opportunity',
      activities: 'event',
    },
    fields: {
      ...withAliases(['val03217_c9_customers', 'customers', 'account'], {
        level: 'type',
      }),
      ...withAliases(['val03217_c9_contacts', 'contacts', 'contact'], {
        customer_id: 'account_id',
      }),
      ...withAliases(['val03217_c9_opportunities', 'opportunities', 'opportunity'], {
        customer_id: 'account_id',
        status: 'stage',
        title: 'name',
      }),
      ...withAliases(['val03217_c9_activities', 'activities', 'event'], {
        content: 'subject',
        created_at: 'start_datetime',
        customer_id: 'account_id',
      }),
    },
  },
  case10: {
    collections: {
      customers: 'val03217_c10_customers',
      order_items: 'val03217_c10_order_items',
      orders: 'val03217_c10_orders',
      products: 'val03217_c10_products',
    },
    fields: {},
  },
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function normalizeCaseId(caseId) {
  return String(caseId || '').trim().toLowerCase();
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveImplicitCollectionName(value) {
  if (!isPlainObject(value)) {
    return '';
  }
  return normalizeString(value.stepParams?.resourceSettings?.init?.collectionName)
    || normalizeString(value.stepParams?.fieldSettings?.init?.collectionName)
    || normalizeString(value.resourceSettings?.init?.collectionName)
    || normalizeString(value.fieldSettings?.init?.collectionName)
    || '';
}

function walkJson(value, visit) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkJson(item, visit));
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  visit(value);
  for (const nestedValue of Object.values(value)) {
    walkJson(nestedValue, visit);
  }
}

function countBusinessBlocks(model) {
  let count = 0;
  walkJson(model, (node) => {
    if (BUSINESS_BLOCK_MODEL_USES.has(node.use)) {
      count += 1;
    }
  });
  return count;
}

function hasNestedUse(model, expectedUse) {
  let matched = false;
  walkJson(model, (node) => {
    if (matched || !isPlainObject(node)) {
      return;
    }
    if (node.use === expectedUse) {
      matched = true;
    }
  });
  return matched;
}

function ensureSubModelArray(host, key) {
  if (!isPlainObject(host.subModels)) {
    host.subModels = {};
  }
  if (!Array.isArray(host.subModels[key])) {
    host.subModels[key] = [];
  }
  return host.subModels[key];
}

function findCase1OrderTableBlock(payload) {
  let matched = null;
  walkJson(payload, (node) => {
    if (matched || !isPlainObject(node) || node.use !== 'TableBlockModel') {
      return;
    }
    if (node.stepParams?.resourceSettings?.init?.collectionName === 'order') {
      matched = node;
    }
  });
  return matched;
}

function buildCase1FormItem({ uid, title, fieldPath, fieldUse }) {
  return {
    uid,
    use: 'FormItemModel',
    stepParams: {
      fieldSettings: {
        init: {
          dataSourceKey: 'main',
          collectionName: 'order',
          fieldPath,
        },
      },
      editItemSettings: {
        showLabel: {
          showLabel: true,
        },
        label: {
          title,
        },
      },
    },
    subKey: 'items',
    subType: 'array',
    subModels: {
      field: {
        uid: `${uid}-field`,
        use: fieldUse,
        stepParams: {
          fieldSettings: {
            init: {
              dataSourceKey: 'main',
              collectionName: 'order',
              fieldPath,
            },
          },
        },
        subKey: 'field',
        subType: 'object',
        sortIndex: 1,
      },
    },
  };
}

function buildCase1PopupFormAction({
  actionUid,
  actionUse,
  title,
  formUse,
  formUid,
  formFields,
  filterByTk = '',
}) {
  const formItems = formFields.map((field, index) => ({
    ...buildCase1FormItem({
      uid: `${formUid}-item-${index + 1}`,
      ...field,
    }),
    sortIndex: index + 1,
  }));
  const rowOrder = formItems.map((_, index) => `formRow${index + 1}`);
  const rows = Object.fromEntries(
    formItems.map((item, index) => [`formRow${index + 1}`, [[item.uid]]]),
  );
  const sizes = Object.fromEntries(
    formItems.map((_, index) => [`formRow${index + 1}`, [24]]),
  );

  return {
    uid: actionUid,
    use: actionUse,
    stepParams: {
      buttonSettings: {
        general: {
          title,
          type: 'link',
        },
      },
      popupSettings: {
        openView: {
          mode: 'drawer',
          size: 'medium',
          pageModelClass: 'ChildPageModel',
          dataSourceKey: 'main',
          collectionName: 'order',
          ...(filterByTk ? { filterByTk } : {}),
        },
      },
    },
    subKey: 'actions',
    subType: 'array',
    subModels: {
      page: {
        uid: `${actionUid}-page`,
        use: 'ChildPageModel',
        stepParams: {
          pageSettings: {
            general: {
              displayTitle: false,
              enableTabs: true,
            },
          },
        },
        subKey: 'page',
        subType: 'object',
        subModels: {
          tabs: [
            {
              uid: `${actionUid}-tab`,
              use: 'ChildPageTabModel',
              stepParams: {
                pageTabSettings: {
                  tab: {
                    title,
                  },
                },
              },
              subKey: 'tabs',
              subType: 'array',
              sortIndex: 1,
              subModels: {
                grid: {
                  uid: `${actionUid}-grid`,
                  use: 'BlockGridModel',
                  stepParams: {
                    gridSettings: {
                      grid: {
                        rows: {
                          popupRow1: [[formUid]],
                        },
                        sizes: {
                          popupRow1: [24],
                        },
                        rowOrder: ['popupRow1'],
                      },
                    },
                  },
                  subKey: 'grid',
                  subType: 'object',
                  subModels: {
                    items: [
                      {
                        uid: formUid,
                        use: formUse,
                        stepParams: {
                          resourceSettings: {
                            init: {
                              dataSourceKey: 'main',
                              collectionName: 'order',
                              ...(filterByTk ? { filterByTk: '{{ctx.view.inputArgs.filterByTk}}' } : {}),
                            },
                          },
                          formModelSettings: {
                            layout: {
                              layout: 'vertical',
                              colon: true,
                            },
                            assignRules: {
                              value: [],
                            },
                          },
                          eventSettings: {
                            linkageRules: {
                              value: [],
                            },
                          },
                          ...(formUse === 'EditFormModel'
                            ? {
                              formSettings: {
                                dataScope: {
                                  filter: {
                                    logic: '$and',
                                    items: [],
                                  },
                                },
                              },
                            }
                            : {}),
                        },
                        subKey: 'items',
                        subType: 'array',
                        subModels: {
                          grid: {
                            uid: `${formUid}-form-grid`,
                            use: 'FormGridModel',
                            stepParams: {
                              gridSettings: {
                                grid: {
                                  rows,
                                  sizes,
                                  rowOrder,
                                },
                              },
                            },
                            subKey: 'grid',
                            subType: 'object',
                            subModels: {
                              items: formItems,
                            },
                            sortIndex: 1,
                          },
                          actions: [
                            {
                              uid: `${formUid}-submit`,
                              use: 'FormSubmitActionModel',
                              stepParams: {
                                buttonSettings: {
                                  general: {
                                    title: '提交',
                                    type: 'primary',
                                  },
                                },
                                submitSettings: {
                                  confirm: {
                                    enable: false,
                                    title: '提交',
                                    content: '',
                                  },
                                },
                              },
                              subKey: 'actions',
                              subType: 'array',
                              sortIndex: 1,
                            },
                          ],
                        },
                        sortIndex: 1,
                      },
                    ],
                  },
                  sortIndex: 1,
                },
              },
            },
          ],
        },
        sortIndex: 1,
      },
    },
  };
}

function buildCase1ActionsColumn() {
  return {
    uid: 'case1-order-actions-column',
    use: 'TableActionsColumnModel',
    stepParams: {
      tableColumnSettings: {
        title: {
          title: '操作',
        },
      },
    },
    subKey: 'columns',
    subType: 'array',
    subModels: {
      actions: [],
    },
  };
}

function ensureCase1RequiredActions(payload, changes) {
  const tableBlock = findCase1OrderTableBlock(payload);
  if (!tableBlock) {
    return;
  }

  const blockActions = ensureSubModelArray(tableBlock, 'actions');
  const hasCreatePopup = blockActions.some((item) => hasNestedUse(item, 'CreateFormModel'));
  if (!hasCreatePopup) {
    blockActions.push(buildCase1PopupFormAction({
      actionUid: 'case1-order-create-action',
      actionUse: 'AddNewActionModel',
      title: '新建订单',
      formUse: 'CreateFormModel',
      formUid: 'case1-order-create-form',
      formFields: [
        { title: '订单号', fieldPath: 'order_number', fieldUse: 'InputFieldModel' },
        { title: '状态', fieldPath: 'status', fieldUse: 'SelectFieldModel' },
        { title: '金额', fieldPath: 'total_amount', fieldUse: 'NumberFieldModel' },
      ],
    }));
    changes.push({
      type: 'synthesizedAction',
      collectionName: 'order',
      action: 'create-popup',
    });
  }

  const columns = ensureSubModelArray(tableBlock, 'columns');
  let actionsColumn = columns.find((item) => isPlainObject(item) && item.use === 'TableActionsColumnModel') || null;
  if (!actionsColumn) {
    actionsColumn = buildCase1ActionsColumn();
    actionsColumn.sortIndex = columns.length + 1;
    columns.push(actionsColumn);
    changes.push({
      type: 'synthesizedColumn',
      collectionName: 'order',
      columnUse: 'TableActionsColumnModel',
    });
  }

  const rowActions = ensureSubModelArray(actionsColumn, 'actions');
  const hasEditPopup = rowActions.some((item) => hasNestedUse(item, 'EditFormModel'));
  if (!hasEditPopup) {
    rowActions.push(buildCase1PopupFormAction({
      actionUid: 'case1-order-edit-action',
      actionUse: 'EditActionModel',
      title: '编辑订单',
      formUse: 'EditFormModel',
      formUid: 'case1-order-edit-form',
      formFields: [
        { title: '状态', fieldPath: 'status', fieldUse: 'SelectFieldModel' },
        { title: '金额', fieldPath: 'total_amount', fieldUse: 'NumberFieldModel' },
      ],
      filterByTk: '{{ctx.record.id}}',
    }));
    changes.push({
      type: 'synthesizedAction',
      collectionName: 'order',
      action: 'edit-record-popup',
    });
  }
}

function stripCase7EmptyPopupPages(payload, changes) {
  walkJson(payload, (node) => {
    if (!isPlainObject(node) || !node.subModels || !isPlainObject(node.subModels.page)) {
      return;
    }
    if (
      node.use !== 'AddChildActionModel'
      && node.use !== 'EditActionModel'
      && node.use !== 'ViewActionModel'
    ) {
      return;
    }
    if (countBusinessBlocks(node.subModels.page) > 0) {
      return;
    }
    delete node.subModels.page;
    if (isPlainObject(node.stepParams?.popupSettings)) {
      delete node.stepParams.popupSettings;
    }
    changes.push({
      type: 'stripEmptyPopupPage',
      actionUse: node.use,
    });
  });
}

function normalizeCase4ProjectOwnerFilter(payload, changes) {
  walkJson(payload, (node) => {
    if (!isPlainObject(node) || node.use !== 'FilterFormItemModel') {
      return;
    }
    const fieldInit = node.stepParams?.fieldSettings?.init;
    if (!isPlainObject(fieldInit) || fieldInit.collectionName !== 'projects' || fieldInit.fieldPath !== 'manager.nickname') {
      return;
    }

    fieldInit.fieldPath = 'manager_id';
    delete fieldInit.associationPathName;
    changes.push({
      type: 'fieldPathOverride',
      collectionName: 'projects',
      from: 'manager.nickname',
      to: 'manager_id',
      reason: 'schema-compatible filter field',
    });

    const filterField = node.stepParams?.filterFormItemSettings?.init?.filterField;
    if (isPlainObject(filterField)) {
      filterField.name = 'manager_id';
      if (!filterField.title) {
        filterField.title = 'manager_id';
      }
      changes.push({
        type: 'filterFieldOverride',
        collectionName: 'projects',
        from: 'manager.nickname',
        to: 'manager_id',
      });
    }

    if (isPlainObject(node.subModels?.field) && node.subModels.field.use === 'FilterFormRecordSelectFieldModel') {
      node.subModels.field.use = 'NumberFieldModel';
      changes.push({
        type: 'fieldModelOverride',
        collectionName: 'projects',
        from: 'FilterFormRecordSelectFieldModel',
        to: 'NumberFieldModel',
      });
    }
  });
}

export function getCaseAdapter(caseId) {
  return ADAPTERS[normalizeCaseId(caseId)] || null;
}

export function remapCaseCollectionName({ caseId, collectionName }) {
  const adapter = getCaseAdapter(caseId);
  const normalizedCollectionName = normalizeString(collectionName);
  if (!adapter || !normalizedCollectionName) {
    return normalizedCollectionName;
  }
  return adapter.collections?.[normalizedCollectionName] || normalizedCollectionName;
}

export function remapCaseFieldPath({ caseId, collectionName, fieldPath }) {
  const adapter = getCaseAdapter(caseId);
  const normalizedCollectionName = normalizeString(collectionName);
  const normalizedFieldPath = normalizeString(fieldPath);
  if (!adapter || !normalizedCollectionName || !normalizedFieldPath) {
    return normalizedFieldPath;
  }
  return adapter.fields?.[normalizedCollectionName]?.[normalizedFieldPath] || normalizedFieldPath;
}

export function adaptCasePayload({ caseId, payload }) {
  const adapter = getCaseAdapter(caseId);
  if (!adapter) {
    return {
      payload: cloneJson(payload),
      changes: [],
    };
  }

  const workingPayload = cloneJson(payload);
  const changes = [];

  function walk(value, currentCollectionName = '') {
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, currentCollectionName));
      return;
    }
    if (!isPlainObject(value)) {
      return;
    }

    let nextCollectionName = currentCollectionName;
    const implicitCollectionName = resolveImplicitCollectionName(value);
    if (implicitCollectionName) {
      nextCollectionName = implicitCollectionName;
    }
    if (typeof value.collectionName === 'string' && value.collectionName.trim()) {
      const originalCollectionName = value.collectionName.trim();
      nextCollectionName = originalCollectionName;
      const mappedCollectionName = remapCaseCollectionName({
        caseId,
        collectionName: originalCollectionName,
      });
      if (mappedCollectionName && mappedCollectionName !== originalCollectionName) {
        value.collectionName = mappedCollectionName;
        changes.push({
          type: 'collection',
          from: originalCollectionName,
          to: mappedCollectionName,
        });
      }
    }

    const fieldMap = nextCollectionName ? adapter.fields?.[nextCollectionName] || null : null;
    if (fieldMap && typeof value.fieldPath === 'string') {
      const originalFieldPath = normalizeString(value.fieldPath);
      const mappedFieldPath = remapCaseFieldPath({
        caseId,
        collectionName: nextCollectionName,
        fieldPath: originalFieldPath,
      });
      if (mappedFieldPath && mappedFieldPath !== originalFieldPath) {
        value.fieldPath = mappedFieldPath;
        changes.push({
          type: 'fieldPath',
          collectionName: nextCollectionName,
          from: originalFieldPath,
          to: mappedFieldPath,
        });
        if (mappedFieldPath.includes('.')) {
          value.associationPathName = mappedFieldPath.split('.')[0];
        }
      }
    }

    if (fieldMap && typeof value.path === 'string') {
      const originalPath = normalizeString(value.path);
      const mappedPath = remapCaseFieldPath({
        caseId,
        collectionName: nextCollectionName,
        fieldPath: originalPath,
      });
      if (mappedPath && mappedPath !== originalPath) {
        value.path = mappedPath;
        changes.push({
          type: 'path',
          collectionName: nextCollectionName,
          from: originalPath,
          to: mappedPath,
        });
      }
    }

    if (fieldMap && typeof value.field === 'string') {
      const originalField = normalizeString(value.field);
      const mappedField = remapCaseFieldPath({
        caseId,
        collectionName: nextCollectionName,
        fieldPath: originalField,
      });
      if (mappedField && mappedField !== originalField) {
        value.field = mappedField;
        changes.push({
          type: 'field',
          collectionName: nextCollectionName,
          from: originalField,
          to: mappedField,
        });
      }
    }

    if (fieldMap && Array.isArray(value.fields)) {
      value.fields = value.fields.map((item) => {
        if (typeof item !== 'string') {
          return item;
        }
        const mappedField = remapCaseFieldPath({
          caseId,
          collectionName: nextCollectionName,
          fieldPath: item,
        });
        if (mappedField && mappedField !== item) {
          changes.push({
            type: 'fields[]',
            collectionName: nextCollectionName,
            from: item,
            to: mappedField,
          });
          return mappedField;
        }
        return item;
      });
    }

    if (
      fieldMap
      && typeof value.name === 'string'
      && (Object.prototype.hasOwnProperty.call(value, 'interface')
        || Object.prototype.hasOwnProperty.call(value, 'type')
        || Object.prototype.hasOwnProperty.call(value, 'title'))
    ) {
      const originalName = normalizeString(value.name);
      const mappedName = remapCaseFieldPath({
        caseId,
        collectionName: nextCollectionName,
        fieldPath: originalName,
      });
      if (mappedName && mappedName !== originalName) {
        value.name = mappedName;
        changes.push({
          type: 'name',
          collectionName: nextCollectionName,
          from: originalName,
          to: mappedName,
        });
      }
    }

    for (const nestedValue of Object.values(value)) {
      walk(nestedValue, nextCollectionName);
    }
  }

  walk(workingPayload);
  if (typeof adapter.postTransform === 'function') {
    adapter.postTransform(workingPayload, changes);
  }

  return {
    payload: workingPayload,
    changes,
  };
}
