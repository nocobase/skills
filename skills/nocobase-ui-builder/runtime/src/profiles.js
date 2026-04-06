import { COMPAT_PROFILE_VERSION } from './constants.js';
import { unique } from './utils.js';

function functionDoc(description) {
  return { type: 'function', description };
}

function objectDoc(description, children = {}) {
  return { type: 'object', description, children };
}

function valueDoc(description, type = 'any') {
  return { type, description };
}

const ELEMENT_CONTRACT = objectDoc('Render container ElementProxy.', {
  append: functionDoc('Append values into the render container.'),
  replaceChildren: functionDoc('Replace values in the render container.'),
  querySelector: functionDoc('Unsupported deterministic selector probe.'),
  querySelectorAll: functionDoc('Unsupported deterministic selector probe.'),
  addEventListener: functionDoc('Attach one event listener.'),
  removeEventListener: functionDoc('Detach one event listener.'),
  dispatchEvent: functionDoc('Dispatch one DOM-like event.'),
  innerHTML: valueDoc('Render container inner HTML.', 'string'),
  textContent: valueDoc('Render container text content.', 'string'),
});

const BASE_CONTRACT = {
  t: functionDoc('Translate text. This runtime returns the key with {{var}} interpolation.'),
  render: functionDoc(
    'Render one HTML string or structured value into the render container. JSX syntax is lowered before execution; chart profiles write plain text while other profiles write HTML.',
  ),
  runjs: functionDoc('Execute one nested RunJS snippet in simulated mode.'),
  request: functionDoc('HTTP read helper. Only GET/HEAD are allowed.'),
  api: objectDoc('API helper namespace.', {
    request: functionDoc('Same behavior as ctx.request.'),
  }),
  getVar: functionDoc('Resolve one ctx.* path from the current mock context.'),
  getVarInfos: functionDoc('Inspect available keys under the current mock context.'),
  initResource: functionDoc('Initialize one simulated resource on ctx.resource when needed.'),
  importAsync: functionDoc('Blocked in this runtime.'),
  requireAsync: functionDoc('Blocked in this runtime.'),
  loadCSS: functionDoc('Blocked in this runtime.'),
  React: valueDoc('Top-level alias for ctx.libs.React.', 'object'),
  ReactDOM: valueDoc('Top-level alias for ctx.libs.ReactDOM.', 'object'),
  antd: valueDoc('Top-level alias for ctx.libs.antd.', 'object'),
  antdIcons: valueDoc('Top-level alias for ctx.libs.antdIcons.', 'object'),
  dayjs: functionDoc('Minimal dayjs-compatible helper.'),
  libs: objectDoc('Shared library namespace.', {
    React: valueDoc('Minimal React-compatible namespace.', 'object'),
    ReactDOM: valueDoc('Minimal ReactDOM-compatible namespace.', 'object'),
    antd: valueDoc('Minimal Ant Design-compatible namespace.', 'object'),
    antdIcons: valueDoc('Minimal Ant Design icon namespace.', 'object'),
    dayjs: functionDoc('Minimal dayjs-compatible helper.'),
  }),
  element: ELEMENT_CONTRACT,
  message: objectDoc('Simulated feedback API.', {
    success: functionDoc('Record a success message attempt.'),
    info: functionDoc('Record an info message attempt.'),
    warning: functionDoc('Record a warning message attempt.'),
    error: functionDoc('Record an error message attempt.'),
  }),
  notification: objectDoc('Simulated notification API.', {
    open: functionDoc('Record a notification attempt.'),
    success: functionDoc('Record a success notification attempt.'),
    info: functionDoc('Record an info notification attempt.'),
    warning: functionDoc('Record a warning notification attempt.'),
    error: functionDoc('Record an error notification attempt.'),
  }),
  modal: objectDoc('Simulated modal API.', {
    info: functionDoc('Record a modal info attempt.'),
    success: functionDoc('Record a modal success attempt.'),
    warning: functionDoc('Record a modal warning attempt.'),
    error: functionDoc('Record a modal error attempt.'),
    confirm: functionDoc('Record a modal confirm attempt.'),
  }),
  viewer: objectDoc('Blocked popup/navigation helpers.', {
    popover: functionDoc('Blocked in this runtime.'),
    dialog: functionDoc('Blocked in this runtime.'),
    drawer: functionDoc('Blocked in this runtime.'),
  }),
  openView: functionDoc('Blocked in this runtime.'),
  popup: objectDoc('Popup data context.', {
    record: valueDoc('Current popup record.', 'object'),
    sourceRecord: valueDoc('Parent/source popup record.', 'object'),
  }),
  inputArgs: valueDoc('Runtime input arguments.', 'object'),
};

const RESOURCE_CONTRACT = objectDoc('Resource info and selected rows.', {
  dataSourceKey: valueDoc('Data source key.', 'string'),
  collectionName: valueDoc('Collection name.', 'string'),
  associationName: valueDoc('Association name.', 'string'),
  sourceId: valueDoc('Source id.', 'any'),
  selectedRows: valueDoc('Selected rows.', 'array'),
  getSelectedRows: functionDoc('Return selected rows.'),
  getSourceId: functionDoc('Return source id.'),
});

const COLLECTION_CONTRACT = objectDoc('Collection info.', {
  name: valueDoc('Collection name.', 'string'),
  title: valueDoc('Collection title.', 'string'),
  dataSourceKey: valueDoc('Data source key.', 'string'),
});

const COLLECTION_FIELD_CONTRACT = objectDoc('Collection field info.', {
  name: valueDoc('Field name.', 'string'),
  title: valueDoc('Field title.', 'string'),
  interface: valueDoc('Field interface.', 'string'),
  type: valueDoc('Field type.', 'string'),
});

const FORM_CONTRACT = objectDoc('Mutable in-memory form API.', {
  getFieldValue: functionDoc('Read one field from formValues.'),
  setFieldValue: functionDoc('Update one field in formValues.'),
  getFieldsValue: functionDoc('Read the full formValues object.'),
  setFieldsValue: functionDoc('Merge a patch into formValues.'),
});

const CHART_DATA_CONTRACT = objectDoc('Chart runtime dataset.', {
  objects: valueDoc('Normalized chart rows.', 'array'),
  raw: valueDoc('Raw resource data.', 'array'),
  meta: valueDoc('Resource meta info.', 'object'),
});

const CHART_INSTANCE_CONTRACT = objectDoc('ECharts-like chart instance.', {
  on: functionDoc('Bind one chart event listener.'),
  off: functionDoc('Remove one chart event listener.'),
  dispatchAction: functionDoc('Dispatch one chart action.'),
  setOption: functionDoc('Patch chart option.'),
  getOption: functionDoc('Read current option.'),
  resize: functionDoc('Resize the chart instance.'),
});

const PRECISE_ROOTS = new Set(['api', 'form', 'viewer', 'message', 'notification', 'modal', 'element', 'chart']);
const OPAQUE_ROOTS = new Set([
  'React',
  'ReactDOM',
  'antd',
  'antdIcons',
  'record',
  'formValues',
  'selectedRows',
  'resource',
  'collection',
  'collectionField',
  'popup',
  'inputArgs',
  'data',
  'value',
  'namePath',
  'disabled',
  'readOnly',
  'dayjs',
  'libs',
]);

function createProfile({
  model,
  aliases,
  scene,
  contract,
  defaultContextShape,
  enforceCtxQualifiedAccess = false,
  requireExplicitCtxRender = false,
  topLevelAliases = [],
  strictAllowedTopLevelAliases = [],
  simulatedCompatCalls = [],
}) {
  const defaultTopLevelAliases = enforceCtxQualifiedAccess
    ? unique(['ctx', ...strictAllowedTopLevelAliases])
    : [
        'ctx',
        'dayjs',
        't',
        'render',
        'request',
        'getVar',
        'getVarInfos',
        ...topLevelAliases,
      ];
  return {
    compatProfileVersion: COMPAT_PROFILE_VERSION,
    model,
    aliases,
    scene,
    contract,
    defaultContextShape,
    enforceCtxQualifiedAccess,
    requireExplicitCtxRender,
    sideEffectPolicy: {
      httpRead: true,
      httpWrite: false,
      importAsync: false,
      requireAsync: false,
      loadCSS: false,
      navigation: false,
      popup: false,
    },
    topLevelAliases: unique(defaultTopLevelAliases),
    strictAllowedTopLevelAliases: unique(strictAllowedTopLevelAliases),
    simulatedCompatCalls: unique(simulatedCompatCalls),
  };
}

const PROFILES = [
  createProfile({
    model: 'JSBlockModel',
    aliases: ['jsBlock', 'block'],
    scene: 'block',
    contract: {
      ...BASE_CONTRACT,
      record: valueDoc('Current record object.', 'object'),
      resource: RESOURCE_CONTRACT,
      collection: COLLECTION_CONTRACT,
    },
    defaultContextShape: {
      record: { id: 1, nickname: 'Alice', status: 'active' },
      resource: { dataSourceKey: 'main', collectionName: 'users', selectedRows: [] },
      collection: { dataSourceKey: 'main', name: 'users', title: 'Users' },
      inputArgs: {},
    },
    enforceCtxQualifiedAccess: true,
    requireExplicitCtxRender: true,
    topLevelAliases: ['record', 'resource', 'collection'],
  }),
  createProfile({
    model: 'ChartOptionModel',
    aliases: ['chartOption', 'chart-option'],
    scene: 'chart',
    contract: {
      ...BASE_CONTRACT,
      data: CHART_DATA_CONTRACT,
      record: valueDoc('Current record object.', 'object'),
      collection: COLLECTION_CONTRACT,
      resource: RESOURCE_CONTRACT,
    },
    defaultContextShape: {
      data: {
        objects: [
          { department: 'Sales', employeeCount: 12 },
          { department: 'Engineering', employeeCount: 18 },
        ],
        raw: [
          { department: 'Sales', employeeCount: 12 },
          { department: 'Engineering', employeeCount: 18 },
        ],
        meta: {},
      },
      record: { id: 1, nickname: 'Alice', status: 'active' },
      resource: { dataSourceKey: 'main', collectionName: 'employees', selectedRows: [] },
      collection: { dataSourceKey: 'main', name: 'employees', title: 'Employees' },
      inputArgs: {},
    },
    enforceCtxQualifiedAccess: true,
    topLevelAliases: ['data', 'record', 'resource', 'collection'],
  }),
  createProfile({
    model: 'JSFieldModel',
    aliases: ['jsField', 'detailField', 'displayField'],
    scene: 'detail',
    contract: {
      ...BASE_CONTRACT,
      value: valueDoc('Current display value.', 'any'),
      record: valueDoc('Current record object.', 'object'),
      resource: RESOURCE_CONTRACT,
      collection: COLLECTION_CONTRACT,
      collectionField: COLLECTION_FIELD_CONTRACT,
    },
    defaultContextShape: {
      value: 'Alice',
      record: { id: 1, nickname: 'Alice', status: 'active' },
      resource: { dataSourceKey: 'main', collectionName: 'users', selectedRows: [] },
      collection: { dataSourceKey: 'main', name: 'users', title: 'Users' },
      collectionField: { name: 'nickname', title: 'Nickname', interface: 'input', type: 'string' },
      inputArgs: {},
    },
    enforceCtxQualifiedAccess: true,
    requireExplicitCtxRender: true,
    topLevelAliases: ['record', 'value', 'resource', 'collection', 'collectionField'],
  }),
  createProfile({
    model: 'JSEditableFieldModel',
    aliases: ['jsEditableField', 'editableField'],
    scene: 'form',
    contract: {
      ...BASE_CONTRACT,
      value: valueDoc('Current field value.', 'any'),
      record: valueDoc('Current record object.', 'object'),
      formValues: valueDoc('Current form values.', 'object'),
      form: FORM_CONTRACT,
      resource: RESOURCE_CONTRACT,
      collection: COLLECTION_CONTRACT,
      collectionField: COLLECTION_FIELD_CONTRACT,
      namePath: valueDoc('Current field namePath.', 'array'),
      disabled: valueDoc('Current disabled flag.', 'boolean'),
      readOnly: valueDoc('Current readOnly flag.', 'boolean'),
      getValue: functionDoc('Read the current field value.'),
      setValue: functionDoc('Update the current field value in memory.'),
    },
    defaultContextShape: {
      value: 'Alice',
      record: { id: 1, nickname: 'Alice', status: 'active' },
      formValues: { nickname: 'Alice', status: 'active' },
      resource: { dataSourceKey: 'main', collectionName: 'users', selectedRows: [] },
      collection: { dataSourceKey: 'main', name: 'users', title: 'Users' },
      collectionField: { name: 'nickname', title: 'Nickname', interface: 'input', type: 'string' },
      namePath: ['nickname'],
      disabled: false,
      readOnly: false,
      inputArgs: {},
    },
    enforceCtxQualifiedAccess: true,
    requireExplicitCtxRender: true,
    topLevelAliases: [
      'record',
      'value',
      'formValues',
      'form',
      'resource',
      'collection',
      'collectionField',
      'namePath',
      'disabled',
      'readOnly',
      'getValue',
      'setValue',
    ],
  }),
  createProfile({
    model: 'JSItemModel',
    aliases: ['jsItem', 'formItem'],
    scene: 'form',
    contract: {
      ...BASE_CONTRACT,
      record: valueDoc('Current record object.', 'object'),
      formValues: valueDoc('Current form values.', 'object'),
      form: FORM_CONTRACT,
      resource: RESOURCE_CONTRACT,
      collection: COLLECTION_CONTRACT,
    },
    defaultContextShape: {
      record: { id: 1, nickname: 'Alice', status: 'active' },
      formValues: { nickname: 'Alice', status: 'active' },
      resource: { dataSourceKey: 'main', collectionName: 'users', selectedRows: [] },
      collection: { dataSourceKey: 'main', name: 'users', title: 'Users' },
      inputArgs: {},
    },
    enforceCtxQualifiedAccess: true,
    requireExplicitCtxRender: true,
    topLevelAliases: ['record', 'formValues', 'form', 'resource', 'collection'],
  }),
  createProfile({
    model: 'FormJSFieldItemModel',
    aliases: ['formJsFieldItem', 'inlineFormField'],
    scene: 'form',
    contract: {
      ...BASE_CONTRACT,
      record: valueDoc('Current record object.', 'object'),
      formValues: valueDoc('Current form values.', 'object'),
      form: FORM_CONTRACT,
      resource: RESOURCE_CONTRACT,
      collection: COLLECTION_CONTRACT,
      setProps: functionDoc('Update simulated props on the current mock field item.'),
    },
    defaultContextShape: {
      record: { id: 1, nickname: 'Alice', status: 'active' },
      formValues: { nickname: 'Alice', status: 'active' },
      resource: { dataSourceKey: 'main', collectionName: 'users', selectedRows: [] },
      collection: { dataSourceKey: 'main', name: 'users', title: 'Users' },
      inputArgs: {},
    },
    enforceCtxQualifiedAccess: true,
    requireExplicitCtxRender: true,
    topLevelAliases: ['record', 'formValues', 'form', 'resource', 'collection', 'setProps'],
  }),
  createProfile({
    model: 'JSColumnModel',
    aliases: ['jsColumn', 'column'],
    scene: 'table',
    contract: {
      ...BASE_CONTRACT,
      record: valueDoc('Current row record.', 'object'),
      recordIndex: valueDoc('Current row index.', 'number'),
      resource: RESOURCE_CONTRACT,
      collection: COLLECTION_CONTRACT,
      selectedRows: valueDoc('Selected rows.', 'array'),
    },
    defaultContextShape: {
      record: { id: 1, nickname: 'Alice', status: 'active' },
      recordIndex: 0,
      selectedRows: [{ id: 1, nickname: 'Alice' }],
      resource: { dataSourceKey: 'main', collectionName: 'users', selectedRows: [{ id: 1, nickname: 'Alice' }] },
      collection: { dataSourceKey: 'main', name: 'users', title: 'Users' },
      inputArgs: {},
    },
    enforceCtxQualifiedAccess: true,
    requireExplicitCtxRender: true,
    topLevelAliases: ['record', 'recordIndex', 'selectedRows', 'resource', 'collection'],
  }),
  createProfile({
    model: 'JSItemActionModel',
    aliases: ['jsItemAction', 'itemAction'],
    scene: 'action',
    contract: {
      ...BASE_CONTRACT,
      record: valueDoc('Current record object.', 'object'),
      formValues: valueDoc('Current form values.', 'object'),
      form: FORM_CONTRACT,
      resource: RESOURCE_CONTRACT,
      collection: COLLECTION_CONTRACT,
    },
    defaultContextShape: {
      record: { id: 1, nickname: 'Alice', status: 'active' },
      formValues: { nickname: 'Alice' },
      resource: { dataSourceKey: 'main', collectionName: 'users', selectedRows: [] },
      collection: { dataSourceKey: 'main', name: 'users', title: 'Users' },
      inputArgs: {},
    },
    topLevelAliases: ['record', 'formValues', 'form', 'resource', 'collection'],
  }),
  createProfile({
    model: 'JSRecordActionModel',
    aliases: ['jsRecordAction', 'recordAction'],
    scene: 'action',
    contract: {
      ...BASE_CONTRACT,
      record: valueDoc('Current record object.', 'object'),
      resource: RESOURCE_CONTRACT,
      collection: COLLECTION_CONTRACT,
    },
    defaultContextShape: {
      record: { id: 1, nickname: 'Alice', status: 'active' },
      resource: { dataSourceKey: 'main', collectionName: 'users', selectedRows: [] },
      collection: { dataSourceKey: 'main', name: 'users', title: 'Users' },
      inputArgs: {},
    },
    topLevelAliases: ['record', 'resource', 'collection'],
  }),
  createProfile({
    model: 'JSCollectionActionModel',
    aliases: ['jsCollectionAction', 'collectionAction'],
    scene: 'action',
    contract: {
      ...BASE_CONTRACT,
      selectedRows: valueDoc('Current selected rows.', 'array'),
      resource: RESOURCE_CONTRACT,
      collection: COLLECTION_CONTRACT,
    },
    defaultContextShape: {
      selectedRows: [{ id: 1, nickname: 'Alice' }],
      resource: { dataSourceKey: 'main', collectionName: 'users', selectedRows: [{ id: 1, nickname: 'Alice' }] },
      collection: { dataSourceKey: 'main', name: 'users', title: 'Users' },
      inputArgs: {},
    },
    topLevelAliases: ['selectedRows', 'resource', 'collection'],
  }),
  createProfile({
    model: 'JSFormActionModel',
    aliases: ['jsFormAction', 'formAction'],
    scene: 'action',
    contract: {
      ...BASE_CONTRACT,
      record: valueDoc('Current record object.', 'object'),
      formValues: valueDoc('Current form values.', 'object'),
      form: FORM_CONTRACT,
      resource: RESOURCE_CONTRACT,
      collection: COLLECTION_CONTRACT,
    },
    defaultContextShape: {
      record: { id: 1, nickname: 'Alice', status: 'active' },
      formValues: { nickname: 'Alice', status: 'active' },
      resource: { dataSourceKey: 'main', collectionName: 'users', selectedRows: [] },
      collection: { dataSourceKey: 'main', name: 'users', title: 'Users' },
      inputArgs: {},
    },
    topLevelAliases: ['record', 'formValues', 'form', 'resource', 'collection'],
  }),
  createProfile({
    model: 'FilterFormJSActionModel',
    aliases: ['filterFormJsAction', 'filterAction'],
    scene: 'action',
    contract: {
      ...BASE_CONTRACT,
      formValues: valueDoc('Current filter form values.', 'object'),
      form: FORM_CONTRACT,
      resource: RESOURCE_CONTRACT,
      collection: COLLECTION_CONTRACT,
    },
    defaultContextShape: {
      formValues: { keyword: 'Alice', status: 'active' },
      resource: { dataSourceKey: 'main', collectionName: 'users', selectedRows: [] },
      collection: { dataSourceKey: 'main', name: 'users', title: 'Users' },
      inputArgs: {},
    },
    topLevelAliases: ['formValues', 'form', 'resource', 'collection'],
  }),
  createProfile({
    model: 'JSActionModel',
    aliases: ['jsAction', 'genericAction'],
    scene: 'action',
    contract: {
      ...BASE_CONTRACT,
      resource: RESOURCE_CONTRACT,
      collection: COLLECTION_CONTRACT,
    },
    defaultContextShape: {
      resource: { dataSourceKey: 'main', collectionName: 'users', selectedRows: [] },
      collection: { dataSourceKey: 'main', name: 'users', title: 'Users' },
      inputArgs: {},
    },
    topLevelAliases: ['resource', 'collection'],
  }),
  createProfile({
    model: 'ChartEventsModel',
    aliases: ['chartEvents', 'chart-events'],
    scene: 'chart',
    contract: {
      ...BASE_CONTRACT,
      chart: CHART_INSTANCE_CONTRACT,
      data: CHART_DATA_CONTRACT,
      record: valueDoc('Current record object.', 'object'),
      collection: COLLECTION_CONTRACT,
      resource: RESOURCE_CONTRACT,
    },
    defaultContextShape: {
      chart: {},
      data: {
        objects: [{ department: 'Sales', employeeCount: 12 }],
        raw: [{ department: 'Sales', employeeCount: 12 }],
        meta: {},
      },
      record: { id: 1, nickname: 'Alice', status: 'active' },
      resource: { dataSourceKey: 'main', collectionName: 'employees', selectedRows: [] },
      collection: { dataSourceKey: 'main', name: 'employees', title: 'Employees' },
      inputArgs: {},
    },
    enforceCtxQualifiedAccess: true,
    strictAllowedTopLevelAliases: ['chart'],
    simulatedCompatCalls: ['openView'],
  }),
];

function flattenContract(contract, prefix = '', output = {}) {
  for (const [key, value] of Object.entries(contract || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    output[path] = {
      type: value.type,
      description: value.description,
    };
    if (value.children) flattenContract(value.children, path, output);
  }
  return output;
}

function getRootBehavior(root) {
  if (PRECISE_ROOTS.has(root)) return 'precise';
  if (OPAQUE_ROOTS.has(root)) return 'opaque';
  return 'strict';
}

function buildRootBehaviors(profile) {
  return Object.fromEntries(Object.keys(profile.contract || {}).map((key) => [key, getRootBehavior(key)]));
}

export function findProfile(name) {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) return null;
  return (
    PROFILES.find((profile) => profile.model.toLowerCase() === normalized) ||
    PROFILES.find((profile) => profile.aliases.some((alias) => alias.toLowerCase() === normalized)) ||
    null
  );
}

export function describeProfile(name) {
  const profile = typeof name === 'string' ? findProfile(name) : name;
  if (!profile) return null;
  return {
    compatProfileVersion: profile.compatProfileVersion,
    model: profile.model,
    aliases: [...profile.aliases],
    scene: profile.scene,
    availableContextKeys: Object.keys(profile.contract),
    topLevelAliases: [...profile.topLevelAliases],
    strictAllowedTopLevelAliases: [...(profile.strictAllowedTopLevelAliases || [])],
    enforceCtxQualifiedAccess: Boolean(profile.enforceCtxQualifiedAccess),
    requireExplicitCtxRender: Boolean(profile.requireExplicitCtxRender),
    sideEffectPolicy: { ...profile.sideEffectPolicy },
    simulatedCompatCalls: [...(profile.simulatedCompatCalls || [])],
    defaultContextShape: profile.defaultContextShape,
    contract: profile.contract,
    rootBehaviors: buildRootBehaviors(profile),
    flattenedContract: flattenContract(profile.contract),
  };
}

export function getAllowedContextPaths(profile) {
  return Object.keys(describeProfile(profile).flattenedContract);
}

export function getRootBehaviors(profile) {
  return { ...describeProfile(profile).rootBehaviors };
}

export function getFlattenedContract(profile) {
  return { ...describeProfile(profile).flattenedContract };
}
