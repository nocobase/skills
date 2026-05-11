import { hasTemplateDocument } from './popup-contract.js';

const DEFAULT_TABLE_ACTIONS = [
  { type: 'filter' },
  { type: 'refresh' },
  { type: 'bulkDelete' },
  { type: 'addNew' },
];
const DEFAULT_TABLE_RECORD_ACTIONS = [{ type: 'view' }, { type: 'edit' }, { type: 'delete' }];
const EXCLUDED_TABLE_USES = new Set([
  'TableSelectModel',
  'PopupSubTableFieldModel',
  'PopupSubTableActionsColumnModel',
]);

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasResourceBinding(block, { hasExplicitResourceBinding } = {}) {
  if (!isObjectRecord(block)) return false;
  if (hasExplicitResourceBinding) return true;
  if (isObjectRecord(block.resource) && Object.keys(block.resource).length > 0) {
    return true;
  }
  return Boolean(
    normalizeText(block.collection)
    || normalizeText(block.binding)
    || normalizeText(block.dataSourceKey)
    || normalizeText(block.associationPathName)
    || normalizeText(block.associationField),
  );
}

function isTableDefaultActionTarget(block, options = {}) {
  if (!isObjectRecord(block)) return false;
  if (normalizeText(block.type) !== 'table') return false;
  if (!hasResourceBinding(block, options) || hasTemplateDocument(block.template)) return false;
  return !EXCLUDED_TABLE_USES.has(normalizeText(block.use));
}

function getActionType(action) {
  if (typeof action === 'string') return normalizeText(action);
  return normalizeText(action?.type);
}

function cloneAction(action) {
  return isObjectRecord(action) ? { ...action } : action;
}

function mergeDefaultActionList(existing, defaults) {
  const existingList = Array.isArray(existing) ? existing : [];
  const defaultTypes = new Set(defaults.map((action) => action.type));
  const explicitByType = new Map();
  const extras = [];

  for (const item of existingList) {
    const type = getActionType(item);
    if (type && defaultTypes.has(type) && !explicitByType.has(type)) {
      explicitByType.set(type, item);
      continue;
    }
    extras.push(item);
  }

  return [
    ...defaults.map((action) => cloneAction(explicitByType.get(action.type) || action)),
    ...extras.map(cloneAction),
  ];
}

export function isTableRecordActionsDefaultTarget(block, options = {}) {
  return isTableDefaultActionTarget(block, options);
}

export function materializeDefaultTableActions(block, options = {}) {
  if (!isTableDefaultActionTarget(block, options)) return block;
  return {
    ...block,
    actions: mergeDefaultActionList(block.actions, DEFAULT_TABLE_ACTIONS),
  };
}

export function materializeDefaultTableRecordActions(block, options = {}) {
  if (!isTableRecordActionsDefaultTarget(block, options)) return block;
  return {
    ...block,
    recordActions: mergeDefaultActionList(block.recordActions, DEFAULT_TABLE_RECORD_ACTIONS),
  };
}

export function materializeDefaultTableActionGroups(block, options = {}) {
  const withActions = materializeDefaultTableActions(block, options);
  return materializeDefaultTableRecordActions(withActions, options);
}
