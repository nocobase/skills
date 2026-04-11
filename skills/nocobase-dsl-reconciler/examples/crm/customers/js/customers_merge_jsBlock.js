// ==========================================
// Customer Merge Manager v1.0 - English
// React + MultiRecordResource
// ==========================================

console.log('Customer Merge Manager v1.0 loading...');

const { React, ReactDOM, antd } = ctx;
const {
  Card, Button, Table, Space, Modal, message,
  Radio, Spin, Alert, Pagination, Badge, Tag, Tooltip
} = antd;
const h = React.createElement;

// ========== Configuration ==========
const CONFIG = {
  pageName: 'Customer Merge Manager',
  version: 'v1.0',

  mergeOperationResource: 'nb_crm_merge_operations',
  mergeOperationItemsResource: 'merge_operation_items',
  customerResource: 'nb_crm_customers',

  pageSize: 10,
  autoRefreshInterval: 2000,

  ignoredFields: new Set([
    'id', 'createdAt', 'updatedAt', 'createdById', 'updatedById',
    'original_customer_id', 'original_item_id',
    'owner_id', 'parent_id', 'source_lead_id', 'region_id',
    'account_number', 'merge_operation_items',
    'ai_health_assessed_at', 'ai_nba_generated_at',
  ]),

  importantFields: [
    'name', 'phone', 'website', 'address', 'country',
    'industry', 'type', 'level', 'status'
  ],

  statusColors: {
    'pending': { color: '#fa8c16', bg: '#fff7e6' },
    'merged': { color: '#52c41a', bg: '#f6ffed' },
    'cancelled': { color: '#d9d9d9', bg: '#fafafa' }
  }
};

// ========== Utility Functions ==========

function formatDisplayValue(value) {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getFieldDisplayName(fieldName) {
  var map = {
    name: 'Company Name', phone: 'Phone', website: 'Website',
    address: 'Address', country: 'Country', industry: 'Industry',
    type: 'Type', level: 'Level', status: 'Status',
    description: 'Description', annual_revenue: 'Annual Revenue',
    number_of_employees: 'Employees', preferred_currency: 'Currency',
    extra: 'Extra', ai_tags: 'AI Tags', ai_health_score: 'Health Score',
    ai_churn_risk: 'Churn Risk', ai_recommendations: 'Recommendations',
    ai_next_best_action: 'Next Best Action', ai_best_contact_time: 'Best Contact Time',
    ai_health_grade: 'Health Grade', ai_churn_risk_level: 'Risk Level',
    ai_health_dimensions: 'Health Dimensions', is_deleted: 'Deleted',
  };
  return map[fieldName] || fieldName.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

function getTimeDiff(dateString) {
  if (!dateString) return 'unknown';
  var diff = new Date() - new Date(dateString);
  var days = Math.floor(diff / (1000 * 60 * 60 * 24));
  var hours = Math.floor(diff / (1000 * 60 * 60));
  var minutes = Math.floor(diff / (1000 * 60));
  if (days > 0) return days + 'd ago';
  if (hours > 0) return hours + 'h ago';
  if (minutes > 0) return minutes + 'm ago';
  return 'just now';
}

// ========== Main Component ==========
function CustomerMergeManager() {
  var _s = React.useState({
    operations: [],
    currentPage: 1,
    totalCount: 0,
    selectedOperationId: null,
    selectedOperation: null,
    customers: [],
    selectedMasterIndex: 0,
    fieldSelections: {},
    mergedPreview: {},
    isLoadingOperations: false,
    isLoadingCustomers: false,
    isSaving: false,
    error: null
  });
  var state = _s[0];
  var setState = _s[1];

  var updateState = function(updates) {
    setState(function(prev) { return Object.assign({}, prev, updates); });
  };

  // ========== Data Loading ==========

  var loadOperations = React.useCallback(function(page, showLoading) {
    if (page === undefined) page = 1;
    if (showLoading === undefined) showLoading = true;

    (async function() {
      try {
        if (showLoading) updateState({ isLoadingOperations: true, error: null });

        ctx.useResource('MultiRecordResource');
        ctx.resource.setResourceName(CONFIG.mergeOperationResource);
        ctx.resource.setFields(null);
        ctx.resource.setFilterByTk(null);
        ctx.resource.setAppends(['operator', 'merge_operation_items']);
        ctx.resource.setPageSize(CONFIG.pageSize);
        ctx.resource.setPage(page);
        ctx.resource.setSort(['-id']);
        await ctx.resource.refresh();

        var data = ctx.resource.getData() || [];
        var meta = ctx.resource.getMeta && ctx.resource.getMeta() || {};

        updateState({
          operations: data,
          currentPage: page,
          totalCount: meta.count || 0,
          isLoadingOperations: false
        });

        if (showLoading && data.length > 0 && !state.selectedOperationId) {
          loadCustomerDetails(data[0].id, data[0]);
        }
      } catch (error) {
        console.error('Failed to load operations:', error);
        updateState({ isLoadingOperations: false, error: 'Failed to load operations' });
        message.error('Load failed');
      }
    })();
  }, [state.selectedOperationId]);

  var loadCustomerDetails = React.useCallback(function(operationId, operation) {
    (async function() {
      try {
        updateState({
          isLoadingCustomers: true,
          selectedOperationId: operationId,
          selectedOperation: operation,
          error: null
        });

        ctx.useResource('MultiRecordResource');
        ctx.resource.setResourceName(CONFIG.mergeOperationResource + '.' + CONFIG.mergeOperationItemsResource);
        ctx.resource.setSourceId(operationId);
        ctx.resource.setAppends(['customer']);
        ctx.resource.setSort(['id']);
        ctx.resource.setPageSize(20);
        await ctx.resource.refresh();

        var items = ctx.resource.getData() || [];

        if (items.length === 0) {
          message.warning('No customer data for this operation');
          updateState({ isLoadingCustomers: false });
          return;
        }

        var customers = items.map(function(item) {
          return Object.assign({}, item.customer, {
            original_item_id: item.id,
            original_customer_id: item.customer_id
          });
        });

        var fieldSelections = {};
        var mergedPreview = {};

        if (operation && operation.detail_json && typeof operation.detail_json === 'object' && Object.keys(operation.detail_json).length > 0) {
          Object.keys(operation.detail_json).forEach(function(fieldName) {
            var selectedCustomerId = operation.detail_json[fieldName];
            var customerIndex = customers.findIndex(function(c) {
              return (c.original_customer_id || c.id) == selectedCustomerId;
            });
            if (customerIndex !== -1) {
              fieldSelections[fieldName] = customerIndex;
              mergedPreview[fieldName] = customers[customerIndex][fieldName];
            }
          });

          var customerSelections = {};
          Object.values(operation.detail_json).forEach(function(customerId) {
            customerSelections[customerId] = (customerSelections[customerId] || 0) + 1;
          });
          var mostSelectedId = Object.keys(customerSelections).reduce(function(a, b) {
            return customerSelections[a] > customerSelections[b] ? a : b;
          });
          var masterIdx = customers.findIndex(function(c) {
            return (c.original_customer_id || c.id) == mostSelectedId;
          });
          if (masterIdx !== -1) {
            updateState({ selectedMasterIndex: masterIdx });
          }
        } else {
          var defaultIdx = customers.findIndex(function(c) { return c.status !== 'disabled'; });
          if (defaultIdx === -1) defaultIdx = 0;
          var defaultCustomer = customers[defaultIdx];
          Object.keys(defaultCustomer).forEach(function(fieldName) {
            if (!CONFIG.ignoredFields.has(fieldName)) {
              fieldSelections[fieldName] = defaultIdx;
              mergedPreview[fieldName] = defaultCustomer[fieldName];
            }
          });
          updateState({ selectedMasterIndex: defaultIdx });
        }

        updateState({
          customers: customers,
          fieldSelections: fieldSelections,
          mergedPreview: mergedPreview,
          isLoadingCustomers: false
        });
      } catch (error) {
        console.error('Failed to load customer details:', error);
        updateState({ isLoadingCustomers: false, error: 'Failed to load details' });
        message.error('Failed to load customer details');
      }
    })();
  }, []);

  var deleteOperation = React.useCallback(function(operationId) {
    Modal.confirm({
      title: 'Confirm Delete',
      content: 'Delete operation #' + operationId + '? This cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async function() {
        try {
          ctx.useResource('MultiRecordResource');
          ctx.resource.setResourceName(CONFIG.mergeOperationResource);
          await ctx.resource.destroy(operationId);
          message.success('Operation deleted');
          loadOperations(state.currentPage);
        } catch (error) {
          message.error('Delete failed');
        }
      }
    });
  }, [state.currentPage, loadOperations]);

  var cancelOperation = React.useCallback(function() {
    if (!state.selectedOperationId) {
      message.error('Please select an operation first');
      return;
    }
    Modal.confirm({
      title: 'Confirm Cancel',
      content: 'Cancel this merge operation?',
      okText: 'Confirm',
      okType: 'danger',
      cancelText: 'Go Back',
      onOk: async function() {
        try {
          updateState({ isSaving: true });
          await ctx.api.request({
            url: CONFIG.mergeOperationResource + ':update?filterByTk=' + state.selectedOperationId,
            method: 'post',
            data: { status: 'cancelled' }
          });
          message.success('Merge operation cancelled');
          await loadOperations(state.currentPage, false);
          updateState({
            selectedOperation: Object.assign({}, state.selectedOperation, { status: 'cancelled' }),
            isSaving: false
          });
        } catch (error) {
          message.error('Cancel failed');
          updateState({ isSaving: false });
        }
      }
    });
  }, [state.selectedOperationId, state.selectedOperation, state.currentPage, loadOperations]);

  // ========== Business Logic ==========

  var handleMasterRecordChange = React.useCallback(function(customerIndex) {
    var selectedCustomer = state.customers[customerIndex];
    updateState({ selectedMasterIndex: customerIndex });
    var newFieldSelections = {};
    var newMergedPreview = {};
    Object.keys(selectedCustomer).forEach(function(fieldName) {
      if (!CONFIG.ignoredFields.has(fieldName)) {
        newFieldSelections[fieldName] = customerIndex;
        newMergedPreview[fieldName] = selectedCustomer[fieldName];
      }
    });
    updateState({ fieldSelections: newFieldSelections, mergedPreview: newMergedPreview });
    message.success('Master record switched');
  }, [state.customers]);

  var handleFieldValueChange = React.useCallback(function(fieldName, customerIndex) {
    updateState({
      fieldSelections: Object.assign({}, state.fieldSelections, { [fieldName]: customerIndex }),
      mergedPreview: Object.assign({}, state.mergedPreview, { [fieldName]: state.customers[customerIndex][fieldName] })
    });
  }, [state.customers, state.fieldSelections, state.mergedPreview]);

  var confirmMerge = React.useCallback(function() {
    if (!state.selectedOperationId) { message.error('Please select an operation'); return; }
    var masterCustomer = state.customers[state.selectedMasterIndex];
    if (masterCustomer && masterCustomer.status === 'disabled') {
      message.error('Master customer is disabled. Please select a different master.');
      return;
    }
    updateState({ isSaving: true });

    (async function() {
      try {
        var detailJson = {};
        Object.keys(state.fieldSelections).forEach(function(fieldName) {
          var ci = state.fieldSelections[fieldName];
          var c = state.customers[ci];
          detailJson[fieldName] = c.original_customer_id || c.id;
        });

        var masterCustomer = state.customers[state.selectedMasterIndex];
        var masterCustomerId = masterCustomer.original_customer_id || masterCustomer.id;

        await ctx.api.request({
          url: CONFIG.mergeOperationResource + ':update?filterByTk=' + state.selectedOperationId,
          method: 'post',
          data: { status: 'merged', detail_json: detailJson, customer_id: masterCustomerId }
        });

        var mergedData = Object.assign({}, masterCustomer);
        Object.keys(detailJson).forEach(function(fieldName) {
          var srcId = detailJson[fieldName];
          var src = state.customers.find(function(c) { return (c.original_customer_id || c.id) == srcId; });
          if (src && src[fieldName] !== undefined) mergedData[fieldName] = src[fieldName];
        });
        delete mergedData.original_customer_id;
        delete mergedData.original_item_id;

        await ctx.api.request({
          url: CONFIG.customerResource + ':update?filterByTk=' + masterCustomerId,
          method: 'post',
          data: mergedData
        });

        message.success('Merge successful!');
        await loadOperations(state.currentPage, false);
        updateState({
          selectedOperation: Object.assign({}, state.selectedOperation, { status: 'merged', customer_id: masterCustomerId, detail_json: detailJson }),
          isSaving: false
        });
      } catch (error) {
        console.error('Merge failed:', error);
        message.error('Merge failed: ' + (error.message || 'Unknown error'));
        updateState({ isSaving: false });
      }
    })();
  }, [state, loadOperations]);

  // ========== Lifecycle ==========

  React.useEffect(function() { loadOperations(1, true); }, []);

  React.useEffect(function() {
    if (!CONFIG.autoRefreshInterval) return;
    var timer = setInterval(async function() {
      try {
        ctx.useResource('MultiRecordResource');
        ctx.resource.setResourceName(CONFIG.mergeOperationResource);
        ctx.resource.setFields(null);
        ctx.resource.setFilterByTk(null);
        ctx.resource.setAppends(['operator', 'merge_operation_items']);
        ctx.resource.setPageSize(CONFIG.pageSize);
        ctx.resource.setPage(state.currentPage);
        ctx.resource.setSort(['-id']);
        await ctx.resource.refresh();
        var data = ctx.resource.getData() || [];
        var meta = ctx.resource.getMeta && ctx.resource.getMeta() || {};
        updateState({ operations: data, totalCount: meta.count || 0 });
      } catch (e) {}
    }, CONFIG.autoRefreshInterval);
    return function() { clearInterval(timer); };
  }, [state.currentPage]);

  // ========== Sub-components ==========

  var OperationListItem = function(props) {
    var op = props.operation;
    var sc = CONFIG.statusColors[op.status] || CONFIG.statusColors['pending'];
    return h('div', {
      onClick: props.onClick,
      style: {
        padding: '8px', marginBottom: '4px', borderRadius: '4px',
        border: '1px solid ' + (props.isSelected ? '#1890ff' : '#f0f0f0'),
        background: props.isSelected ? '#e6f7ff' : '#fff',
        cursor: 'pointer', transition: 'all 0.2s'
      }
    },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } },
            h('span', { style: { fontWeight: 500, fontSize: '13px' } }, '#' + op.id),
            h(Tag, { color: sc.color === '#52c41a' ? 'success' : sc.color === '#fa8c16' ? 'warning' : 'default', style: { margin: 0, fontSize: '11px' } },
              op.status === 'pending' ? 'Pending' : op.status === 'merged' ? 'Merged' : 'Cancelled')
          ),
          h('div', { style: { fontSize: '11px', color: '#8c8c8c' } },
            (op.operator ? op.operator.nickname : '-') + ' · ' + (op.merge_operation_items ? op.merge_operation_items.length : 0) + ' customers'
          )
        ),
        h(Button, {
          type: 'text', danger: true, size: 'small',
          style: { padding: '0 4px', minWidth: 'auto' },
          onClick: function(e) { e.stopPropagation(); props.onDelete(op.id); }
        }, '×')
      )
    );
  };

  var OperationsPanel = function() {
    return h(Card, {
      title: h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        'Operations',
        h(Badge, { count: state.totalCount, showZero: true, style: { backgroundColor: '#1890ff' } }),
        h(Button, { type: 'text', size: 'small', style: { marginLeft: 'auto', padding: '0 4px' }, onClick: function() { loadOperations(state.currentPage, true); } }, '↻')
      ),
      size: 'small',
      style: { height: '100%' },
      bodyStyle: { overflow: 'auto', height: 'calc(100% - 45px)', padding: '8px' }
    },
      state.isLoadingOperations
        ? h('div', { style: { textAlign: 'center', padding: '20px' } }, h(Spin))
        : state.operations.length === 0
          ? h(Alert, { message: 'No merge operations', type: 'info', showIcon: true })
          : h('div', null,
              state.operations.map(function(op) {
                return h(OperationListItem, {
                  key: op.id,
                  operation: op,
                  isSelected: op.id === state.selectedOperationId,
                  onClick: function() { loadCustomerDetails(op.id, op); },
                  onDelete: deleteOperation
                });
              }),
              state.totalCount > CONFIG.pageSize
                ? h('div', { style: { textAlign: 'center', marginTop: '8px' } },
                    h(Pagination, {
                      current: state.currentPage,
                      total: state.totalCount,
                      pageSize: CONFIG.pageSize,
                      size: 'small',
                      showTotal: function(t) { return t + ' total'; },
                      onChange: function(p) { loadOperations(p); }
                    })
                  )
                : null
            )
    );
  };

  var CustomerComparisonTable = function() {
    if (state.customers.length === 0) {
      return h(Alert, { message: 'Select an operation from the list on the left', type: 'info' });
    }

    var isReadOnly = state.selectedOperation && (state.selectedOperation.status === 'merged' || state.selectedOperation.status === 'cancelled');
    var allFields = new Set();
    state.customers.forEach(function(c) {
      Object.keys(c).forEach(function(k) {
        if (!CONFIG.ignoredFields.has(k) && typeof c[k] !== 'object') allFields.add(k);
      });
    });

    var sortedFields = Array.from(allFields).sort(function(a, b) {
      var ai = CONFIG.importantFields.indexOf(a);
      var bi = CONFIG.importantFields.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });

    var columns = [
      { title: 'Field', dataIndex: 'fieldName', width: 150, fixed: 'left',
        render: function(t) { return h('span', { style: { fontWeight: 500, fontSize: '12px' } }, getFieldDisplayName(t)); } },
    ];

    state.customers.forEach(function(c, i) {
      var isDisabledCustomer = c.status === 'disabled';
      columns.push({
        title: h('div', { style: { textAlign: 'center', opacity: isDisabledCustomer ? 0.45 : 1 } },
          h('div', { style: { fontWeight: 600 } },
            c.name || 'Customer ' + (i + 1),
            isDisabledCustomer ? h(Tag, { color: 'default', style: { marginLeft: '4px', fontSize: '10px' } }, 'Disabled') : null
          ),
          h('div', { style: { fontSize: '11px', color: '#8c8c8c' } }, '#' + (c.original_customer_id || c.id)),
          !isReadOnly ? h(Button, {
            size: 'small', type: state.selectedMasterIndex === i ? 'primary' : 'default',
            style: { marginTop: '4px', fontSize: '11px' },
            disabled: isDisabledCustomer,
            onClick: function() { handleMasterRecordChange(i); }
          }, state.selectedMasterIndex === i ? 'Master' : 'Set as Master') : null
        ),
        dataIndex: 'values',
        width: 200,
        render: function(_, record) {
          var val = formatDisplayValue(c[record.fieldName]);
          var isSelected = state.fieldSelections[record.fieldName] === i;
          var cellDisabled = isReadOnly || isDisabledCustomer;
          return h('div', {
            style: {
              padding: '4px 8px', borderRadius: '4px',
              background: isSelected ? '#e6f7ff' : 'transparent',
              opacity: isDisabledCustomer ? 0.45 : 1,
              cursor: cellDisabled ? 'not-allowed' : 'pointer'
            },
            onClick: cellDisabled ? undefined : function() { handleFieldValueChange(record.fieldName, i); }
          },
            h(Radio, { checked: isSelected, disabled: cellDisabled, onChange: function() { handleFieldValueChange(record.fieldName, i); } }),
            h('span', { style: { marginLeft: '4px', fontSize: '12px' } }, val)
          );
        }
      });
    });

    columns.push({
      title: 'Merged Result', dataIndex: 'merged', width: 180, fixed: 'right',
      render: function(_, record) {
        var val = formatDisplayValue(state.mergedPreview[record.fieldName]);
        return h('span', { style: { fontWeight: 500, color: '#1890ff', fontSize: '12px' } }, val);
      }
    });

    var dataSource = sortedFields.map(function(f) { return { key: f, fieldName: f }; });

    return h('div', null,
      h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' } },
        h('div', null,
          h(Button, { danger: true, size: 'small', loading: state.isSaving, onClick: cancelOperation, disabled: isReadOnly }, 'Cancel')
        ),
        h('div', { style: { display: 'flex', gap: '8px' } },
          h(Button, { size: 'small', onClick: function() { if (state.customers[0]) handleMasterRecordChange(0); }, disabled: isReadOnly }, 'Reset'),
          h(Button, { type: 'primary', size: 'small', loading: state.isSaving, onClick: confirmMerge, disabled: isReadOnly }, 'Execute Merge')
        )
      ),
      isReadOnly ? h(Alert, {
        message: state.selectedOperation.status === 'merged' ? 'This operation has been merged (read-only)' : 'This operation has been cancelled (read-only)',
        type: state.selectedOperation.status === 'merged' ? 'success' : 'warning',
        showIcon: true, style: { marginBottom: '12px' }
      }) : null,
      h(Table, {
        columns: columns, dataSource: dataSource,
        pagination: false, size: 'small', bordered: true,
        scroll: { x: 150 + state.customers.length * 200 + 180 }
      })
    );
  };

  // ========== Render ==========
  return h('div', { style: { padding: '8px' } },
    h('div', { style: { display: 'flex', gap: '12px', height: 'calc(100vh - 200px)', minHeight: '500px' } },
      h('div', { style: { width: '260px', flexShrink: 0 } }, h(OperationsPanel)),
      h('div', { style: { flex: 1, overflow: 'auto' } },
        h(Card, { size: 'small', title: 'Field Comparison', style: { height: '100%' }, bodyStyle: { overflow: 'auto', height: 'calc(100% - 45px)' } },
          state.isLoadingCustomers ? h('div', { style: { textAlign: 'center', padding: '40px' } }, h(Spin, { size: 'large' }))
            : h(CustomerComparisonTable)
        )
      )
    )
  );
}

ctx.render(h(CustomerMergeManager));
