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

const ELEMENT_CONTRACT = objectDoc('Preview container ElementProxy.', {
  append: functionDoc('Append values into the preview container.'),
  replaceChildren: functionDoc('Replace values in the preview container.'),
  querySelector: functionDoc('Unsupported deterministic selector probe.'),
  querySelectorAll: functionDoc('Unsupported deterministic selector probe.'),
  addEventListener: functionDoc('Attach one event listener.'),
  removeEventListener: functionDoc('Detach one event listener.'),
  dispatchEvent: functionDoc('Dispatch one DOM-like event.'),
  innerHTML: valueDoc('Preview container inner HTML.', 'string'),
  textContent: valueDoc('Preview container text content.', 'string'),
});

const BASE_CONTRACT = {
  t: functionDoc('Translate text. This runtime returns the key with {{var}} interpolation.'),
  render: functionDoc(
    'Render one HTML string or structured value into the preview container. JSX, React elements, and DOM node preview are unsupported.',
  ),
  request: functionDoc('HTTP read helper. Only GET/HEAD are allowed.'),
  api: objectDoc('API helper namespace.', {
    request: functionDoc('Same behavior as ctx.request.'),
  }),
  fetch: functionDoc('HTTP read helper. Only GET/HEAD are allowed.'),
  getVar: functionDoc('Resolve one ctx.* path from the current mock context.'),
  getVarInfos: functionDoc('Inspect available keys under the current mock context.'),
  importAsync: functionDoc('Blocked in this runtime.'),
  requireAsync: functionDoc('Blocked in this runtime.'),
  loadCSS: functionDoc('Blocked in this runtime.'),
  dayjs: functionDoc('Minimal dayjs-compatible helper.'),
  libs: objectDoc('Shared library namespace.', {
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

const PRECISE_ROOTS = new Set(['api', 'form', 'viewer', 'message', 'notification', 'modal', 'element', 'libs']);
const OPAQUE_ROOTS = new Set([
  'record',
  'formValues',
  'selectedRows',
  'resource',
  'collection',
  'collectionField',
  'popup',
  'inputArgs',
  'value',
  'namePath',
  'disabled',
  'readOnly',
  'dayjs',
]);

function createProfile({
  model,
  aliases,
  scene,
  contract,
  defaultContextShape,
  previewCapabilities,
  enforceCtxQualifiedAccess = false,
  requireExplicitCtxRender = false,
  topLevelAliases = [],
}) {
  const defaultTopLevelAliases = enforceCtxQualifiedAccess
    ? ['ctx']
    : [
        'ctx',
        'dayjs',
        't',
        'render',
        'request',
        'fetch',
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
    previewCapabilities,
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
    previewCapabilities: { html: true, react: false, dom: false, text: true },
    enforceCtxQualifiedAccess: true,
    requireExplicitCtxRender: true,
    topLevelAliases: ['record', 'resource', 'collection'],
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
    previewCapabilities: { html: true, react: false, dom: false, text: true },
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
    previewCapabilities: { html: true, react: false, dom: false, text: true },
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
    previewCapabilities: { html: true, react: false, dom: false, text: true },
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
      setProps: functionDoc('Update preview-only props on the current mock field item.'),
    },
    defaultContextShape: {
      record: { id: 1, nickname: 'Alice', status: 'active' },
      formValues: { nickname: 'Alice', status: 'active' },
      resource: { dataSourceKey: 'main', collectionName: 'users', selectedRows: [] },
      collection: { dataSourceKey: 'main', name: 'users', title: 'Users' },
      inputArgs: {},
    },
    previewCapabilities: { html: true, react: false, dom: false, text: true },
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
    previewCapabilities: { html: true, react: false, dom: false, text: true },
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
    previewCapabilities: { html: true, react: false, dom: false, text: true },
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
    previewCapabilities: { html: true, react: false, dom: false, text: true },
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
    previewCapabilities: { html: true, react: false, dom: false, text: true },
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
    previewCapabilities: { html: true, react: false, dom: false, text: true },
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
    previewCapabilities: { html: true, react: false, dom: false, text: true },
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
    previewCapabilities: { html: true, react: false, dom: false, text: true },
    topLevelAliases: ['resource', 'collection'],
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

export function listProfiles() {
  return PROFILES.map((profile) => ({
    model: profile.model,
    aliases: [...profile.aliases],
    scene: profile.scene,
    compatProfileVersion: profile.compatProfileVersion,
  }));
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
    previewCapabilities: { ...profile.previewCapabilities },
    enforceCtxQualifiedAccess: Boolean(profile.enforceCtxQualifiedAccess),
    requireExplicitCtxRender: Boolean(profile.requireExplicitCtxRender),
    sideEffectPolicy: { ...profile.sideEffectPolicy },
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
