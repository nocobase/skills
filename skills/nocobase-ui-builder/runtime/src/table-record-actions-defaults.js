import { hasTemplateDocument } from './popup-contract.js';

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

export function isTableRecordActionsDefaultTarget(block, options = {}) {
  if (!isObjectRecord(block)) return false;
  if (normalizeText(block.type) !== 'table') return false;
  if (!hasResourceBinding(block, options) || hasTemplateDocument(block.template)) return false;
  if (Object.hasOwn(block, 'recordActions')) return false;
  return !EXCLUDED_TABLE_USES.has(normalizeText(block.use));
}

export function materializeDefaultTableRecordActions(block, options = {}) {
  if (!isTableRecordActionsDefaultTarget(block, options)) return block;
  return {
    ...block,
    recordActions: DEFAULT_TABLE_RECORD_ACTIONS.map((action) => ({ ...action })),
  };
}
