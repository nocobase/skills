#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GENERAL_MODE = 'general';
export const VALIDATION_CASE_MODE = 'validation-case';
export const BLOCKER_EXIT_CODE = 2;

const POPUP_INPUT_ARGS_FILTER_BY_TK = '{{ctx.view.inputArgs.filterByTk}}';

const PAGE_TAB_MODEL_USES = new Set(['RootPageTabModel', 'PageTabModel']);
const GRID_MODEL_USES = new Set(['BlockGridModel', 'FormGridModel']);
const BUSINESS_BLOCK_MODEL_USES = new Set([
  'FilterFormBlockModel',
  'TableBlockModel',
  'DetailsBlockModel',
  'CreateFormModel',
  'EditFormModel',
]);
const FILTER_CONTAINER_MODEL_USES = new Set(['TableBlockModel', 'DetailsBlockModel', 'CreateFormModel', 'EditFormModel']);
const FIELD_MODELS_REQUIRING_ASSOCIATION_TARGET = new Set([
  'TableColumnModel',
  'FilterFormItemModel',
  'FormItemModel',
  'DetailsItemModel',
  'DisplayTextFieldModel',
  'FilterFormRecordSelectFieldModel',
]);

function usage() {
  return [
    'Usage:',
    '  node scripts/flow_payload_guard.mjs build-filter (--condition-json <json> | --path <path> --operator <op> --value-json <json>) [--logic <$and|$or>]',
    '  node scripts/flow_payload_guard.mjs extract-required-metadata (--payload-json <json> | --payload-file <path>)',
    '  node scripts/flow_payload_guard.mjs audit-payload (--payload-json <json> | --payload-file <path>) (--metadata-json <json> | --metadata-file <path>) [--mode general|validation-case] [--risk-accept <CODE>]',
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

function inspectPopupActions(payload, mode, warnings, blockers, seen) {
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
      if (collectionMeta && isSimpleFieldName(item.path) && !hasTemplateExpression(item.path) && !collectionMeta.fieldsByName.has(item.path)) {
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
      }
      return;
    }

    if (looksLikeGroup && Array.isArray(item.items) && typeof item.logic === 'string') {
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
    if (!isPlainObject(node) || !context.fieldBinding?.collectionName || !context.fieldBinding.fieldPath) {
      return;
    }
    const collectionMeta = getCollectionMeta(metadata, context.fieldBinding.collectionName);
    if (!collectionMeta) {
      return;
    }

    const { fieldPath, collectionName } = context.fieldBinding;
    if (!isSimpleFieldName(fieldPath) || hasTemplateExpression(fieldPath)) {
      return;
    }

    const directField = collectionMeta.fieldsByName.get(fieldPath) || null;
    const associationFromForeignKey = collectionMeta.associationsByForeignKey.get(fieldPath) || null;

    if (!directField) {
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

    const needsAssociationTarget = FIELD_MODELS_REQUIRING_ASSOCIATION_TARGET.has(context.use);
    const isAssociationField = directField.target || directField.foreignKey || directField.type === 'belongsTo' || directField.interface === 'm2o';
    if (!needsAssociationTarget || !isAssociationField) {
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
    };
  }

  const acceptedSet = new Set(acceptedCodes);
  const downgradedWarnings = [...warnings];
  const remainingBlockers = [];
  const appliedCodes = new Set();

  for (const blocker of blockers) {
    if (acceptedSet.has(blocker.code)) {
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

export function auditPayload({ payload, metadata = {}, mode = GENERAL_MODE, riskAccept = [] }) {
  if (mode !== GENERAL_MODE && mode !== VALIDATION_CASE_MODE) {
    throw new Error(`Unsupported mode "${mode}"`);
  }

  const normalizedMetadata = normalizeMetadata(metadata);
  const blockers = [];
  const warnings = [];
  const blockerSeen = new Set();
  const warningSeen = new Set();

  inspectFilters(payload, normalizedMetadata, mode, blockers, blockerSeen);
  inspectFieldBindings(payload, normalizedMetadata, mode, warnings, blockers, blockerSeen);
  inspectPopupActions(payload, mode, warnings, blockers, blockerSeen);
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
    metadataCoverage: {
      collectionCount: Object.keys(normalizedMetadata.collections).length,
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
  const mode = flags.mode ? normalizeNonEmpty(flags.mode, 'mode') : GENERAL_MODE;
  const riskAccept = Array.isArray(flags['risk-accept']) ? flags['risk-accept'] : [];
  const result = auditPayload({ payload, metadata, mode, riskAccept });
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
