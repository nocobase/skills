#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PAGE_MODEL_USES_SET,
  PAGE_TAB_USES,
  SUPPORTED_POPUP_PAGE_USES,
  SUPPORTED_POPUP_PAGE_USES_SET,
  getAllowedTabUsesForPage as getAllowedTabUsesForPageFromContracts,
  normalizePageUse,
} from './model_contracts.mjs';

export const GENERAL_MODE = 'general';
export const VALIDATION_CASE_MODE = 'validation-case';
export const DEFAULT_AUDIT_MODE = VALIDATION_CASE_MODE;
export const BLOCKER_EXIT_CODE = 2;

const NON_RISK_ACCEPTABLE_BLOCKER_CODES = new Set([
  'ASSOCIATION_CONTEXT_REQUIRES_VERIFIED_RESOURCE',
  'DOTTED_ASSOCIATION_DISPLAY_ASSOCIATION_PATH_MISMATCH',
  'DOTTED_ASSOCIATION_DISPLAY_MISSING_ASSOCIATION_PATH',
  'ASSOCIATION_FIELD_REQUIRES_EXPLICIT_DISPLAY_MODEL',
  'ASSOCIATION_SPLIT_DISPLAY_BINDING_UNSTABLE',
  'BELONGS_TO_FILTER_REQUIRES_SCALAR_PATH',
  'EMPTY_DETAILS_BLOCK',
  'FORM_ACTION_MUST_USE_ACTIONS_SLOT',
  'FORM_ITEM_FIELD_SUBMODEL_MISSING',
  'FORM_SUBMIT_ACTION_MISSING',
  'TABLE_COLLECTION_ACTION_SLOT_USE_INVALID',
  'TABLE_RECORD_ACTION_SLOT_USE_INVALID',
  'DETAILS_ACTION_SLOT_USE_INVALID',
  'FILTER_FORM_ACTION_SLOT_USE_INVALID',
  'POPUP_PAGE_USE_INVALID',
  'POPUP_PAGE_USE_MISMATCH',
  'TAB_SLOT_USE_INVALID',
  'TAB_GRID_MISSING_OR_INVALID',
  'TAB_GRID_ITEM_USE_INVALID',
  'TAB_SUBTREE_UID_REUSED',
  'REQUIRED_VISIBLE_TABS_MISSING',
  'REQUIRED_TABS_TARGET_PAGE_MISSING',
]);

const POPUP_INPUT_ARGS_FILTER_BY_TK = '{{ctx.view.inputArgs.filterByTk}}';

const PAGE_TAB_MODEL_USES = new Set(PAGE_TAB_USES);
const GRID_MODEL_USES = new Set(['BlockGridModel', 'FormGridModel']);
const BUSINESS_BLOCK_MODEL_USES = new Set([
  'FilterFormBlockModel',
  'TableBlockModel',
  'DetailsBlockModel',
  'CreateFormModel',
  'EditFormModel',
]);
const FORM_BLOCK_MODEL_USES = new Set(['CreateFormModel', 'EditFormModel']);
const FORM_BLOCK_ACTION_MODEL_USES = new Set(['FormSubmitActionModel', 'JSFormActionModel']);
const COLLECTION_ACTION_MODEL_USES = new Set([
  'AddNewActionModel',
  'BulkDeleteActionModel',
  'ExpandCollapseActionModel',
  'FilterActionModel',
  'JSCollectionActionModel',
  'LinkActionModel',
  'PopupCollectionActionModel',
  'RefreshActionModel',
]);
const RECORD_ACTION_MODEL_USES = new Set([
  'AddChildActionModel',
  'DeleteActionModel',
  'EditActionModel',
  'JSRecordActionModel',
  'LinkActionModel',
  'PopupCollectionActionModel',
  'UpdateRecordActionModel',
  'ViewActionModel',
]);
const FILTER_FORM_ACTION_MODEL_USES = new Set([
  'FilterFormSubmitActionModel',
  'FilterFormResetActionModel',
  'FilterFormCollapseActionModel',
  'FilterFormJSActionModel',
]);
const ACTION_HOST_MODEL_USES = new Set(['TableBlockModel', 'DetailsBlockModel']);
const EDIT_FORM_MODEL_USES = new Set(['EditFormModel']);
const CREATE_FORM_MODEL_USES = new Set(['CreateFormModel']);
const FILTER_CONTAINER_MODEL_USES = new Set(['TableBlockModel', 'DetailsBlockModel', 'CreateFormModel', 'EditFormModel']);
const FIELD_MODELS_REQUIRING_ASSOCIATION_TARGET = new Set([
  'TableColumnModel',
  'FilterFormItemModel',
  'FormItemModel',
  'DetailsItemModel',
  'DisplayTextFieldModel',
  'FilterFormRecordSelectFieldModel',
]);
const DIRECT_ASSOCIATION_TEXT_FIELD_MODEL_USES = new Set(['DisplayTextFieldModel']);
const DETAILS_LAYOUT_ONLY_MODEL_USES = new Set(['DetailsGridModel', 'BlockGridModel', 'FormGridModel']);
const INVALID_VISIBLE_TAB_ITEM_MODEL_USES = new Set([
  'RootPageModel',
  'PageModel',
  'ChildPageModel',
  'RootPageTabModel',
  'PageTabModel',
  'ChildPageTabModel',
  'BlockGridModel',
  'FormGridModel',
]);

function usage() {
  return [
    'Usage:',
    '  node scripts/flow_payload_guard.mjs build-filter (--condition-json <json> | --path <path> --operator <op> --value-json <json>) [--logic <$and|$or>]',
    '  node scripts/flow_payload_guard.mjs extract-required-metadata (--payload-json <json> | --payload-file <path>)',
    '  node scripts/flow_payload_guard.mjs audit-payload (--payload-json <json> | --payload-file <path>) (--metadata-json <json> | --metadata-file <path>) [--mode general|validation-case] [(--requirements-json <json> | --requirements-file <path>)] [--risk-accept <CODE>]',
    '',
    `Default audit mode: ${DEFAULT_AUDIT_MODE}`,
  ].join('\n');
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function normalizeNonEmpty(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} must not be empty`);
  }
  return normalized;
}

function parseJson(rawValue, label) {
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function readJsonInput(jsonValue, filePath, label) {
  if (jsonValue) {
    return parseJson(jsonValue, label);
  }
  if (filePath) {
    const resolvedPath = path.resolve(filePath);
    return parseJson(fs.readFileSync(resolvedPath, 'utf8'), `${label} file`);
  }
  throw new Error(`${label} input is required`);
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help') {
    return { command: 'help', flags: {} };
  }
  const [command, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument "${token}"`);
    }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
      continue;
    }
    if (key === 'risk-accept') {
      const values = Array.isArray(flags[key]) ? flags[key] : [];
      values.push(next);
      flags[key] = values;
    } else {
      flags[key] = next;
    }
    index += 1;
  }
  return { command, flags };
}

function joinPath(basePath, segment) {
  if (segment === '') {
    return basePath;
  }
  if (typeof segment === 'number') {
    return `${basePath}[${segment}]`;
  }
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
    return `${basePath}.${segment}`;
  }
  return `${basePath}[${JSON.stringify(segment)}]`;
}

function walk(value, visitor, pathValue = '$', context = {}) {
  const nextContext = buildContext(value, context);
  visitor(value, pathValue, nextContext);

  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, joinPath(pathValue, index), nextContext));
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    walk(child, visitor, joinPath(pathValue, key), nextContext);
  }
}

function buildContext(node, parentContext) {
  const context = {
    ...parentContext,
  };
  if (!isPlainObject(node)) {
    return context;
  }

  const use = typeof node.use === 'string' ? node.use : parentContext.use;
  const resourceCollectionName = node.stepParams?.resourceSettings?.init?.collectionName || parentContext.resourceCollectionName;
  const fieldInit = node.stepParams?.fieldSettings?.init;
  const fieldBinding = parentContext.fieldBinding ? { ...parentContext.fieldBinding } : null;
  if (fieldInit?.fieldPath) {
    context.fieldBinding = {
      collectionName: fieldInit.collectionName || resourceCollectionName || fieldBinding?.collectionName,
      fieldPath: fieldInit.fieldPath,
      associationPathName: fieldInit.associationPathName || fieldBinding?.associationPathName || null,
      path: fieldInit.path,
      sourceUse: use,
    };
  } else if (fieldBinding) {
    context.fieldBinding = fieldBinding;
  } else {
    context.fieldBinding = null;
  }
  context.use = use;
  context.resourceCollectionName = resourceCollectionName;
  return context;
}

function normalizeFilterLogic(logic) {
  const normalized = logic || '$and';
  if (normalized !== '$and' && normalized !== '$or') {
    throw new Error(`Unsupported filter logic "${normalized}"`);
  }
  return normalized;
}

function createUnsupportedFilterLogicFinding({ path: findingPath, mode, logic }) {
  return createFinding({
    severity: 'blocker',
    code: 'FILTER_LOGIC_UNSUPPORTED',
    message: `filter logic "${logic}" 不受支持；只允许 "$and" 或 "$or"。`,
    path: findingPath,
    mode,
    details: {
      logic,
    },
  });
}

function normalizeRequirementKind(value, label) {
  return normalizeNonEmpty(value, label).toLowerCase();
}

function normalizeRequiredActionScope(value, label) {
  const normalized = typeof value === 'string' && value.trim() ? value.trim() : 'either';
  if (
    normalized !== 'block-actions'
    && normalized !== 'row-actions'
    && normalized !== 'details-actions'
    && normalized !== 'either'
  ) {
    throw new Error(`${label} must be one of block-actions, row-actions, details-actions, either`);
  }
  return normalized;
}

function normalizeRequiredAction(entry, index) {
  if (!isPlainObject(entry)) {
    throw new Error(`requirements.requiredActions[${index}] must be an object`);
  }

  const kind = normalizeRequirementKind(entry.kind, `requirements.requiredActions[${index}].kind`);
  const collectionName = normalizeNonEmpty(
    entry.collectionName,
    `requirements.requiredActions[${index}].collectionName`,
  );
  const scope = normalizeRequiredActionScope(entry.scope, `requirements.requiredActions[${index}].scope`);

  if (
    kind !== 'create-popup'
    && kind !== 'view-record-popup'
    && kind !== 'edit-record-popup'
    && kind !== 'add-child-record-popup'
    && kind !== 'record-action'
  ) {
    throw new Error(`Unsupported required action kind "${kind}"`);
  }

  return {
    kind,
    collectionName,
    scope,
  };
}

function normalizeRequiredTab(entry, index) {
  if (!isPlainObject(entry)) {
    throw new Error(`requirements.requiredTabs[${index}] must be an object`);
  }

  const titles = Array.isArray(entry.titles)
    ? entry.titles
      .map((title, titleIndex) => normalizeNonEmpty(title, `requirements.requiredTabs[${index}].titles[${titleIndex}]`))
    : null;

  if (!titles || titles.length === 0) {
    throw new Error(`requirements.requiredTabs[${index}].titles must be a non-empty array`);
  }

  return {
    pageSignature: entry.pageSignature == null ? null : normalizeNonEmpty(entry.pageSignature, `requirements.requiredTabs[${index}].pageSignature`),
    pageUse: normalizePageUse(entry.pageUse, `requirements.requiredTabs[${index}].pageUse`, {
      allowNull: true,
    }),
    titles,
    requireBlockGrid: entry.requireBlockGrid !== false,
  };
}

function normalizeRequirements(rawRequirements = {}) {
  if (rawRequirements == null) {
    return {
      requiredActions: [],
      requiredTabs: [],
    };
  }
  if (!isPlainObject(rawRequirements)) {
    throw new Error('requirements must be an object');
  }

  const rawRequiredActions = rawRequirements.requiredActions;
  if (rawRequiredActions != null && !Array.isArray(rawRequiredActions)) {
    throw new Error('requirements.requiredActions must be an array');
  }

  const rawRequiredTabs = rawRequirements.requiredTabs;
  if (rawRequiredTabs != null && !Array.isArray(rawRequiredTabs)) {
    throw new Error('requirements.requiredTabs must be an array');
  }

  return {
    requiredActions: Array.isArray(rawRequiredActions)
      ? rawRequiredActions.map((entry, index) => normalizeRequiredAction(entry, index))
      : [],
    requiredTabs: Array.isArray(rawRequiredTabs)
      ? rawRequiredTabs.map((entry, index) => normalizeRequiredTab(entry, index))
      : [],
  };
}

export function buildFilterGroup({ logic = '$and', condition }) {
  const normalizedLogic = normalizeFilterLogic(logic);
  if (!isPlainObject(condition)) {
    throw new Error('condition must be an object');
  }
  const pathValue = normalizeNonEmpty(condition.path, 'condition.path');
  const operator = normalizeNonEmpty(condition.operator, 'condition.operator');
  return {
    filter: {
      logic: normalizedLogic,
      items: [
        {
          path: pathValue,
          operator,
          value: condition.value,
        },
      ],
    },
  };
}

function createFinding({ severity, code, message, path: findingPath, mode, accepted = false, details, dedupeKey }) {
  return {
    severity,
    code,
    message,
    path: findingPath,
    mode,
    accepted,
    details,
    dedupeKey: dedupeKey || `${code}:${findingPath}`,
  };
}

function pushFinding(target, seen, finding) {
  if (seen.has(finding.dedupeKey)) {
    return;
  }
  seen.add(finding.dedupeKey);
  const sanitized = { ...finding };
  delete sanitized.dedupeKey;
  target.push(sanitized);
}

function normalizeCollectionField(field) {
  if (!isPlainObject(field)) {
    return null;
  }
  const options = isPlainObject(field.options) ? field.options : {};
  const name = field.name || options.name;
  if (!name) {
    return null;
  }
  return {
    name,
    type: field.type || options.type,
    interface: field.interface || options.interface,
    target: field.target || options.target,
    foreignKey: field.foreignKey || options.foreignKey,
    targetKey: field.targetKey || options.targetKey,
  };
}

function normalizeMetadata(rawMetadata = {}) {
  const rawCollections = rawMetadata.collections;
  const collections = {};

  if (Array.isArray(rawCollections)) {
    for (const entry of rawCollections) {
      if (!isPlainObject(entry) || !entry.name) {
        continue;
      }
      collections[entry.name] = entry;
    }
  } else if (isPlainObject(rawCollections)) {
    Object.assign(collections, rawCollections);
  }

  const normalizedCollections = {};
  for (const [collectionName, rawCollection] of Object.entries(collections)) {
    const entry = isPlainObject(rawCollection) ? rawCollection : {};
    const options = isPlainObject(entry.options) ? entry.options : {};
    const fields = Array.isArray(entry.fields)
      ? entry.fields.map(normalizeCollectionField).filter(Boolean)
      : [];
    const fieldsByName = new Map(fields.map((field) => [field.name, field]));
    const associationsByForeignKey = new Map();
    for (const field of fields) {
      if (field.foreignKey && field.name !== field.foreignKey) {
        associationsByForeignKey.set(field.foreignKey, field);
      }
    }
    normalizedCollections[collectionName] = {
      name: collectionName,
      titleField: entry.titleField || options.titleField || null,
      filterTargetKey: entry.filterTargetKey || options.filterTargetKey || null,
      fields,
      fieldsByName,
      associationsByForeignKey,
    };
  }

  return {
    collections: normalizedCollections,
  };
}

function getCollectionMeta(metadata, collectionName) {
  if (!collectionName) {
    return null;
  }
  return metadata.collections[collectionName] || null;
}

function inspectRequiredMetadataCoverage(requiredMetadata, metadata, mode, blockers, seen) {
  for (const collectionRef of requiredMetadata.collectionRefs) {
    const collectionMeta = getCollectionMeta(metadata, collectionRef.collectionName);
    if (collectionMeta) {
      continue;
    }
    pushFinding(blockers, seen, createFinding({
      severity: 'blocker',
      code: 'REQUIRED_COLLECTION_METADATA_MISSING',
      message: `payload 依赖 collection "${collectionRef.collectionName}" 的元数据，但当前 metadata 未提供。`,
      path: collectionRef.path,
      mode,
      dedupeKey: `REQUIRED_COLLECTION_METADATA_MISSING:${collectionRef.collectionName}`,
      details: collectionRef,
    }));
  }
}

function isAssociationField(field) {
  if (!field) {
    return false;
  }
  return Boolean(
    field.target
      || field.foreignKey
      || field.type === 'belongsTo'
      || field.type === 'hasMany'
      || field.type === 'hasOne'
      || field.interface === 'm2o'
      || field.interface === 'o2m',
  );
}

function findAssociationFieldToTarget(collectionMeta, targetCollectionName) {
  if (!collectionMeta || !targetCollectionName) {
    return null;
  }
  return collectionMeta.fields.find((field) => isAssociationField(field) && field.target === targetCollectionName) || null;
}

function isBelongsToLikeField(field) {
  if (!field) {
    return false;
  }
  return field.type === 'belongsTo' || field.interface === 'm2o';
}

function isScalarComparisonOperator(operator) {
  return typeof operator === 'string' && operator !== '$exists' && operator !== '$notExists';
}

function getBelongsToScalarPathHints(field) {
  if (!isBelongsToLikeField(field)) {
    return null;
  }

  const foreignKey = typeof field.foreignKey === 'string' && field.foreignKey.trim()
    ? field.foreignKey.trim()
    : null;
  const targetKey = typeof field.targetKey === 'string' && field.targetKey.trim()
    ? field.targetKey.trim()
    : null;
  const suggestedPaths = [];
  if (foreignKey) {
    suggestedPaths.push(foreignKey);
  }
  if (targetKey) {
    suggestedPaths.push(`${field.name}.${targetKey}`);
  }

  return {
    associationField: field.name,
    foreignKey,
    targetCollection: field.target || null,
    targetKey,
    suggestedPaths: [...new Set(suggestedPaths)],
  };
}

function findAssociationFieldByAssociationName(collectionMeta, associationName) {
  if (!collectionMeta || typeof associationName !== 'string') {
    return null;
  }
  const normalized = associationName.trim();
  if (!normalized) {
    return null;
  }

  const directField = collectionMeta.fieldsByName.get(normalized);
  if (directField) {
    return directField;
  }

  const collectionPrefix = `${collectionMeta.name}.`;
  if (normalized.startsWith(collectionPrefix)) {
    return collectionMeta.fieldsByName.get(normalized.slice(collectionPrefix.length)) || null;
  }

  return null;
}

function resolveFieldPathInMetadata(metadata, collectionName, fieldPath) {
  if (!collectionName || typeof fieldPath !== 'string') {
    return null;
  }
  const segments = fieldPath
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  let currentCollection = getCollectionMeta(metadata, collectionName);
  if (!currentCollection) {
    return null;
  }

  let field = null;
  let previousAssociationField = null;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    field = currentCollection.fieldsByName.get(segment) || null;
    if (!field) {
      const expectedTargetKey = previousAssociationField?.targetKey;
      if (
        index === segments.length - 1
        && typeof expectedTargetKey === 'string'
        && expectedTargetKey.trim()
        && expectedTargetKey.trim() === segment
      ) {
        return {
          field: {
            name: segment,
            type: null,
            interface: null,
            target: null,
            foreignKey: null,
            targetKey: null,
          },
          collection: currentCollection,
        };
      }
      return null;
    }
    if (index === segments.length - 1) {
      return {
        field,
        collection: currentCollection,
      };
    }
    if (!field.target) {
      return null;
    }
    previousAssociationField = field;
    currentCollection = getCollectionMeta(metadata, field.target);
    if (!currentCollection) {
      return null;
    }
  }

  return null;
}

function getExpectedAssociationPathName(metadata, collectionName, fieldPath) {
  if (!collectionName || typeof fieldPath !== 'string') {
    return null;
  }
  const segments = fieldPath
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  let currentCollection = getCollectionMeta(metadata, collectionName);
  if (!currentCollection) {
    return null;
  }

  const associationSegments = [];
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const field = currentCollection.fieldsByName.get(segment) || null;
    if (!field || !isAssociationField(field) || !field.target) {
      return null;
    }
    associationSegments.push(segment);
    currentCollection = getCollectionMeta(metadata, field.target);
    if (!currentCollection) {
      return null;
    }
  }

  return associationSegments.join('.');
}

function collectFilterConditions(filter, results = []) {
  if (!isPlainObject(filter) || !Array.isArray(filter.items)) {
    return results;
  }
  for (const item of filter.items) {
    if (!isPlainObject(item)) {
      continue;
    }
    if (typeof item.path === 'string' && typeof item.operator === 'string') {
      results.push(item);
      continue;
    }
    if (typeof item.logic === 'string' && Array.isArray(item.items)) {
      collectFilterConditions(item, results);
    }
  }
  return results;
}

function usesPopupInputArgsFilterByTk(value) {
  return typeof value === 'string' && value.includes(POPUP_INPUT_ARGS_FILTER_BY_TK);
}

function isSimpleFieldName(value) {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function hasTemplateExpression(value) {
  return typeof value === 'string' && value.includes('{{');
}

function isHardcodedFilterValue(value) {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim();
  if (!normalized || hasTemplateExpression(normalized)) {
    return false;
  }
  return true;
}

function collectStrings(value, results = []) {
  if (typeof value === 'string') {
    results.push(value);
    return results;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, results));
    return results;
  }
  if (!isPlainObject(value)) {
    return results;
  }
  Object.values(value).forEach((item) => collectStrings(item, results));
  return results;
}

function countUses(value, useSet) {
  let count = 0;
  walk(value, (node) => {
    if (isPlainObject(node) && typeof node.use === 'string' && useSet.has(node.use)) {
      count += 1;
    }
  });
  return count;
}

function getAllowedTabUsesForPage(pageUse) {
  return new Set(getAllowedTabUsesForPageFromContracts(pageUse));
}

function getTabTitle(tabNode) {
  if (!isPlainObject(tabNode)) {
    return '';
  }
  const title = tabNode.stepParams?.pageTabSettings?.tab?.title;
  return typeof title === 'string' ? title.trim() : '';
}

function pushStructuralUidOccurrence(occurrences, uid, use, pathValue) {
  if (typeof uid !== 'string' || !uid.trim() || typeof use !== 'string' || !use.trim()) {
    return;
  }
  const normalizedUid = uid.trim();
  const list = occurrences.get(normalizedUid) ?? [];
  list.push({
    use,
    path: pathValue,
  });
  occurrences.set(normalizedUid, list);
}

function inspectActionSlotUses({
  hostNode,
  slotPath,
  allowedUses,
  code,
  message,
  mode,
  blockers,
  seen,
}) {
  const actions = Array.isArray(hostNode) ? hostNode : (Array.isArray(hostNode?.subModels?.actions) ? hostNode.subModels.actions : []);
  actions.forEach((actionNode, index) => {
    const actionUse = isPlainObject(actionNode) && typeof actionNode.use === 'string' ? actionNode.use.trim() : '';
    if (actionUse && allowedUses.has(actionUse)) {
      return;
    }
    pushFinding(blockers, seen, createFinding({
      severity: 'blocker',
      code,
      message,
      path: `${slotPath}[${index}]`,
      mode,
      dedupeKey: `${code}:${slotPath}:${index}:${actionUse || 'missing'}`,
      details: {
        hostUse: isPlainObject(hostNode) ? hostNode.use || null : null,
        actualUse: actionUse || null,
        allowedUses: [...allowedUses],
      },
    }));
  });
}

function subtreeReferencesCollection(node, collectionName) {
  let matched = false;
  walk(node, (child) => {
    if (!isPlainObject(child) || matched) {
      return;
    }
    const resourceCollectionName = child.stepParams?.resourceSettings?.init?.collectionName;
    const fieldCollectionName = child.stepParams?.fieldSettings?.init?.collectionName;
    if (resourceCollectionName === collectionName || fieldCollectionName === collectionName) {
      matched = true;
    }
  });
  return matched;
}

function hasPopupActionWithRequirements(actionNode, {
  collectionName,
  titlePattern,
  requireRecordContext,
  requiredFormUses,
  allowedActionUses,
}) {
  if (!isPlainObject(actionNode) || typeof actionNode.use !== 'string' || !allowedActionUses.has(actionNode.use)) {
    return false;
  }

  const openView = actionNode.stepParams?.popupSettings?.openView;
  const pageNode = actionNode.subModels?.page;
  const title = actionNode.stepParams?.buttonSettings?.general?.title || '';
  const strings = collectStrings(actionNode, []);
  const hasPopup = isPlainObject(openView) || isPlainObject(pageNode);
  const hasRecordContext = Boolean(openView?.filterByTk)
    || strings.some(
      (value) => typeof value === 'string'
        && (value.includes('{{ctx.record.id}}') || value.includes(POPUP_INPUT_ARGS_FILTER_BY_TK)),
    );
  const mentionsIntent = titlePattern.test(title)
    || titlePattern.test(actionNode.use)
    || strings.some((value) => typeof value === 'string' && titlePattern.test(value));
  const targetsCollection = openView?.collectionName === collectionName || subtreeReferencesCollection(pageNode, collectionName);
  const hasRequiredForm = requiredFormUses ? countUses(actionNode, requiredFormUses) > 0 : true;

  return hasPopup
    && (!requireRecordContext || hasRecordContext)
    && mentionsIntent
    && targetsCollection
    && hasRequiredForm;
}

function hasRequiredAction(actionNode, requirement, collectionName) {
  if (!isPlainObject(actionNode) || typeof actionNode.use !== 'string') {
    return false;
  }

  if (requirement.kind === 'edit-record-popup') {
    return hasPopupActionWithRequirements(actionNode, {
      collectionName,
      titlePattern: /(编辑订单项|编辑|edit)/i,
      requireRecordContext: true,
      requiredFormUses: EDIT_FORM_MODEL_USES,
      allowedActionUses: RECORD_ACTION_MODEL_USES,
    });
  }

  if (requirement.kind === 'view-record-popup') {
    return hasPopupActionWithRequirements(actionNode, {
      collectionName,
      titlePattern: /(查看|详情|view)/i,
      requireRecordContext: true,
      requiredFormUses: null,
      allowedActionUses: RECORD_ACTION_MODEL_USES,
    }) && countUses(actionNode, BUSINESS_BLOCK_MODEL_USES) > 0;
  }

  if (requirement.kind === 'create-popup') {
    return hasPopupActionWithRequirements(actionNode, {
      collectionName,
      titlePattern: /(新建|创建|添加|登记|create|add)/i,
      requireRecordContext: false,
      requiredFormUses: CREATE_FORM_MODEL_USES,
      allowedActionUses: COLLECTION_ACTION_MODEL_USES,
    });
  }

  if (requirement.kind === 'add-child-record-popup') {
    return hasPopupActionWithRequirements(actionNode, {
      collectionName,
      titlePattern: /(新增下级|下级|addchild|add child|child)/i,
      requireRecordContext: true,
      requiredFormUses: CREATE_FORM_MODEL_USES,
      allowedActionUses: RECORD_ACTION_MODEL_USES,
    });
  }

  if (requirement.kind === 'record-action') {
    return RECORD_ACTION_MODEL_USES.has(actionNode.use);
  }

  return false;
}

function findNestedRelationBlocks(pageNode, parentCollectionName) {
  const findings = [];
  function visit(node, pathValue, currentParentCollectionName) {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, joinPath(pathValue, index), currentParentCollectionName));
      return;
    }
    if (!isPlainObject(node)) {
      return;
    }

    const use = typeof node.use === 'string' ? node.use : '';
    const resourceCollectionName = node.stepParams?.resourceSettings?.init?.collectionName || currentParentCollectionName;
    const dataScopeFilter = node.stepParams?.tableSettings?.dataScope?.filter
      || node.stepParams?.detailsSettings?.dataScope?.filter
      || node.stepParams?.formSettings?.dataScope?.filter;
    if (
      FILTER_CONTAINER_MODEL_USES.has(use)
      && node.stepParams?.resourceSettings?.init?.collectionName
      && dataScopeFilter
      && Array.isArray(dataScopeFilter.items)
      && dataScopeFilter.items.length === 0
      && currentParentCollectionName
      && node.stepParams.resourceSettings.init.collectionName !== currentParentCollectionName
    ) {
      findings.push({
        path: pathValue,
        use,
        collectionName: node.stepParams.resourceSettings.init.collectionName,
        parentCollectionName: currentParentCollectionName,
      });
    }
    for (const [key, child] of Object.entries(node)) {
      visit(child, joinPath(pathValue, key), resourceCollectionName);
    }
  }

  visit(pageNode, '$.subModels.page', parentCollectionName);
  return findings;
}

function getRequiredActionMissingCode(kind) {
  if (kind === 'create-popup') {
    return 'REQUIRED_CREATE_POPUP_ACTION_MISSING';
  }
  if (kind === 'view-record-popup') {
    return 'REQUIRED_VIEW_RECORD_POPUP_ACTION_MISSING';
  }
  if (kind === 'add-child-record-popup') {
    return 'REQUIRED_ADD_CHILD_RECORD_POPUP_ACTION_MISSING';
  }
  if (kind === 'record-action') {
    return 'REQUIRED_RECORD_ACTION_MISSING';
  }
  return 'REQUIRED_EDIT_RECORD_POPUP_ACTION_MISSING';
}

function buildRequiredActionMissingMessage(kind, collectionName, scope) {
  if (kind === 'create-popup') {
    return `显式要求 ${collectionName} 在 ${scope} 提供稳定的新建 popup 动作树，但当前未发现满足条件的 action/page/CreateForm 结构。`;
  }
  if (kind === 'view-record-popup') {
    return `显式要求 ${collectionName} 在 ${scope} 提供稳定的查看 popup 动作树，但当前未发现满足条件的 action/page/Details 结构。`;
  }
  if (kind === 'add-child-record-popup') {
    return `显式要求 ${collectionName} 在 ${scope} 提供稳定的新增下级 popup 动作树，但当前未发现满足条件的 action/page/CreateForm 结构。`;
  }
  if (kind === 'record-action') {
    return `显式要求 ${collectionName} 在 ${scope} 提供 record action，但当前未发现满足条件的记录级动作。`;
  }
  return `显式要求 ${collectionName} 在 ${scope} 提供稳定的记录级编辑 popup 动作树，但当前未发现满足条件的 action/page/EditForm 结构。`;
}

function scopeMatchesRequirement(requirementScope, candidateScope) {
  return requirementScope === 'either' || requirementScope === candidateScope;
}

function listActionSlotsForNode(node, pathValue) {
  const slots = [];
  if (!isPlainObject(node) || typeof node.use !== 'string') {
    return slots;
  }

  if (node.use === 'TableBlockModel') {
    slots.push({
      scope: 'block-actions',
      path: `${pathValue}.subModels.actions`,
      actions: Array.isArray(node.subModels?.actions) ? node.subModels.actions : [],
    });
    const columns = Array.isArray(node.subModels?.columns) ? node.subModels.columns : [];
    columns.forEach((columnNode, columnIndex) => {
      if (!isPlainObject(columnNode) || columnNode.use !== 'TableActionsColumnModel') {
        return;
      }
      slots.push({
        scope: 'row-actions',
        path: `${pathValue}.subModels.columns[${columnIndex}].subModels.actions`,
        actions: Array.isArray(columnNode.subModels?.actions) ? columnNode.subModels.actions : [],
      });
    });
    return slots;
  }

  if (node.use === 'DetailsBlockModel') {
    slots.push({
      scope: 'details-actions',
      path: `${pathValue}.subModels.actions`,
      actions: Array.isArray(node.subModels?.actions) ? node.subModels.actions : [],
    });
  }

  return slots;
}

function inspectRequiredAction(payload, requirement, mode, blockers, seen) {
  let matchedBlockCount = 0;

  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || !ACTION_HOST_MODEL_USES.has(node.use)) {
      return;
    }
    if (requirement.scope === 'row-actions' && node.use !== 'TableBlockModel') {
      return;
    }
    if (requirement.scope === 'details-actions' && node.use !== 'DetailsBlockModel') {
      return;
    }
    if (requirement.scope === 'block-actions' && node.use !== 'TableBlockModel') {
      return;
    }

    const collectionName = node.stepParams?.resourceSettings?.init?.collectionName;
    if (collectionName !== requirement.collectionName) {
      return;
    }

    matchedBlockCount += 1;
    const relevantSlots = listActionSlotsForNode(node, pathValue)
      .filter((slot) => scopeMatchesRequirement(requirement.scope, slot.scope));
    if (relevantSlots.some((slot) => slot.actions.some((actionNode) => hasRequiredAction(actionNode, requirement, collectionName)))) {
      return;
    }

    const blockerPath = relevantSlots[0]?.path || `${pathValue}.subModels.actions`;
    pushFinding(blockers, seen, createFinding({
      severity: 'blocker',
      code: getRequiredActionMissingCode(requirement.kind),
      message: buildRequiredActionMissingMessage(requirement.kind, collectionName, requirement.scope),
      path: blockerPath,
      mode,
      dedupeKey: `${getRequiredActionMissingCode(requirement.kind)}:${pathValue}:${requirement.scope}`,
      details: {
        collectionName,
        requiredAction: requirement.kind,
        actionScope: requirement.scope,
        slotCount: relevantSlots.length,
      },
    }));
  });

  if (matchedBlockCount > 0) {
    return;
  }

  pushFinding(blockers, seen, createFinding({
    severity: 'blocker',
    code: 'REQUIRED_ACTION_TARGET_BLOCK_MISSING',
    message: `显式要求 ${requirement.collectionName} 提供 ${requirement.kind}，但当前 payload 中未找到对应业务区块。`,
    path: '$',
    mode,
    dedupeKey: `REQUIRED_ACTION_TARGET_BLOCK_MISSING:${requirement.kind}:${requirement.collectionName}`,
    details: {
      collectionName: requirement.collectionName,
      requiredAction: requirement.kind,
    },
  }));
}

function inspectDeclaredRequirements(payload, mode, requirements, blockers, seen) {
  for (const requirement of requirements.requiredActions) {
    inspectRequiredAction(payload, requirement, mode, blockers, seen);
  }
  for (const requirement of requirements.requiredTabs) {
    inspectRequiredVisibleTabs(payload, requirement, mode, blockers, seen);
  }
}

function inspectRequiredVisibleTabs(payload, requirement, mode, blockers, seen) {
  let matchedPageCount = 0;

  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || !Array.isArray(node.subModels?.tabs)) {
      return;
    }
    if (requirement.pageSignature && pathValue !== requirement.pageSignature) {
      return;
    }
    if (requirement.pageUse && node.use !== requirement.pageUse) {
      return;
    }

    matchedPageCount += 1;
    const tabs = Array.isArray(node.subModels?.tabs) ? node.subModels.tabs : [];
    const tabsByTitle = new Map();
    tabs.forEach((tabNode, tabIndex) => {
      const title = getTabTitle(tabNode);
      if (!title || tabsByTitle.has(title)) {
        return;
      }
      tabsByTitle.set(title, {
        tabNode,
        tabIndex,
      });
    });
    const actualTitles = [...tabsByTitle.keys()];
    const missingTitles = requirement.titles.filter((title) => !tabsByTitle.has(title));
    if (missingTitles.length === 0) {
      if (!requirement.requireBlockGrid) {
        return;
      }

      const titlesMissingGrid = requirement.titles.filter((title) => {
        const matchedTab = tabsByTitle.get(title);
        const gridNode = matchedTab?.tabNode?.subModels?.grid;
        return !isPlainObject(gridNode) || gridNode.use !== 'BlockGridModel';
      });
      if (titlesMissingGrid.length === 0) {
        return;
      }

      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'REQUIRED_VISIBLE_TABS_MISSING',
        message: `显式要求的 tabs 已命中标题，但缺少稳定 BlockGridModel；受影响 tabs：${titlesMissingGrid.join('、')}。`,
        path: `${pathValue}.subModels.tabs`,
        mode,
        dedupeKey: `REQUIRED_VISIBLE_TABS_MISSING:grid:${pathValue}:${titlesMissingGrid.join('|')}`,
        details: {
          pageUse: node.use || null,
          pageSignature: pathValue,
          requiredTitles: requirement.titles,
          actualTitles,
          titlesMissingGrid,
        },
      }));
      return;
    }

    pushFinding(blockers, seen, createFinding({
      severity: 'blocker',
      code: 'REQUIRED_VISIBLE_TABS_MISSING',
      message: `显式要求的可见 tabs 未完整落入 payload；缺少：${missingTitles.join('、')}。`,
      path: `${pathValue}.subModels.tabs`,
      mode,
      dedupeKey: `REQUIRED_VISIBLE_TABS_MISSING:${pathValue}:${missingTitles.join('|')}`,
      details: {
        pageUse: node.use || null,
        pageSignature: pathValue,
        requiredTitles: requirement.titles,
        actualTitles,
        missingTitles,
      },
    }));
  });

  if (matchedPageCount > 0) {
    return;
  }

  pushFinding(blockers, seen, createFinding({
    severity: 'blocker',
    code: 'REQUIRED_TABS_TARGET_PAGE_MISSING',
    message: '要求显式可见 tabs，但 payload 中未找到目标 page/tabs 结构。',
    path: '$',
    mode,
    dedupeKey: `REQUIRED_TABS_TARGET_PAGE_MISSING:${requirement.pageUse || 'any'}:${requirement.titles.join('|')}`,
    details: {
      pageSignature: requirement.pageSignature,
      pageUse: requirement.pageUse,
      requiredTitles: requirement.titles,
    },
  }));
}

function inspectTabTrees(payload, mode, warnings, blockers, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || !PAGE_MODEL_USES_SET.has(node.use) || !Array.isArray(node.subModels?.tabs)) {
      return;
    }

    const tabs = node.subModels.tabs;
    const allowedTabUses = getAllowedTabUsesForPage(node.use);
    const uidOccurrences = new Map();
    pushStructuralUidOccurrence(uidOccurrences, node.uid, node.use, pathValue);

    tabs.forEach((tabNode, tabIndex) => {
      const tabPath = `${pathValue}.subModels.tabs[${tabIndex}]`;
      const tabUse = isPlainObject(tabNode) && typeof tabNode.use === 'string' ? tabNode.use : null;

      if (!tabUse || !allowedTabUses.has(tabUse)) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'TAB_SLOT_USE_INVALID',
          message: `${node.use} 的 tabs 槽位只能放 ${[...allowedTabUses].join(' / ')}，当前收到 ${tabUse || '未知 use'}。`,
          path: tabPath,
          mode,
          dedupeKey: `TAB_SLOT_USE_INVALID:${tabPath}:${tabUse || 'unknown'}`,
          details: {
            pageUse: node.use,
            allowedTabUses: [...allowedTabUses],
            actualTabUse: tabUse,
          },
        }));
        return;
      }

      pushStructuralUidOccurrence(uidOccurrences, tabNode.uid, tabUse, tabPath);
      const gridNode = tabNode.subModels?.grid;
      const gridPath = `${tabPath}.subModels.grid`;
      const gridUse = isPlainObject(gridNode) && typeof gridNode.use === 'string' ? gridNode.use : null;
      if (gridUse !== 'BlockGridModel') {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'TAB_GRID_MISSING_OR_INVALID',
          message: '显式 tab 下必须有稳定的 BlockGridModel，不能缺失或写成其他模型。',
          path: gridPath,
          mode,
          dedupeKey: `TAB_GRID_MISSING_OR_INVALID:${gridPath}:${gridUse || 'missing'}`,
          details: {
            pageUse: node.use,
            tabUse,
            actualGridUse: gridUse,
          },
        }));
        return;
      }

      pushStructuralUidOccurrence(uidOccurrences, gridNode.uid, gridUse, gridPath);
      const gridItems = Array.isArray(gridNode.subModels?.items) ? gridNode.subModels.items : [];
      gridItems.forEach((itemNode, itemIndex) => {
        if (!isPlainObject(itemNode) || typeof itemNode.use !== 'string') {
          return;
        }
        const itemPath = `${gridPath}.subModels.items[${itemIndex}]`;
        pushStructuralUidOccurrence(uidOccurrences, itemNode.uid, itemNode.use, itemPath);
        if (INVALID_VISIBLE_TAB_ITEM_MODEL_USES.has(itemNode.use)) {
          pushFinding(blockers, seen, createFinding({
            severity: 'blocker',
            code: 'TAB_GRID_ITEM_USE_INVALID',
            message: '显式 tab 的 grid.items 槽位必须放业务 block，不能继续塞 page/tab/grid 结构节点。',
            path: itemPath,
            mode,
            dedupeKey: `TAB_GRID_ITEM_USE_INVALID:${itemPath}:${itemNode.use}`,
            details: {
              pageUse: node.use,
              tabUse,
              itemUse: itemNode.use,
            },
          }));
        }
      });
    });

    for (const [uid, occurrences] of uidOccurrences.entries()) {
      if (occurrences.length <= 1) {
        continue;
      }
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'TAB_SUBTREE_UID_REUSED',
        message: `显式 tabs 子树复用了同一个 uid "${uid}"，这会让 page/tab/grid/block 结构塌缩。`,
        path: `${pathValue}.subModels.tabs`,
        mode,
        dedupeKey: `TAB_SUBTREE_UID_REUSED:${pathValue}:${uid}`,
        details: {
          pageUse: node.use,
          uid,
          occurrences,
        },
      }));
    }
  });
}

function findRelationBlocksUsingGenericPopupFilter(pageNode, parentCollectionName, metadata) {
  const findings = [];

  function visit(node, pathValue, currentParentCollectionName) {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, joinPath(pathValue, index), currentParentCollectionName));
      return;
    }
    if (!isPlainObject(node)) {
      return;
    }

    const use = typeof node.use === 'string' ? node.use : '';
    const initOptions = node.stepParams?.resourceSettings?.init;
    const resourceCollectionName = initOptions?.collectionName || currentParentCollectionName;
    const dataScopeFilter = node.stepParams?.tableSettings?.dataScope?.filter
      || node.stepParams?.detailsSettings?.dataScope?.filter
      || node.stepParams?.formSettings?.dataScope?.filter;
    const hasAssociationProtocol = Boolean(
      typeof initOptions?.associationName === 'string'
      && initOptions.associationName.trim()
      && Object.hasOwn(initOptions, 'sourceId'),
    );

    if (
      FILTER_CONTAINER_MODEL_USES.has(use)
      && initOptions?.collectionName
      && currentParentCollectionName
      && initOptions.collectionName !== currentParentCollectionName
      && !hasAssociationProtocol
    ) {
      const collectionMeta = getCollectionMeta(metadata, initOptions.collectionName);
      const childRelationField = findAssociationFieldToTarget(collectionMeta, currentParentCollectionName);
      const relationScalarPathHints = getBelongsToScalarPathHints(childRelationField);
      const parentCollectionMeta = getCollectionMeta(metadata, currentParentCollectionName);
      const parentAssociationField = findAssociationFieldToTarget(parentCollectionMeta, initOptions.collectionName);
      const matchedCondition = relationScalarPathHints?.suggestedPaths?.length
        ? collectFilterConditions(dataScopeFilter).find(
          (condition) => (
            isScalarComparisonOperator(condition.operator)
            && relationScalarPathHints.suggestedPaths.includes(condition.path)
            && usesPopupInputArgsFilterByTk(condition.value)
          ),
        )
        : null;

      if (childRelationField && parentAssociationField && matchedCondition) {
        findings.push({
          path: pathValue,
          use,
          collectionName: initOptions.collectionName,
          parentCollectionName: currentParentCollectionName,
          relationField: childRelationField.name,
          targetCollectionName: childRelationField.target,
          matchedConditionPath: matchedCondition.path,
          scalarComparablePaths: relationScalarPathHints.suggestedPaths,
          suggestedProtocol: {
            associationName: `${currentParentCollectionName}.${parentAssociationField.name}`,
            sourceId: POPUP_INPUT_ARGS_FILTER_BY_TK,
          },
        });
      }
    }

    for (const [key, child] of Object.entries(node)) {
      visit(child, joinPath(pathValue, key), resourceCollectionName);
    }
  }

  visit(pageNode, '$.subModels.page', parentCollectionName);
  return findings;
}

function findRelationBlocksUsingAmbiguousAssociationContext(pageNode, parentCollectionName, metadata) {
  const findings = [];

  function visit(node, pathValue, currentParentCollectionName) {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, joinPath(pathValue, index), currentParentCollectionName));
      return;
    }
    if (!isPlainObject(node)) {
      return;
    }

    const use = typeof node.use === 'string' ? node.use : '';
    const initOptions = node.stepParams?.resourceSettings?.init;
    const resourceCollectionName = initOptions?.collectionName || currentParentCollectionName;
    const associationName = typeof initOptions?.associationName === 'string' ? initOptions.associationName.trim() : '';
    const sourceId = initOptions?.sourceId;

    if (
      FILTER_CONTAINER_MODEL_USES.has(use)
      && initOptions?.collectionName
      && currentParentCollectionName
      && initOptions.collectionName !== currentParentCollectionName
      && associationName
      && Object.hasOwn(initOptions, 'sourceId')
    ) {
      const collectionMeta = getCollectionMeta(metadata, initOptions.collectionName);
      const directAssociationField = findAssociationFieldByAssociationName(collectionMeta, associationName);
      if (
        directAssociationField
        && isBelongsToLikeField(directAssociationField)
        && directAssociationField.target === currentParentCollectionName
        && usesPopupInputArgsFilterByTk(sourceId)
      ) {
        findings.push({
          path: pathValue,
          use,
          collectionName: initOptions.collectionName,
          parentCollectionName: currentParentCollectionName,
          associationName,
          sourceId,
          relationField: directAssociationField.name,
          targetCollectionName: directAssociationField.target,
        });
      }
    }

    for (const [key, child] of Object.entries(node)) {
      visit(child, joinPath(pathValue, key), resourceCollectionName);
    }
  }

  visit(pageNode, '$.subModels.page', parentCollectionName);
  return findings;
}

function hasMeaningfulDetailsContent(detailsBlock) {
  if (!isPlainObject(detailsBlock?.subModels)) {
    return false;
  }

  let hasContent = false;
  walk(detailsBlock.subModels, (node) => {
    if (hasContent || !isPlainObject(node) || typeof node.use !== 'string') {
      return;
    }
    if (DETAILS_LAYOUT_ONLY_MODEL_USES.has(node.use)) {
      return;
    }
    if (node.use === 'DetailsBlockModel') {
      return;
    }
    hasContent = true;
  });

  return hasContent;
}

function inspectFormBlocks(payload, mode, warnings, blockers, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || !FORM_BLOCK_MODEL_USES.has(node.use)) {
      return;
    }

    const actionNodes = Array.isArray(node.subModels?.actions) ? node.subModels.actions : [];
    const gridItems = Array.isArray(node.subModels?.grid?.subModels?.items) ? node.subModels.grid.subModels.items : [];

    gridItems.forEach((item, index) => {
      if (!isPlainObject(item) || !FORM_BLOCK_ACTION_MODEL_USES.has(item.use)) {
        return;
      }

      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'FORM_ACTION_MUST_USE_ACTIONS_SLOT',
        message: `${node.use} 的表单动作必须挂在 subModels.actions，不能放进 FormGridModel.subModels.items；否则按钮会渲染到字段区或位置异常。`,
        path: `${pathValue}.subModels.grid.subModels.items[${index}]`,
        mode,
        dedupeKey: `FORM_ACTION_MUST_USE_ACTIONS_SLOT:${pathValue}:${index}`,
        details: {
          formUse: node.use,
          actionUse: item.use,
          expectedSlot: `${pathValue}.subModels.actions`,
        },
      }));
    });

    const hasSubmitLikeAction = actionNodes.some(
      (actionNode) => isPlainObject(actionNode) && FORM_BLOCK_ACTION_MODEL_USES.has(actionNode.use),
    );
    if (!hasSubmitLikeAction) {
      const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
      pushFinding(targetList, seen, createFinding({
        severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
        code: 'FORM_SUBMIT_ACTION_MISSING',
        message: `${node.use} 缺少稳定的表单动作；至少应在 subModels.actions 中放置 FormSubmitActionModel 或 JSFormActionModel。`,
        path: `${pathValue}.subModels.actions`,
        mode,
        dedupeKey: `FORM_SUBMIT_ACTION_MISSING:${pathValue}`,
        details: {
          formUse: node.use,
          actionCount: actionNodes.length,
        },
      }));
    }

    gridItems.forEach((item, index) => {
      if (!isPlainObject(item) || item.use !== 'FormItemModel') {
        return;
      }

      const fieldUse = typeof item.subModels?.field?.use === 'string' ? item.subModels.field.use.trim() : '';
      if (fieldUse) {
        return;
      }

      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'FORM_ITEM_FIELD_SUBMODEL_MISSING',
        message: 'FormItemModel 不能只写 fieldSettings.init；必须显式补 subModels.field，并使用当前 schema/field binding 给出的 editable field model。',
        path: `${pathValue}.subModels.grid.subModels.items[${index}]`,
        mode,
        dedupeKey: `FORM_ITEM_FIELD_SUBMODEL_MISSING:${pathValue}:${index}`,
        details: {
          formUse: node.use,
          fieldPath: item.stepParams?.fieldSettings?.init?.fieldPath || null,
          collectionName: item.stepParams?.fieldSettings?.init?.collectionName || null,
        },
      }));
    });
  });
}

function inspectActionSlots(payload, mode, blockers, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || typeof node.use !== 'string') {
      return;
    }

    if (node.use === 'TableBlockModel') {
      inspectActionSlotUses({
        hostNode: node,
        slotPath: `${pathValue}.subModels.actions`,
        allowedUses: COLLECTION_ACTION_MODEL_USES,
        code: 'TABLE_COLLECTION_ACTION_SLOT_USE_INVALID',
        message: `TableBlockModel 的 actions 槽位只能放 ${[...COLLECTION_ACTION_MODEL_USES].join(' / ')}，不能回退成泛型 ActionModel 或 record action。`,
        mode,
        blockers,
        seen,
      });
      return;
    }

    if (node.use === 'TableActionsColumnModel') {
      inspectActionSlotUses({
        hostNode: node,
        slotPath: `${pathValue}.subModels.actions`,
        allowedUses: RECORD_ACTION_MODEL_USES,
        code: 'TABLE_RECORD_ACTION_SLOT_USE_INVALID',
        message: `TableActionsColumnModel 的 actions 槽位只能放 record action uses，不能回退成泛型 ActionModel 或 collection action。`,
        mode,
        blockers,
        seen,
      });
      return;
    }

    if (node.use === 'DetailsBlockModel') {
      inspectActionSlotUses({
        hostNode: node,
        slotPath: `${pathValue}.subModels.actions`,
        allowedUses: RECORD_ACTION_MODEL_USES,
        code: 'DETAILS_ACTION_SLOT_USE_INVALID',
        message: `DetailsBlockModel 的 actions 槽位只能放 record action uses，不能回退成泛型 ActionModel 或 collection action。`,
        mode,
        blockers,
        seen,
      });
      return;
    }

    if (node.use === 'FilterFormBlockModel') {
      inspectActionSlotUses({
        hostNode: node,
        slotPath: `${pathValue}.subModels.actions`,
        allowedUses: FILTER_FORM_ACTION_MODEL_USES,
        code: 'FILTER_FORM_ACTION_SLOT_USE_INVALID',
        message: `FilterFormBlockModel 的 actions 槽位只能放 filter-form action uses，不能回退成泛型 ActionModel。`,
        mode,
        blockers,
        seen,
      });
    }
  });
}

function inspectDetailsBlocks(payload, mode, warnings, blockers, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || node.use !== 'DetailsBlockModel') {
      return;
    }

    if (hasMeaningfulDetailsContent(node)) {
      return;
    }

    const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
    pushFinding(targetList, seen, createFinding({
      severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
      code: 'EMPTY_DETAILS_BLOCK',
      message: 'DetailsBlockModel 只有空 grid 壳，没有任何详情字段、动作或子业务区块。',
      path: pathValue,
      mode,
      dedupeKey: `EMPTY_DETAILS_BLOCK:${pathValue}`,
      details: {
        collectionName: node.stepParams?.resourceSettings?.init?.collectionName || null,
      },
    }));
  });
}

function inspectPopupActions(payload, metadata, mode, warnings, blockers, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node) || typeof node.use !== 'string' || !node.use.endsWith('ActionModel')) {
      return;
    }
    const openView = node.stepParams?.popupSettings?.openView;
    const pageNode = node.subModels?.page;
    const isPopupAction = isPlainObject(openView) || pageNode;
    if (!isPopupAction) {
      return;
    }

    const declaredPageUse = typeof openView?.pageModelClass === 'string' ? openView.pageModelClass.trim() : '';
    const actualPageUse = isPlainObject(pageNode) && typeof pageNode.use === 'string' ? pageNode.use.trim() : '';
    if (declaredPageUse && !SUPPORTED_POPUP_PAGE_USES_SET.has(declaredPageUse)) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'POPUP_PAGE_USE_INVALID',
        message: `popup/openView 的 pageModelClass 必须是 ${SUPPORTED_POPUP_PAGE_USES.join(' / ')} 之一。`,
        path: `${pathValue}.stepParams.popupSettings.openView.pageModelClass`,
        mode,
        dedupeKey: `POPUP_PAGE_USE_INVALID:${pathValue}:declared:${declaredPageUse}`,
        details: {
          actionUse: node.use,
          declaredPageUse,
          actualPageUse: actualPageUse || null,
        },
      }));
    }
    if (pageNode && (!actualPageUse || !SUPPORTED_POPUP_PAGE_USES_SET.has(actualPageUse))) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'POPUP_PAGE_USE_INVALID',
        message: `popup/openView 的 subModels.page 必须落成 ${SUPPORTED_POPUP_PAGE_USES.join(' / ')}，不能写成其他结构壳。`,
        path: `${pathValue}.subModels.page`,
        mode,
        dedupeKey: `POPUP_PAGE_USE_INVALID:${pathValue}:actual:${actualPageUse || 'missing'}`,
        details: {
          actionUse: node.use,
          declaredPageUse: declaredPageUse || null,
          actualPageUse: actualPageUse || null,
        },
      }));
    }
    if (declaredPageUse && actualPageUse && declaredPageUse !== actualPageUse) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'POPUP_PAGE_USE_MISMATCH',
        message: 'popup/openView 的 pageModelClass 与 subModels.page.use 必须严格一致，否则很容易出现按钮位置错乱、drawer/form 结构异常或上下文不通。',
        path: `${pathValue}.subModels.page`,
        mode,
        dedupeKey: `POPUP_PAGE_USE_MISMATCH:${pathValue}:${declaredPageUse}:${actualPageUse}`,
        details: {
          actionUse: node.use,
          declaredPageUse,
          actualPageUse,
        },
      }));
    }

    const tabCount = pageNode ? countUses(pageNode, PAGE_TAB_MODEL_USES) : 0;
    const gridCount = pageNode ? countUses(pageNode, GRID_MODEL_USES) : 0;
    const blockCount = pageNode ? countUses(pageNode, BUSINESS_BLOCK_MODEL_USES) : 0;
    if (!pageNode || tabCount === 0 || gridCount === 0) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'POPUP_ACTION_MISSING_SUBTREE',
        message: 'popup/openView 动作缺少完整的 page/tab/grid 子树。',
        path: pathValue,
        mode,
        dedupeKey: `POPUP_ACTION_MISSING_SUBTREE:${pathValue}`,
        details: {
          use: node.use,
          hasPage: Boolean(pageNode),
          tabCount,
          gridCount,
        },
      }));
    } else if (blockCount === 0) {
      const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
      pushFinding(targetList, seen, createFinding({
        severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
        code: 'EMPTY_POPUP_GRID',
        message: 'popup/openView 子树只有 page/tab/grid 壳，没有实际业务 block。',
        path: pathValue,
        mode,
        dedupeKey: `EMPTY_POPUP_GRID:${pathValue}`,
        details: {
          use: node.use,
          blockCount,
        },
      }));
    }

    if (pageNode) {
      const subtreeStrings = collectStrings(pageNode);
      const usesInputArgsFilterByTk = subtreeStrings.some((value) => value.includes(POPUP_INPUT_ARGS_FILTER_BY_TK));
      if (usesInputArgsFilterByTk && !openView?.filterByTk) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'POPUP_CONTEXT_REFERENCE_WITHOUT_INPUT_ARG',
          message: 'popup 子树依赖 ctx.view.inputArgs.filterByTk，但动作层没有显式传入 filterByTk。',
          path: pathValue,
          mode,
          dedupeKey: `POPUP_CONTEXT_REFERENCE_WITHOUT_INPUT_ARG:${pathValue}`,
          details: {
            use: node.use,
            collectionName: openView?.collectionName || null,
          },
        }));
      }

      const nestedRelationBlocks = findNestedRelationBlocks(pageNode, openView?.collectionName || null);
      for (const relationBlock of nestedRelationBlocks) {
        const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
        pushFinding(targetList, seen, createFinding({
          severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
          code: 'RELATION_BLOCK_WITH_EMPTY_FILTER',
          message: 'popup 内关系区块缺少明确的 relation filter，当前只剩空 dataScope.filter。',
          path: relationBlock.path,
          mode,
          dedupeKey: `RELATION_BLOCK_WITH_EMPTY_FILTER:${relationBlock.path}`,
          details: relationBlock,
        }));
      }

      const genericRelationBlocks = findRelationBlocksUsingGenericPopupFilter(
        pageNode,
        openView?.collectionName || null,
        metadata,
      );
      for (const relationBlock of genericRelationBlocks) {
        pushFinding(warnings, seen, createFinding({
          severity: 'warning',
          code: 'RELATION_BLOCK_SHOULD_USE_ASSOCIATION_CONTEXT',
          message: '当前 child-side relation filter 已可用；若 parent->child association resource 已验证，可进一步收敛成 associationName + sourceId。',
          path: relationBlock.path,
          mode,
          dedupeKey: `RELATION_BLOCK_SHOULD_USE_ASSOCIATION_CONTEXT:${relationBlock.path}`,
          details: relationBlock,
        }));
      }

      const ambiguousAssociationBlocks = findRelationBlocksUsingAmbiguousAssociationContext(
        pageNode,
        openView?.collectionName || null,
        metadata,
      );
      for (const relationBlock of ambiguousAssociationBlocks) {
        const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
        pushFinding(targetList, seen, createFinding({
          severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
          code: 'ASSOCIATION_CONTEXT_REQUIRES_VERIFIED_RESOURCE',
          message: 'popup 内关联子表的 associationName 不能只复用子表指向父表的 belongsTo 字段名；先基于稳定 reference 或 live tree 验真。',
          path: relationBlock.path,
          mode,
          dedupeKey: `ASSOCIATION_CONTEXT_REQUIRES_VERIFIED_RESOURCE:${relationBlock.path}`,
          details: relationBlock,
        }));
      }
    }

    if (openView && isHardcodedFilterValue(openView.filterByTk)) {
      const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
      pushFinding(targetList, seen, createFinding({
        severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
        code: 'HARDCODED_FILTER_BY_TK',
        message: 'popup/openView 的 filterByTk 使用了硬编码样本值。',
        path: `${pathValue}.stepParams.popupSettings.openView.filterByTk`,
        mode,
        dedupeKey: `HARDCODED_FILTER_BY_TK:${pathValue}.openView`,
        details: {
          value: openView.filterByTk,
        },
      }));
    }
  });
}

function inspectFilters(payload, metadata, mode, blockers, seen) {
  walk(payload, (node, pathValue, context) => {
    if (!isPlainObject(node) || !pathValue.endsWith('.dataScope.filter')) {
      return;
    }
    validateFilterGroup({
      filter: node,
      path: pathValue,
      collectionName: context.resourceCollectionName,
      metadata,
      mode,
      blockers,
      seen,
    });
  });
}

function validateFilterGroup({ filter, path: filterPath, collectionName, metadata, mode, blockers, seen }) {
  if (!isPlainObject(filter) || !Array.isArray(filter.items) || typeof filter.logic !== 'string') {
    pushFinding(blockers, seen, createFinding({
      severity: 'blocker',
      code: 'FILTER_GROUP_MALFORMED',
      message: 'dataScope.filter 必须包含合法的 logic 和 items。',
      path: filterPath,
      mode,
    }));
    return;
  }

  try {
    normalizeFilterLogic(filter.logic);
  } catch (error) {
    pushFinding(blockers, seen, createUnsupportedFilterLogicFinding({
      path: `${filterPath}.logic`,
      mode,
      logic: filter.logic,
    }));
    return;
  }

  const collectionMeta = getCollectionMeta(metadata, collectionName);
  const validateItem = (item, itemPath) => {
    if (!isPlainObject(item)) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'FILTER_GROUP_MALFORMED',
        message: 'filter item 必须是 condition 或 group 对象。',
        path: itemPath,
        mode,
      }));
      return;
    }

    const isCondition = typeof item.path === 'string' && typeof item.operator === 'string';
    const looksLikeGroup = Object.hasOwn(item, 'logic') || Object.hasOwn(item, 'items');
    const looksLikeFieldCondition = typeof item.field === 'string' && typeof item.operator === 'string';

    if (looksLikeFieldCondition && !isCondition) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'FILTER_ITEM_USES_FIELD_NOT_PATH',
        message: 'filter condition 只能使用 path，不允许使用 field。',
        path: itemPath,
        mode,
      }));
      return;
    }

    if (isCondition) {
      const isSimplePath = isSimpleFieldName(item.path) && !hasTemplateExpression(item.path);
      const directField = collectionMeta && isSimplePath
        ? collectionMeta.fieldsByName.get(item.path) || null
        : null;
      const associationFromForeignKey = collectionMeta && isSimplePath
        ? collectionMeta.associationsByForeignKey.get(item.path) || null
        : null;

      if (collectionMeta && isSimplePath && !directField && !associationFromForeignKey) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'FIELD_PATH_NOT_FOUND',
          message: `filter path "${item.path}" 在 collection "${collectionName}" 中不存在。`,
          path: itemPath,
          mode,
          dedupeKey: `FILTER_FIELD_PATH_NOT_FOUND:${collectionName}:${item.path}`,
          details: {
            collectionName,
            fieldPath: item.path,
          },
        }));
        return;
      }

      if (directField && isBelongsToLikeField(directField) && isScalarComparisonOperator(item.operator)) {
        const scalarPathHints = getBelongsToScalarPathHints(directField);
        const suggestedPaths = scalarPathHints?.suggestedPaths || [];
        const suggestionMessage = suggestedPaths.length > 0
          ? `；请改为可比较的标量路径，例如 ${suggestedPaths.map((value) => `"${value}"`).join(' 或 ')}。`
          : '；当前 metadata 未提供 foreignKey 或 targetKey，不能继续猜字段名。';
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'BELONGS_TO_FILTER_REQUIRES_SCALAR_PATH',
          message: `belongsTo 字段 "${item.path}" 不能直接搭配标量操作符 "${item.operator}"${suggestionMessage}`,
          path: itemPath,
          mode,
          dedupeKey: `BELONGS_TO_FILTER_REQUIRES_SCALAR_PATH:${collectionName}:${item.path}:${item.operator}`,
          details: {
            collectionName,
            fieldPath: item.path,
            operator: item.operator,
            ...(scalarPathHints || {
              associationField: directField.name,
              foreignKey: null,
              targetCollection: directField.target || null,
              targetKey: null,
              suggestedPaths: [],
            }),
          },
        }));
      }
      return;
    }

    if (looksLikeGroup && Array.isArray(item.items) && typeof item.logic === 'string') {
      try {
        normalizeFilterLogic(item.logic);
      } catch (error) {
        pushFinding(blockers, seen, createUnsupportedFilterLogicFinding({
          path: `${itemPath}.logic`,
          mode,
          logic: item.logic,
        }));
        return;
      }
      item.items.forEach((child, index) => validateItem(child, `${itemPath}.items[${index}]`));
      return;
    }

    pushFinding(blockers, seen, createFinding({
      severity: 'blocker',
      code: 'FILTER_GROUP_MALFORMED',
      message: 'filter item 既不是合法 condition，也不是合法 group。',
      path: itemPath,
      mode,
    }));
  };

  filter.items.forEach((item, index) => validateItem(item, `${filterPath}.items[${index}]`));
}

function inspectFieldBindings(payload, metadata, mode, warnings, blockers, seen) {
  walk(payload, (node, pathValue, context) => {
    if (
      !isPlainObject(node)
      || typeof node.use !== 'string'
      || !context.fieldBinding?.collectionName
      || !context.fieldBinding.fieldPath
    ) {
      return;
    }
    const collectionMeta = getCollectionMeta(metadata, context.fieldBinding.collectionName);
    if (!collectionMeta) {
      return;
    }

    const { fieldPath, collectionName, associationPathName } = context.fieldBinding;
    if (hasTemplateExpression(fieldPath)) {
      return;
    }

    const isSimpleBinding = isSimpleFieldName(fieldPath);
    const resolvedFieldBinding = resolveFieldPathInMetadata(metadata, collectionName, fieldPath);
    const associationFromForeignKey = isSimpleBinding ? collectionMeta.associationsByForeignKey.get(fieldPath) || null : null;

    if (!resolvedFieldBinding) {
      if (associationFromForeignKey) {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'FOREIGN_KEY_USED_AS_FIELD_PATH',
          message: `fieldPath "${fieldPath}" 是关联字段 "${associationFromForeignKey.name}" 的 foreignKey，不应直接作为 UI 字段绑定。`,
          path: pathValue,
          mode,
          dedupeKey: `FOREIGN_KEY_USED_AS_FIELD_PATH:${collectionName}:${fieldPath}`,
          details: {
            collectionName,
            fieldPath,
            associationField: associationFromForeignKey.name,
          },
        }));
      } else {
        pushFinding(blockers, seen, createFinding({
          severity: 'blocker',
          code: 'FIELD_PATH_NOT_FOUND',
          message: `fieldPath "${fieldPath}" 在 collection "${collectionName}" 中不存在。`,
          path: pathValue,
          mode,
          dedupeKey: `FIELD_PATH_NOT_FOUND:${collectionName}:${fieldPath}`,
          details: {
            collectionName,
            fieldPath,
          },
        }));
      }
      return;
    }

    const expectedAssociationPathName = !isSimpleBinding
      ? getExpectedAssociationPathName(metadata, collectionName, fieldPath)
      : null;
    if (expectedAssociationPathName) {
      const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
      if (!associationPathName) {
        pushFinding(targetList, seen, createFinding({
          severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
          code: 'DOTTED_ASSOCIATION_DISPLAY_MISSING_ASSOCIATION_PATH',
          message: `父 collection 上的 dotted 关联展示字段 "${fieldPath}" 必须显式补 associationPathName="${expectedAssociationPathName}"，否则 runtime 可能拿不到关联 appends。`,
          path: pathValue,
          mode,
          dedupeKey: `DOTTED_ASSOCIATION_DISPLAY_MISSING_ASSOCIATION_PATH:${collectionName}:${fieldPath}`,
          details: {
            collectionName,
            fieldPath,
            expectedAssociationPathName,
          },
        }));
      } else if (associationPathName !== expectedAssociationPathName) {
        pushFinding(targetList, seen, createFinding({
          severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
          code: 'DOTTED_ASSOCIATION_DISPLAY_ASSOCIATION_PATH_MISMATCH',
          message: `父 collection 上的 dotted 关联展示字段 "${fieldPath}" 必须把 associationPathName 设为 "${expectedAssociationPathName}"，当前为 "${associationPathName}"。`,
          path: pathValue,
          mode,
          dedupeKey: `DOTTED_ASSOCIATION_DISPLAY_ASSOCIATION_PATH_MISMATCH:${collectionName}:${fieldPath}:${associationPathName}`,
          details: {
            collectionName,
            fieldPath,
            associationPathName,
            expectedAssociationPathName,
          },
        }));
      }
    }

    const directField = resolvedFieldBinding.field;
    const parentCollectionName = context.resourceCollectionName;
    if (
      associationPathName
      && parentCollectionName
      && collectionName !== parentCollectionName
      && isSimpleBinding
    ) {
      const parentAssociationBinding = resolveFieldPathInMetadata(metadata, parentCollectionName, associationPathName);
      if (
        parentAssociationBinding?.field
        && isAssociationField(parentAssociationBinding.field)
        && parentAssociationBinding.field.target === collectionName
      ) {
        const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
        pushFinding(targetList, seen, createFinding({
          severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
          code: 'ASSOCIATION_SPLIT_DISPLAY_BINDING_UNSTABLE',
          message: `关联展示字段不应拆成 target collection "${collectionName}" + associationPathName "${associationPathName}" + simple fieldPath "${fieldPath}"；请改为父 collection 上的完整 dotted path。`,
          path: pathValue,
          mode,
          dedupeKey: `ASSOCIATION_SPLIT_DISPLAY_BINDING_UNSTABLE:${parentCollectionName}:${collectionName}:${associationPathName}.${fieldPath}`,
          details: {
            parentCollectionName,
            collectionName,
            associationPathName,
            fieldPath,
            suggestedCollectionName: parentCollectionName,
            suggestedFieldPath: `${associationPathName}.${fieldPath}`,
          },
        }));
      }
    }

    const needsAssociationTarget = FIELD_MODELS_REQUIRING_ASSOCIATION_TARGET.has(context.use);
    const isDirectAssociationField = isSimpleBinding
      && (directField.target || directField.foreignKey || directField.type === 'belongsTo' || directField.interface === 'm2o');
    if (!needsAssociationTarget || !isDirectAssociationField) {
      return;
    }

    const targetCollectionMeta = getCollectionMeta(metadata, directField.target);
    if (!targetCollectionMeta) {
      pushFinding(warnings, seen, createFinding({
        severity: 'warning',
        code: 'ASSOCIATION_TARGET_METADATA_MISSING',
        message: `关联字段 "${fieldPath}" 的目标 collection "${directField.target}" 未提供元数据，无法校验显示字段。`,
        path: pathValue,
        mode,
        dedupeKey: `ASSOCIATION_TARGET_METADATA_MISSING:${collectionName}:${fieldPath}`,
        details: {
          collectionName,
          fieldPath,
          targetCollection: directField.target,
        },
      }));
      return;
    }

    const targetDisplayField = targetCollectionMeta.titleField || targetCollectionMeta.filterTargetKey;
    if (DIRECT_ASSOCIATION_TEXT_FIELD_MODEL_USES.has(context.use)) {
      const targetList = mode === VALIDATION_CASE_MODE ? blockers : warnings;
      pushFinding(targetList, seen, createFinding({
        severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
        code: 'ASSOCIATION_FIELD_REQUIRES_EXPLICIT_DISPLAY_MODEL',
        message: `关联字段 "${fieldPath}" 不应直接用 ${context.use} 绑定自身；请显式选择目标 collection "${directField.target}" 的稳定显示策略。`,
        path: pathValue,
        mode,
        dedupeKey: `ASSOCIATION_FIELD_REQUIRES_EXPLICIT_DISPLAY_MODEL:${collectionName}:${fieldPath}:${pathValue}`,
        details: {
          collectionName,
          fieldPath,
          targetCollection: directField.target,
          suggestedTitleField: targetDisplayField || null,
        },
      }));
    }
    if (!targetDisplayField || (targetCollectionMeta.fields.length > 0 && !targetCollectionMeta.fieldsByName.has(targetDisplayField))) {
      pushFinding(blockers, seen, createFinding({
        severity: 'blocker',
        code: 'ASSOCIATION_DISPLAY_TARGET_UNRESOLVED',
        message: `关联字段 "${fieldPath}" 的目标 collection "${directField.target}" 缺少可解析的 title/filterTargetKey 字段。`,
        path: pathValue,
        mode,
        dedupeKey: `ASSOCIATION_DISPLAY_TARGET_UNRESOLVED:${collectionName}:${fieldPath}`,
        details: {
          collectionName,
          fieldPath,
          targetCollection: directField.target,
          titleField: targetCollectionMeta.titleField,
          filterTargetKey: targetCollectionMeta.filterTargetKey,
        },
      }));
    }
  });
}

function inspectHardcodedFilterByTk(payload, mode, warnings, seen) {
  walk(payload, (node, pathValue) => {
    if (!isPlainObject(node)) {
      return;
    }

    const detailFilterByTk = node.stepParams?.resourceSettings?.init?.filterByTk;
    if (isHardcodedFilterValue(detailFilterByTk)) {
      pushFinding(warnings, seen, createFinding({
        severity: mode === VALIDATION_CASE_MODE ? 'blocker' : 'warning',
        code: 'HARDCODED_FILTER_BY_TK',
        message: 'resourceSettings.init.filterByTk 使用了硬编码样本值。',
        path: `${pathValue}.stepParams.resourceSettings.init.filterByTk`,
        mode,
        dedupeKey: `HARDCODED_FILTER_BY_TK:${pathValue}.resourceSettings`,
        details: {
          value: detailFilterByTk,
        },
      }));
    }
  });
}

function applyRiskAccept(blockers, warnings, acceptedCodes) {
  if (!acceptedCodes.length) {
    return {
      blockers,
      warnings,
      acceptedRiskCodes: [],
      ignoredRiskAcceptCodes: [],
    };
  }

  const acceptedSet = new Set(acceptedCodes);
  const downgradedWarnings = [...warnings];
  const remainingBlockers = [];
  const appliedCodes = new Set();
  const blockerCountsByCode = new Map();
  for (const blocker of blockers) {
    blockerCountsByCode.set(blocker.code, (blockerCountsByCode.get(blocker.code) ?? 0) + 1);
  }
  const ignoredCodes = new Set(
    [...acceptedSet].filter((code) => (blockerCountsByCode.get(code) ?? 0) > 1),
  );

  for (const blocker of blockers) {
    if (
      acceptedSet.has(blocker.code)
      && !ignoredCodes.has(blocker.code)
      && !NON_RISK_ACCEPTABLE_BLOCKER_CODES.has(blocker.code)
    ) {
      downgradedWarnings.push({
        ...blocker,
        severity: 'warning',
        accepted: true,
      });
      appliedCodes.add(blocker.code);
      continue;
    }
    remainingBlockers.push(blocker);
  }

  return {
    blockers: remainingBlockers,
    warnings: downgradedWarnings,
    acceptedRiskCodes: [...appliedCodes],
    ignoredRiskAcceptCodes: [...ignoredCodes].sort(),
  };
}

export function extractRequiredMetadata({ payload }) {
  const collectionRefs = [];
  const fieldRefs = [];
  const popupContextChecks = [];
  const seenCollectionRefs = new Set();
  const seenFieldRefs = new Set();
  const seenPopupChecks = new Set();

  walk(payload, (node, pathValue, context) => {
    if (!isPlainObject(node)) {
      return;
    }

    const resourceCollectionName = node.stepParams?.resourceSettings?.init?.collectionName;
    if (resourceCollectionName) {
      const dedupeKey = `${resourceCollectionName}:${pathValue}:resource`;
      if (!seenCollectionRefs.has(dedupeKey)) {
        seenCollectionRefs.add(dedupeKey);
        collectionRefs.push({
          collectionName: resourceCollectionName,
          reason: 'resourceSettings.init.collectionName',
          path: pathValue,
        });
      }
    }

    const fieldInit = node.stepParams?.fieldSettings?.init;
    if (fieldInit?.collectionName) {
      const dedupeKey = `${fieldInit.collectionName}:${pathValue}:field`;
      if (!seenCollectionRefs.has(dedupeKey)) {
        seenCollectionRefs.add(dedupeKey);
        collectionRefs.push({
          collectionName: fieldInit.collectionName,
          reason: 'fieldSettings.init.collectionName',
          path: pathValue,
        });
      }
    }

    if (context.fieldBinding?.collectionName && context.fieldBinding.fieldPath) {
      const dedupeKey = `${context.fieldBinding.collectionName}:${context.fieldBinding.fieldPath}:${pathValue}`;
      if (!seenFieldRefs.has(dedupeKey)) {
        seenFieldRefs.add(dedupeKey);
        fieldRefs.push({
          collectionName: context.fieldBinding.collectionName,
          fieldPath: context.fieldBinding.fieldPath,
          use: context.use || null,
          path: pathValue,
        });
      }
    }

    const openView = node.stepParams?.popupSettings?.openView;
    const pageNode = node.subModels?.page;
    if ((isPlainObject(openView) || pageNode) && typeof node.use === 'string' && node.use.endsWith('ActionModel')) {
      if (openView?.collectionName) {
        const dedupeKey = `${openView.collectionName}:${pathValue}:open-view`;
        if (!seenCollectionRefs.has(dedupeKey)) {
          seenCollectionRefs.add(dedupeKey);
          collectionRefs.push({
            collectionName: openView.collectionName,
            reason: 'popupSettings.openView.collectionName',
            path: pathValue,
          });
        }
      }
      const subtreeStrings = pageNode ? collectStrings(pageNode) : [];
      if (subtreeStrings.some((value) => value.includes(POPUP_INPUT_ARGS_FILTER_BY_TK))) {
        const dedupeKey = `${pathValue}:${node.use}`;
        if (!seenPopupChecks.has(dedupeKey)) {
          seenPopupChecks.add(dedupeKey);
          popupContextChecks.push({
            actionUse: node.use,
            path: pathValue,
            requiresInputArgsFilterByTk: true,
            openViewCollectionName: openView?.collectionName || null,
            hasFilterByTk: Boolean(openView?.filterByTk),
          });
        }
      }
    }
  });

  return {
    collectionRefs,
    fieldRefs,
    popupContextChecks,
  };
}

export function auditPayload({ payload, metadata = {}, mode = DEFAULT_AUDIT_MODE, riskAccept = [], requirements = {} }) {
  if (mode !== GENERAL_MODE && mode !== VALIDATION_CASE_MODE) {
    throw new Error(`Unsupported mode "${mode}"`);
  }

  const requiredMetadata = extractRequiredMetadata({ payload });
  const normalizedMetadata = normalizeMetadata(metadata);
  const normalizedRequirements = normalizeRequirements(requirements);
  const blockers = [];
  const warnings = [];
  const blockerSeen = new Set();
  const warningSeen = new Set();

  inspectRequiredMetadataCoverage(requiredMetadata, normalizedMetadata, mode, blockers, blockerSeen);
  inspectFilters(payload, normalizedMetadata, mode, blockers, blockerSeen);
  inspectFieldBindings(payload, normalizedMetadata, mode, warnings, blockers, blockerSeen);
  inspectFormBlocks(payload, mode, warnings, blockers, blockerSeen);
  inspectActionSlots(payload, mode, blockers, blockerSeen);
  inspectTabTrees(payload, mode, warnings, blockers, blockerSeen);
  inspectPopupActions(payload, normalizedMetadata, mode, warnings, blockers, blockerSeen);
  inspectDetailsBlocks(payload, mode, warnings, blockers, blockerSeen);
  inspectDeclaredRequirements(payload, mode, normalizedRequirements, blockers, blockerSeen);
  if (mode === VALIDATION_CASE_MODE) {
    inspectHardcodedFilterByTk(payload, mode, blockers, blockerSeen);
  } else {
    inspectHardcodedFilterByTk(payload, mode, warnings, warningSeen);
  }

  const applied = applyRiskAccept(blockers, warnings, riskAccept);
  const finalWarnings = [...applied.warnings];
  finalWarnings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
  const finalBlockers = [...applied.blockers];
  finalBlockers.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));

  return {
    ok: finalBlockers.length === 0,
    mode,
    blockers: finalBlockers,
    warnings: finalWarnings,
    acceptedRiskCodes: applied.acceptedRiskCodes,
    ignoredRiskAcceptCodes: applied.ignoredRiskAcceptCodes,
    metadataCoverage: {
      collectionCount: Object.keys(normalizedMetadata.collections).length,
      requiredCollectionCount: new Set(requiredMetadata.collectionRefs.map((item) => item.collectionName)).size,
    },
  };
}

function buildFilterFromFlags(flags) {
  const logic = flags.logic ? normalizeFilterLogic(flags.logic) : '$and';
  const condition = flags['condition-json']
    ? parseJson(flags['condition-json'], 'condition-json')
    : {
      path: normalizeNonEmpty(flags.path, 'path'),
      operator: normalizeNonEmpty(flags.operator, 'operator'),
      value: parseJson(flags['value-json'], 'value-json'),
    };
  return buildFilterGroup({ logic, condition });
}

function handleBuildFilter(flags) {
  const result = buildFilterFromFlags(flags);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function handleExtractRequiredMetadata(flags) {
  const payload = readJsonInput(flags['payload-json'], flags['payload-file'], 'payload');
  const result = extractRequiredMetadata({ payload });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function handleAuditPayload(flags) {
  const payload = readJsonInput(flags['payload-json'], flags['payload-file'], 'payload');
  const metadata = readJsonInput(flags['metadata-json'], flags['metadata-file'], 'metadata');
  const mode = flags.mode ? normalizeNonEmpty(flags.mode, 'mode') : DEFAULT_AUDIT_MODE;
  const riskAccept = Array.isArray(flags['risk-accept']) ? flags['risk-accept'] : [];
  const requirements = flags['requirements-json'] || flags['requirements-file']
    ? readJsonInput(flags['requirements-json'], flags['requirements-file'], 'requirements')
    : {};
  const result = auditPayload({ payload, metadata, mode, riskAccept, requirements });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = BLOCKER_EXIT_CODE;
  }
}

function main(argv) {
  try {
    const { command, flags } = parseArgs(argv);
    if (command === 'help') {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    if (command === 'build-filter') {
      handleBuildFilter(flags);
      return;
    }
    if (command === 'extract-required-metadata') {
      handleExtractRequiredMetadata(flags);
      return;
    }
    if (command === 'audit-payload') {
      handleAuditPayload(flags);
      return;
    }
    throw new Error(`Unknown command "${command}"`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const currentPath = path.resolve(fileURLToPath(import.meta.url));
if (executedPath === currentPath) {
  main(process.argv.slice(2));
}
