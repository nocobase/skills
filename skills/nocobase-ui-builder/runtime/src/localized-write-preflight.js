import {
  DEFAULT_AUDIT_MODE,
  auditPayload,
  canonicalizePayload,
  extractRequiredMetadata,
} from '../../scripts/flow_payload_guard.mjs';
import { collectAssignValuesValidationIssues } from './assign-values-validation.js';
import {
  isSortablePublicBlockType,
  isSortablePublicLiveUse,
  normalizeSortAliasInSettings,
  settingsSortValuesMatch,
} from './sorting-alias.js';

const LOCALIZED_WRITE_OPERATIONS = new Set(['add-block', 'add-blocks', 'compose', 'configure']);
const INTERNAL_FIELD_OBJECT_KEYS = new Set([
  'fieldComponent',
  'fieldModel',
  'componentFields',
  'use',
  'fieldUse',
  'subModels',
  'props',
  'stepParams',
]);
const TREE_CONNECT_TARGET_BLOCK_TYPES = new Set(['table', 'list', 'gridCard', 'calendar', 'kanban', 'details', 'chart', 'map', 'comments', 'tree']);
const DISPLAY_ASSOCIATION_FIELD_POPUP_REQUIRED_BLOCK_TYPES = new Set(['table', 'list', 'gridCard', 'details']);
const RELATION_FIELD_POPUP_CURRENT_RECORD_BLOCK_TYPES = new Set(['details', 'editForm']);
const RELATION_FIELD_POPUP_ASSOCIATED_RECORDS_BLOCK_TYPES = new Set(['table', 'list', 'gridCard']);
const TREE_LIVE_BLOCK_USES = new Set(['TreeBlockModel']);
const TREE_CONNECT_TARGET_LIVE_USES = new Set([
  'TableBlockModel',
  'ListBlockModel',
  'GridCardBlockModel',
  'CalendarBlockModel',
  'KanbanBlockModel',
  'DetailsBlockModel',
  'ChartBlockModel',
  'MapBlockModel',
  'CommentsBlockModel',
  'TreeBlockModel',
]);
const LIVE_UPDATE_ACTION_USES = new Set(['BulkUpdateActionModel', 'UpdateRecordActionModel']);
const PUBLIC_MAIN_BLOCK_SECTION_RULES = {
  calendar: [
    {
      slot: 'fields',
      code: 'CALENDAR_MAIN_FIELDS_UNSUPPORTED',
      message: 'calendar does not support fields[] on the main block; add event fields under the quick-create or event-view popup host instead',
    },
    {
      slot: 'fieldGroups',
      code: 'CALENDAR_MAIN_FIELD_GROUPS_UNSUPPORTED',
      message: 'calendar does not support fieldGroups[] on the main block; add grouped fields under the quick-create or event-view popup host instead',
    },
    {
      slot: 'recordActions',
      code: 'CALENDAR_MAIN_RECORD_ACTIONS_UNSUPPORTED',
      message: 'calendar does not support recordActions[] on the main block; configure event actions inside the event-view popup host instead',
    },
  ],
  kanban: [
    {
      slot: 'fieldGroups',
      code: 'KANBAN_MAIN_FIELD_GROUPS_UNSUPPORTED',
      message: 'kanban does not support fieldGroups[] on the main block; add card fields directly under fields[] instead',
    },
    {
      slot: 'recordActions',
      code: 'KANBAN_MAIN_RECORD_ACTIONS_UNSUPPORTED',
      message: 'kanban does not support recordActions[] on the main block; configure block actions only in v1',
    },
    {
      slot: 'fieldsLayout',
      code: 'KANBAN_MAIN_FIELDS_LAYOUT_UNSUPPORTED',
      message: 'kanban does not support fieldsLayout on the main block',
    },
  ],
};

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeOperation(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!LOCALIZED_WRITE_OPERATIONS.has(normalized)) {
    throw new Error(`Unsupported localized write operation "${value}". Expected one of: add-block, add-blocks, compose, configure.`);
  }
  return normalized;
}

function normalizeBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Localized write preflight requires one object body.');
  }
  return value;
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addSpecifiedHeightMode(settings) {
  if (!isObjectRecord(settings) || !Object.hasOwn(settings, 'height') || Object.hasOwn(settings, 'heightMode')) {
    return settings;
  }
  return {
    ...settings,
    heightMode: 'specifyValue',
  };
}

function normalizeWriteSettings(settings, { normalizeSortAlias = true } = {}) {
  const sortNormalized = normalizeSortAlias ? normalizeSortAliasInSettings(settings) : settings;
  return addSpecifiedHeightMode(sortNormalized);
}

function normalizeSortAliasInBlock(block) {
  if (!isObjectRecord(block) || !isSortablePublicBlockType(block.type)) {
    return block;
  }
  const settings = normalizeSortAliasInSettings(block.settings);
  return settings === block.settings ? block : { ...block, settings };
}

function normalizeHeightSettingsInPopup(popup, options = {}) {
  if (!isObjectRecord(popup) || !Array.isArray(popup.blocks)) {
    return popup;
  }
  const associationRequirement = options.relationField
    ? resolveAssociationFieldRequirement(options.metadata || {}, options.parentCollectionName, options.relationField)
    : null;
  const targetCollection = normalizeText(associationRequirement?.targetCollection);
  let changed = false;
  const blocks = popup.blocks.map((block) => {
    let nextBlock = block;
    const blockType = normalizeText(block?.type);
    const binding = getNodeBinding(block);
    const blockCollection = getBlockCollectionName(block);
    if (
      targetCollection
      && RELATION_FIELD_POPUP_CURRENT_RECORD_BLOCK_TYPES.has(blockType)
      && (!binding || binding === 'currentcollection')
      && (!blockCollection || blockCollection === targetCollection)
    ) {
      nextBlock = normalizeRelationPopupCurrentRecordBlock(block, targetCollection);
    }
    const normalizedBlock = normalizeHeightSettingsInBlock(nextBlock, {
      ...options,
      parentCollectionName: getLocalizedBlockCollectionName(nextBlock, targetCollection || options.parentCollectionName),
      relationField: '',
    });
    if (normalizedBlock !== block) changed = true;
    return normalizedBlock;
  });
  return changed ? { ...popup, blocks } : popup;
}

function normalizeHeightSettingsInPopupItem(item, options = {}) {
  if (!isObjectRecord(item) || !isObjectRecord(item.popup)) {
    return item;
  }
  const popup = normalizeHeightSettingsInPopup(item.popup, options);
  return popup === item.popup ? item : { ...item, popup };
}

function normalizeHeightSettingsInFieldGroup(group, options = {}) {
  if (!isObjectRecord(group) || !Array.isArray(group.fields)) {
    return group;
  }
  let changed = false;
  const fields = group.fields.map((field) => {
    const fieldOptions = {
      ...options,
      relationField: isObjectRecord(field) ? normalizeText(field.field) : '',
      parentCollectionName: options.parentCollectionName,
    };
    const normalizedField = normalizeHeightSettingsInPopupItem(field, fieldOptions);
    if (normalizedField !== field) changed = true;
    return normalizedField;
  });
  return changed ? { ...group, fields } : group;
}

function normalizeHeightSettingsInBlock(block, options = {}) {
  if (!isObjectRecord(block)) {
    return block;
  }

  const parentCollectionName = normalizeText(options.parentCollectionName);
  const blockCollectionName = getLocalizedBlockCollectionName(block, parentCollectionName);
  let nextBlock = normalizeSortAliasInBlock(block);
  const settings = normalizeWriteSettings(nextBlock.settings);
  if (settings !== block.settings) {
    nextBlock = { ...nextBlock, settings };
  }

  if (Array.isArray(block.blocks)) {
    let changed = false;
    const blocks = block.blocks.map((child) => {
      const normalizedChild = normalizeHeightSettingsInBlock(child, {
        ...options,
        parentCollectionName: blockCollectionName,
        relationField: '',
      });
      if (normalizedChild !== child) changed = true;
      return normalizedChild;
    });
    if (changed) nextBlock = { ...nextBlock, blocks };
  }

  if (isObjectRecord(block.popup)) {
    const popup = normalizeHeightSettingsInPopup(block.popup, {
      ...options,
      parentCollectionName: blockCollectionName,
      relationField: '',
    });
    if (popup !== block.popup) nextBlock = { ...nextBlock, popup };
  }

  for (const slot of ['actions', 'recordActions', 'fields']) {
    if (!Array.isArray(block[slot])) continue;
    let changed = false;
    const items = block[slot].map((item) => {
      const itemOptions = {
        ...options,
        parentCollectionName: blockCollectionName,
        relationField: slot === 'fields' && isObjectRecord(item) ? normalizeText(item.field) : '',
      };
      const normalizedItem = normalizeHeightSettingsInPopupItem(item, itemOptions);
      if (normalizedItem !== item) changed = true;
      return normalizedItem;
    });
    if (changed) nextBlock = { ...nextBlock, [slot]: items };
  }

  if (Array.isArray(block.fieldGroups)) {
    let changed = false;
    const fieldGroups = block.fieldGroups.map((group) => {
      const normalizedGroup = normalizeHeightSettingsInFieldGroup(group, {
        ...options,
        parentCollectionName: blockCollectionName,
      });
      if (normalizedGroup !== group) changed = true;
      return normalizedGroup;
    });
    if (changed) nextBlock = { ...nextBlock, fieldGroups };
  }

  return nextBlock;
}

function normalizeHeightSettingsForWrite(operation, payload, metadata = {}) {
  if (!isObjectRecord(payload)) return payload;
  if (operation === 'configure') {
    if (!isObjectRecord(payload.changes)) return payload;
    const targetEntry = getLiveTopologyEntry(metadata, payload?.target?.uid);
    const changes = normalizeWriteSettings(payload.changes, {
      normalizeSortAlias: isSortablePublicLiveUse(getLiveEntryUse(targetEntry)),
    });
    return changes === payload.changes ? payload : { ...payload, changes };
  }

  if (operation === 'add-block') {
    return normalizeHeightSettingsInBlock(payload, { metadata });
  }

  if (operation === 'add-blocks' || operation === 'compose') {
    if (!Array.isArray(payload.blocks)) return payload;
    let changed = false;
    const blocks = payload.blocks.map((block) => {
      const normalizedBlock = normalizeHeightSettingsInBlock(block, { metadata });
      if (normalizedBlock !== block) changed = true;
      return normalizedBlock;
    });
    return changed ? { ...payload, blocks } : payload;
  }

  return payload;
}

function normalizeMetadata(value) {
  if (typeof value === 'undefined' || value === null) {
    return {};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('collectionMetadata must be one object when provided.');
  }
  return value;
}

function normalizeFilterTargetKeyValue(value) {
  if (Array.isArray(value)) {
    return normalizeText(value[0]);
  }
  return normalizeText(value);
}

function normalizeCollectionField(field) {
  if (!field || typeof field !== 'object' || Array.isArray(field)) {
    return null;
  }
  const options = field.options && typeof field.options === 'object' && !Array.isArray(field.options)
    ? field.options
    : {};
  const name = normalizeText(field.name) || normalizeText(field.field) || normalizeText(field.key) || normalizeText(options.name);
  if (!name) return null;
  return {
    name,
    interface: normalizeText(field.interface) || normalizeText(options.interface),
    type: normalizeText(field.type) || normalizeText(options.type),
    target: normalizeText(field.target) || normalizeText(field.targetCollection) || normalizeText(options.target),
    foreignKey: normalizeText(field.foreignKey) || normalizeText(options.foreignKey),
    targetKey: normalizeText(field.targetKey) || normalizeText(options.targetKey),
  };
}

function getCollectionMeta(metadata, collectionName) {
  const normalizedCollectionName = normalizeText(collectionName);
  if (!normalizedCollectionName) return null;
  const rawCollections = metadata?.collections;
  let rawCollection = null;
  if (Array.isArray(rawCollections)) {
    rawCollection = rawCollections.find((entry) => normalizeText(entry?.name || entry?.data?.name) === normalizedCollectionName) || null;
  } else if (rawCollections && typeof rawCollections === 'object') {
    rawCollection = rawCollections[normalizedCollectionName] || null;
  }
  const source = rawCollection?.data && typeof rawCollection.data === 'object' && !Array.isArray(rawCollection.data)
    ? rawCollection.data
    : rawCollection;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const options = source.options && typeof source.options === 'object' && !Array.isArray(source.options)
    ? source.options
    : {};
  const values = source.values && typeof source.values === 'object' && !Array.isArray(source.values)
    ? source.values
    : {};
  const fields = Array.isArray(source.fields) ? source.fields.map(normalizeCollectionField).filter(Boolean) : [];
  return {
    name: normalizedCollectionName,
    titleField: normalizeText(source.titleField) || normalizeText(values.titleField) || normalizeText(options.titleField),
    filterTargetKey:
      normalizeFilterTargetKeyValue(source.filterTargetKey)
      || normalizeFilterTargetKeyValue(values.filterTargetKey)
      || normalizeFilterTargetKeyValue(options.filterTargetKey),
    fields,
    fieldsByName: new Map(fields.map((field) => [field.name, field])),
  };
}

function getCollectionFilterTargetKey(collectionMeta) {
  return normalizeFilterTargetKeyValue(collectionMeta?.filterTargetKey) || 'id';
}

function isAssociationField(field) {
  return !!field && Boolean(
    normalizeText(field.target)
    || ['belongsto', 'hasmany', 'hasone', 'belongstomany'].includes(normalizeText(field.type).toLowerCase())
    || ['m2o', 'o2m', 'oho', 'obo', 'm2m'].includes(normalizeText(field.interface).toLowerCase()),
  );
}

function getDefaultsAssociationFieldKey(associationField) {
  return normalizeText(associationField).split('.')[0] || '';
}

function resolveFieldPathInMetadata(metadata, collectionName, fieldPath) {
  const segments = normalizeText(fieldPath).split('.').filter(Boolean);
  let currentCollectionName = normalizeText(collectionName);
  let field = null;
  if (!currentCollectionName || segments.length === 0) return null;
  for (const [index, segment] of segments.entries()) {
    const collectionMeta = getCollectionMeta(metadata, currentCollectionName);
    if (!collectionMeta) return null;
    field = collectionMeta.fieldsByName.get(segment) || null;
    if (!field) return null;
    if (index < segments.length - 1) {
      if (!isAssociationField(field) || !normalizeText(field.target)) return null;
      currentCollectionName = normalizeText(field.target);
    }
  }
  return {
    collectionName: normalizeText(field?.target || currentCollectionName),
    field,
  };
}

function resolveCollectionFilterTargetField(metadata, collectionName) {
  const collectionMeta = getCollectionMeta(metadata, collectionName);
  if (!collectionMeta) return null;
  const key = getCollectionFilterTargetKey(collectionMeta);
  const field = collectionMeta.fieldsByName.get(key) || null;
  if (field) {
    return { fieldPath: key, field };
  }
  if (key === 'id') {
    return { fieldPath: key, field: { name: 'id', type: 'bigInt', interface: 'integer' } };
  }
  return null;
}

function treeConnectFilterPathExists(metadata, collectionName, fieldPath) {
  const normalizedFieldPath = normalizeText(fieldPath);
  if (!normalizedFieldPath) return false;
  const collectionMeta = getCollectionMeta(metadata, collectionName);
  if (!collectionMeta) return true;
  if (normalizedFieldPath === 'id' || normalizedFieldPath === getCollectionFilterTargetKey(collectionMeta)) {
    return true;
  }
  return !!resolveFieldPathInMetadata(metadata, collectionName, normalizedFieldPath);
}

function normalizeTreeConnectValueKind(field) {
  const type = normalizeText(field?.type).toLowerCase();
  const fieldInterface = normalizeText(field?.interface).toLowerCase();
  if (
    ['bigint', 'biginteger', 'integer', 'int', 'number', 'float', 'double', 'decimal', 'real'].includes(type)
    || ['bigint', 'integer', 'number', 'percent'].includes(fieldInterface)
  ) {
    return 'number';
  }
  if (
    ['string', 'text', 'uid', 'uuid', 'varchar', 'char'].includes(type)
    || ['input', 'textarea', 'select', 'radiogroup', 'url', 'email', 'phone'].includes(fieldInterface)
  ) {
    return 'string';
  }
  if (
    ['date', 'datetime', 'time'].includes(type)
    || ['date', 'datetime', 'dateonly', 'time'].includes(fieldInterface)
  ) {
    return 'date';
  }
  if (
    ['boolean', 'bool'].includes(type)
    || ['checkbox', 'boolean'].includes(fieldInterface)
  ) {
    return 'boolean';
  }
  return '';
}

function getLiveTopologyEntry(metadata, uid) {
  const normalizedUid = normalizeText(uid);
  if (!normalizedUid) return null;
  const topology = metadata?.liveTopology || metadata?.liveFlowTopology || metadata?.liveTreeTopology;
  if (!topology || typeof topology !== 'object' || Array.isArray(topology)) return null;
  const rawByUid = topology.byUid && typeof topology.byUid === 'object' && !Array.isArray(topology.byUid)
    ? topology.byUid
    : topology;
  const entry = rawByUid?.[normalizedUid];
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) return entry;
  if (Array.isArray(topology.entries)) {
    return topology.entries.find((item) => normalizeText(item?.uid) === normalizedUid) || null;
  }
  return null;
}

function getLiveEntryCollectionName(entry) {
  return (
    normalizeText(entry?.collectionName)
    || normalizeText(entry?.resource?.collectionName)
    || normalizeText(entry?.resourceInit?.collectionName)
    || normalizeText(entry?.stepParams?.resourceSettings?.init?.collectionName)
  );
}

function getLiveEntryParentUid(entry) {
  return (
    normalizeText(entry?.parentUid)
    || normalizeText(entry?.parentId)
    || normalizeText(entry?.parent?.uid)
    || normalizeText(entry?.parent?.id)
  );
}

function getLiveEntryTitleField(entry) {
  return (
    normalizeText(entry?.titleField)
    || normalizeText(entry?.props?.fieldNames?.title)
    || normalizeText(entry?.stepParams?.treeSettings?.titleField?.titleField)
  );
}

function getLiveEntryUse(entry) {
  return normalizeText(entry?.use) || normalizeText(entry?.type) || normalizeText(entry?.model);
}

function getBlockCollectionName(block) {
  return (
    normalizeText(block?.collection)
    || normalizeText(block?.resource?.collectionName)
    || normalizeText(block?.resource?.collection)
    || normalizeText(block?.resourceInit?.collectionName)
    || normalizeText(block?.resourceInit?.collection)
  );
}

function getNodeBinding(node) {
  return normalizeText(
    node?.binding
    || node?.resource?.binding
    || node?.resource?.resourceBinding,
  ).toLowerCase();
}

function getNodeAssociationField(node) {
  return normalizeText(
    node?.associationField
    || node?.associationPathName
    || node?.resource?.associationField
    || node?.resource?.associationPathName,
  );
}

function getLocalizedBlockCollectionName(block, parentCollectionName = '') {
  return getBlockCollectionName(block) || normalizeText(parentCollectionName);
}

function resolveAssociationFieldRequirement(metadata, sourceCollectionName, fieldPath) {
  const canonicalAssociationField = getDefaultsAssociationFieldKey(fieldPath);
  if (!sourceCollectionName || !canonicalAssociationField) return null;
  const resolved = resolveFieldPathInMetadata(metadata, sourceCollectionName, canonicalAssociationField);
  if (!isAssociationField(resolved?.field)) return null;
  const targetCollection = normalizeText(resolved?.field?.target);
  if (!targetCollection) return null;
  return {
    associationField: canonicalAssociationField,
    targetCollection,
  };
}

function normalizeRelationPopupCurrentRecordBlock(block, targetCollection) {
  const blockResource = isObjectRecord(block.resource) ? block.resource : null;
  if (!blockResource && Object.hasOwn(block, 'binding')) {
    return {
      ...block,
      binding: 'currentRecord',
    };
  }
  const resource = {
    ...(blockResource || {}),
    binding: 'currentRecord',
  };
  if (targetCollection && !normalizeText(resource.collectionName) && !normalizeText(block.collection)) {
    resource.collectionName = targetCollection;
  }
  return {
    ...block,
    resource,
  };
}

function getActionType(item) {
  return typeof item === 'string'
    ? normalizeText(item).toLowerCase()
    : isObjectRecord(item)
      ? normalizeText(item.type).toLowerCase()
      : '';
}

function hasAssignValues(item) {
  return isObjectRecord(item?.settings) && Object.hasOwn(item.settings, 'assignValues');
}

function getBlockTitleField(block) {
  return normalizeText(block?.settings?.titleField) || normalizeText(block?.settings?.fieldNames?.title);
}

function collectBlocksByKey(blocks) {
  const map = new Map();
  if (!Array.isArray(blocks)) return map;
  blocks.forEach((block) => {
    const key = normalizeText(block?.key);
    if (key) map.set(key, block);
  });
  return map;
}

function forEachLocalizedChildBlockContainer(block, path, visitContainer) {
  if (!isObjectRecord(block)) return;

  if (Array.isArray(block.blocks)) {
    visitContainer(block.blocks, `${path}.blocks`);
  }
  if (Array.isArray(block.popup?.blocks)) {
    visitContainer(block.popup.blocks, `${path}.popup.blocks`);
  }

  for (const slot of ['actions', 'recordActions', 'fields']) {
    if (!Array.isArray(block[slot])) continue;
    block[slot].forEach((item, index) => {
      if (Array.isArray(item?.popup?.blocks)) {
        visitContainer(item.popup.blocks, `${path}.${slot}[${index}].popup.blocks`);
      }
    });
  }

  if (Array.isArray(block.fieldGroups)) {
    block.fieldGroups.forEach((group, groupIndex) => {
      if (!Array.isArray(group?.fields)) return;
      group.fields.forEach((field, fieldIndex) => {
        if (Array.isArray(field?.popup?.blocks)) {
          visitContainer(field.popup.blocks, `${path}.fieldGroups[${groupIndex}].fields[${fieldIndex}].popup.blocks`);
        }
      });
    });
  }
}

function pushUniqueRef(refs, seen, { collectionName, path, reason }) {
  const normalizedName = normalizeText(collectionName);
  if (!normalizedName) return;
  const dedupeKey = `${normalizedName}:${path}:${reason}`;
  if (seen.has(dedupeKey)) return;
  seen.add(dedupeKey);
  refs.push({
    collectionName: normalizedName,
    path,
    reason,
  });
}

function collectLocalizedTreeConnectCollectionRefs(payload, operation, metadata) {
  const refs = [];
  const seen = new Set();

  const push = (collectionName, path, reason) => pushUniqueRef(refs, seen, { collectionName, path, reason });

  const visitBlock = (block, path, siblingBlocksByKey) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return;
    if (normalizeText(block.type) === 'tree' && Object.hasOwn(block.settings || {}, 'connectFields')) {
      push(getBlockCollectionName(block), path, 'tree-connect-source');
      if (Array.isArray(block.settings.connectFields?.targets)) {
        block.settings.connectFields.targets.forEach((target, targetIndex) => {
          if (!target || typeof target !== 'object' || Array.isArray(target)) return;
          const sameRunTarget = normalizeText(target.target);
          const liveTarget = normalizeText(target.targetId) || normalizeText(target.targetBlockUid);
          if (sameRunTarget) {
            push(
              getBlockCollectionName(siblingBlocksByKey.get(sameRunTarget)),
              `${path}.settings.connectFields.targets[${targetIndex}].target`,
              'tree-connect-target',
            );
          } else if (liveTarget) {
            push(
              getLiveEntryCollectionName(getLiveTopologyEntry(metadata, liveTarget)),
              `${path}.settings.connectFields.targets[${targetIndex}].${normalizeText(target.targetId) ? 'targetId' : 'targetBlockUid'}`,
              'tree-connect-target',
            );
          }
        });
      }
    }
    forEachLocalizedChildBlockContainer(block, path, (blocks, blocksPath) => {
      const childBlocksByKey = collectBlocksByKey(blocks);
      blocks.forEach((child, index) => visitBlock(child, `${blocksPath}[${index}]`, childBlocksByKey));
    });
  };

  if (Array.isArray(payload?.blocks)) {
    const siblingBlocksByKey = collectBlocksByKey(payload.blocks);
    payload.blocks.forEach((block, index) => visitBlock(block, `$.blocks[${index}]`, siblingBlocksByKey));
  } else {
    visitBlock(payload, '$', collectBlocksByKey([payload]));
  }

  if (operation === 'configure' && Object.hasOwn(payload?.changes || {}, 'connectFields')) {
    const treeEntry = getLiveTopologyEntry(metadata, normalizeText(payload?.target?.uid));
    push(getLiveEntryCollectionName(treeEntry), '$.target.uid', 'tree-connect-source');
    if (Array.isArray(payload.changes.connectFields?.targets)) {
      payload.changes.connectFields.targets.forEach((target, targetIndex) => {
        if (!target || typeof target !== 'object' || Array.isArray(target)) return;
        const liveTarget = normalizeText(target.targetId) || normalizeText(target.targetBlockUid);
        if (!liveTarget) return;
        push(
          getLiveEntryCollectionName(getLiveTopologyEntry(metadata, liveTarget)),
          `$.changes.connectFields.targets[${targetIndex}].${normalizeText(target.targetId) ? 'targetId' : 'targetBlockUid'}`,
          'tree-connect-target',
        );
      });
    }
  }

  return refs;
}

function toKebabCase(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toRuleId(finding) {
  if (finding?.code === 'REQUIRED_COLLECTION_METADATA_MISSING') {
    return 'missing-collection-metadata';
  }
  return toKebabCase(finding?.code || 'unknown-preflight-issue') || 'unknown-preflight-issue';
}

function summarizeCollectionRefs(requiredMetadata) {
  const uniqueNames = [...new Set((requiredMetadata?.collectionRefs || []).map((item) => normalizeText(item.collectionName)).filter(Boolean))];
  return uniqueNames.sort();
}

function collectLocalizedCollectionRefs(payload) {
  const refs = [];
  const seen = new Set();

  const push = (collectionName, path) => {
    const normalizedName = normalizeText(collectionName);
    if (!normalizedName) return;
    const dedupeKey = `${normalizedName}:${path}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    refs.push({
      collectionName: normalizedName,
      path,
      reason: 'localized-public-resource',
    });
  };

  const visitBlock = (block, path) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      return;
    }
    push(block?.resource?.collectionName, `${path}.resource.collectionName`);
    push(block?.resourceInit?.collectionName, `${path}.resourceInit.collectionName`);
    forEachLocalizedChildBlockContainer(block, path, (blocks, blocksPath) => {
      blocks.forEach((child, index) => visitBlock(child, `${blocksPath}[${index}]`));
    });
  };

  if (Array.isArray(payload?.blocks)) {
    payload.blocks.forEach((block, index) => visitBlock(block, `$.blocks[${index}]`));
  } else {
    visitBlock(payload, '$');
  }

  return refs;
}

function collectLocalizedAssignValuesCollectionRefs(payload, operation, metadata) {
  const refs = [];
  const seen = new Set();
  const push = (collectionName, path) => pushUniqueRef(refs, seen, {
    collectionName,
    path,
    reason: 'assign-values',
  });

  const visitActions = (items, path, collectionName) => {
    if (!Array.isArray(items)) return;
    items.forEach((item, index) => {
      if (hasAssignValues(item)) {
        push(collectionName, `${path}[${index}].settings.assignValues`);
      }
      if (Array.isArray(item?.popup?.blocks)) {
        item.popup.blocks.forEach((block, blockIndex) => visitBlock(
          block,
          `${path}[${index}].popup.blocks[${blockIndex}]`,
          collectionName,
        ));
      }
    });
  };

  const visitFieldPopups = (items, path, collectionName) => {
    if (!Array.isArray(items)) return;
    items.forEach((item, index) => {
      if (Array.isArray(item?.popup?.blocks)) {
        item.popup.blocks.forEach((block, blockIndex) => visitBlock(
          block,
          `${path}[${index}].popup.blocks[${blockIndex}]`,
          collectionName,
        ));
      }
    });
  };

  const visitBlock = (block, path, parentCollectionName = '') => {
    if (!isObjectRecord(block)) return;
    const collectionName = getLocalizedBlockCollectionName(block, parentCollectionName);
    visitActions(block.actions, `${path}.actions`, collectionName);
    visitActions(block.recordActions, `${path}.recordActions`, collectionName);
    visitFieldPopups(block.fields, `${path}.fields`, collectionName);
    if (Array.isArray(block.fieldGroups)) {
      block.fieldGroups.forEach((group, groupIndex) => {
        visitFieldPopups(group?.fields, `${path}.fieldGroups[${groupIndex}].fields`, collectionName);
      });
    }
    if (Array.isArray(block.blocks)) {
      block.blocks.forEach((child, index) => visitBlock(child, `${path}.blocks[${index}]`, collectionName));
    }
    if (Array.isArray(block.popup?.blocks)) {
      block.popup.blocks.forEach((child, index) => visitBlock(child, `${path}.popup.blocks[${index}]`, collectionName));
    }
  };

  if (Array.isArray(payload?.blocks)) {
    payload.blocks.forEach((block, index) => visitBlock(block, `$.blocks[${index}]`));
  } else {
    visitBlock(payload, '$');
  }

  if (operation === 'configure' && Object.hasOwn(payload?.changes || {}, 'assignValues')) {
    const targetEntry = getLiveTopologyEntry(metadata, payload?.target?.uid);
    const targetCollection = getLiveEntryCollectionName(targetEntry);
    const parentCollection = targetCollection
      || getLiveEntryCollectionName(getLiveTopologyEntry(metadata, getLiveEntryParentUid(targetEntry)));
    push(parentCollection, '$.changes.assignValues');
  }

  return refs;
}

function summarizeSurfaceFacts(payload) {
  const blockTypes = [];
  const directBlockTypes = [];

  const visitBlock = (block) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      return;
    }
    const type = normalizeText(block.type);
    if (type) {
      blockTypes.push(type);
      if (!block.template) {
        directBlockTypes.push(type);
      }
    }
    if (Array.isArray(block.blocks)) {
      block.blocks.forEach(visitBlock);
    }
    if (Array.isArray(block.popup?.blocks)) {
      block.popup.blocks.forEach(visitBlock);
    }
    ['actions', 'recordActions', 'fields', 'fieldGroups'].forEach((slot) => {
      const items = Array.isArray(block[slot]) ? block[slot] : [];
      items.forEach((item) => {
        if (Array.isArray(item?.fields)) {
          item.fields.forEach(visitBlock);
        }
        if (Array.isArray(item?.popup?.blocks)) {
          item.popup.blocks.forEach(visitBlock);
        }
      });
    });
  };

  if (Array.isArray(payload?.blocks)) {
    payload.blocks.forEach(visitBlock);
  } else if (payload && typeof payload === 'object' && !Array.isArray(payload) && (payload.type || payload.template)) {
    visitBlock(payload);
  }

  return {
    blockTypes: [...new Set(blockTypes)],
    directBlockTypes: [...new Set(directBlockTypes)],
  };
}

function normalizeFinding(finding) {
  return {
    path: finding?.path || '$',
    ruleId: toRuleId(finding),
    message: finding?.message || 'Unknown preflight issue.',
    ...(finding?.code ? { code: finding.code } : {}),
    ...(finding?.details ? { details: finding.details } : {}),
  };
}

function collectLocalizedMainBlockSectionErrors(payload) {
  const errors = [];

  const visitBlock = (block, path) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      return;
    }

    const type = normalizeText(block.type);
    if (type && !block.template && PUBLIC_MAIN_BLOCK_SECTION_RULES[type]) {
      for (const rule of PUBLIC_MAIN_BLOCK_SECTION_RULES[type]) {
        if (rule.slot === 'fieldsLayout') {
          if (typeof block.fieldsLayout !== 'undefined') {
            errors.push({
              path: `${path}.fieldsLayout`,
              ruleId: toRuleId({ code: rule.code }),
              message: rule.message,
              code: rule.code,
            });
          }
          continue;
        }

        if (Array.isArray(block[rule.slot]) && block[rule.slot].length > 0) {
          errors.push({
            path: `${path}.${rule.slot}`,
            ruleId: toRuleId({ code: rule.code }),
            message: rule.message,
            code: rule.code,
          });
        }
      }
    }

    if (Array.isArray(block.blocks)) {
      block.blocks.forEach((child, index) => visitBlock(child, `${path}.blocks[${index}]`));
    }
    if (Array.isArray(block.popup?.blocks)) {
      block.popup.blocks.forEach((child, index) => visitBlock(child, `${path}.popup.blocks[${index}]`));
    }
  };

  if (Array.isArray(payload?.blocks)) {
    payload.blocks.forEach((block, index) => visitBlock(block, `$.blocks[${index}]`));
    return errors;
  }

  visitBlock(payload, '$');
  return errors;
}

function collectLocalizedPublicFieldObjectErrors(payload) {
  const errors = [];

  const visitFields = (fields, path) => {
    if (!Array.isArray(fields)) return;
    fields.forEach((field, index) => {
      if (!field || typeof field !== 'object' || Array.isArray(field)) return;
      const forbidden = Object.keys(field).filter((key) => INTERNAL_FIELD_OBJECT_KEYS.has(key));
      if (forbidden.length) {
        errors.push({
          path: `${path}[${index}]`,
          ruleId: 'internal-field-keys-not-public',
          message: `Field objects must use flat fieldType/fields/titleField only; remove internal keys: ${forbidden.join(', ')}.`,
          code: 'INTERNAL_FIELD_KEYS_NOT_PUBLIC',
          details: { keys: forbidden },
        });
      }
    });
  };

  const visitBlock = (block, path) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return;
    visitFields(block.fields, `${path}.fields`);
    if (Array.isArray(block.fieldGroups)) {
      block.fieldGroups.forEach((group, groupIndex) => {
        if (!group || typeof group !== 'object' || Array.isArray(group)) return;
        visitFields(group.fields, `${path}.fieldGroups[${groupIndex}].fields`);
      });
    }
    if (Array.isArray(block.blocks)) {
      block.blocks.forEach((child, index) => visitBlock(child, `${path}.blocks[${index}]`));
    }
    if (Array.isArray(block.popup?.blocks)) {
      block.popup.blocks.forEach((child, index) => visitBlock(child, `${path}.popup.blocks[${index}]`));
    }
  };

  if (Array.isArray(payload?.blocks)) {
    payload.blocks.forEach((block, index) => visitBlock(block, `$.blocks[${index}]`));
  } else {
    visitBlock(payload, '$');
  }
  return errors;
}

function collectLocalizedRelationPopupResourceErrors(payload, metadata = {}) {
  const errors = [];

  const push = (path, ruleId, message, code, details) => {
    errors.push({
      path,
      ruleId,
      message,
      code,
      ...(details ? { details } : {}),
    });
  };

  const validateRelationPopup = (item, itemPath, parentCollectionName) => {
    if (!isObjectRecord(item) || !isObjectRecord(item.popup) || !Array.isArray(item.popup.blocks)) return;
    const relationField = normalizeText(item.field);
    if (!relationField || relationField.includes('.')) return;
    const associationRequirement = resolveAssociationFieldRequirement(metadata, parentCollectionName, relationField);
    const canonicalAssociationField = associationRequirement?.associationField || getDefaultsAssociationFieldKey(relationField);
    const targetCollection = normalizeText(associationRequirement?.targetCollection);

    item.popup.blocks.forEach((block, blockIndex) => {
      if (!isObjectRecord(block)) return;
      const blockType = normalizeText(block.type);
      const blockPath = `${itemPath}.popup.blocks[${blockIndex}]`;
      const binding = getNodeBinding(block);
      const blockCollection = getBlockCollectionName(block);

      if (RELATION_FIELD_POPUP_CURRENT_RECORD_BLOCK_TYPES.has(blockType)) {
        if ((!binding || binding === 'currentcollection') && !targetCollection) {
          push(
            `${blockPath}.resource.binding`,
            'relation-popup-current-record-target-unresolved',
            `Relation field popup ${blockType} blocks must use resource.binding="currentRecord" and a target collection that can be verified from collection metadata.`,
            'RELATION_POPUP_CURRENT_RECORD_TARGET_UNRESOLVED',
            { collectionName: parentCollectionName, associationField: canonicalAssociationField },
          );
          return;
        }
        if (targetCollection && blockCollection && blockCollection !== targetCollection) {
          push(
            `${blockPath}.resource.collectionName`,
            'relation-popup-current-record-target-mismatch',
            `Relation field popup ${blockType} blocks must target collection "${targetCollection}" for relation field "${canonicalAssociationField}".`,
            'RELATION_POPUP_CURRENT_RECORD_TARGET_MISMATCH',
            { expectedCollectionName: targetCollection, actualCollectionName: blockCollection },
          );
          return;
        }
        if (binding && binding !== 'currentcollection' && binding !== 'currentrecord') {
          push(
            `${blockPath}.resource.binding`,
            'relation-popup-current-record-binding-required',
            `Relation field popup ${blockType} blocks must use resource.binding="currentRecord" for the clicked related record.`,
            'RELATION_POPUP_CURRENT_RECORD_BINDING_REQUIRED',
          );
        }
        return;
      }

      if (RELATION_FIELD_POPUP_ASSOCIATED_RECORDS_BLOCK_TYPES.has(blockType)) {
        if (binding !== 'associatedrecords') {
          push(
            `${blockPath}.resource.binding`,
            'relation-popup-associated-records-binding-required',
            `Relation field popup ${blockType} blocks must use resource.binding="associatedRecords" with resource.associationField="${canonicalAssociationField}".`,
            'RELATION_POPUP_ASSOCIATED_RECORDS_BINDING_REQUIRED',
          );
          return;
        }
        const blockAssociationField = getDefaultsAssociationFieldKey(getNodeAssociationField(block));
        if (canonicalAssociationField && blockAssociationField !== canonicalAssociationField) {
          push(
            `${blockPath}.resource.associationField`,
            'relation-popup-associated-records-association-field-required',
            `Relation field popup associatedRecords blocks must set resource.associationField="${canonicalAssociationField}".`,
            'RELATION_POPUP_ASSOCIATED_RECORDS_ASSOCIATION_FIELD_REQUIRED',
            { expectedAssociationField: canonicalAssociationField, actualAssociationField: blockAssociationField },
          );
        }
      }
    });
  };

  const visitFields = (fields, path, parentCollectionName) => {
    if (!Array.isArray(fields)) return;
    fields.forEach((field, index) => validateRelationPopup(field, `${path}[${index}]`, parentCollectionName));
  };

  const visitBlock = (block, path, parentCollectionName = '') => {
    if (!isObjectRecord(block)) return;
    const blockType = normalizeText(block.type);
    const collectionName = getLocalizedBlockCollectionName(block, parentCollectionName);
    if (DISPLAY_ASSOCIATION_FIELD_POPUP_REQUIRED_BLOCK_TYPES.has(blockType)) {
      visitFields(block.fields, `${path}.fields`, collectionName);
      if (Array.isArray(block.fieldGroups)) {
        block.fieldGroups.forEach((group, groupIndex) => {
          visitFields(group?.fields, `${path}.fieldGroups[${groupIndex}].fields`, collectionName);
        });
      }
    }
    forEachLocalizedChildBlockContainer(block, path, (blocks, blocksPath) => {
      blocks.forEach((child, index) => visitBlock(child, `${blocksPath}[${index}]`, collectionName));
    });
  };

  if (Array.isArray(payload?.blocks)) {
    payload.blocks.forEach((block, index) => visitBlock(block, `$.blocks[${index}]`));
  } else {
    visitBlock(payload, '$');
  }

  return errors;
}

function collectLocalizedSortAliasErrors(payload, operation, metadata = {}) {
  const errors = [];

  const validateSettings = (settings, path) => {
    if (!isObjectRecord(settings) || !Object.hasOwn(settings, 'sort') || !Object.hasOwn(settings, 'sorting')) {
      return;
    }
    if (settingsSortValuesMatch(settings.sort, settings.sorting)) {
      return;
    }
    errors.push({
      path: `${path}.sort`,
      ruleId: 'settings-sort-sorting-conflict',
      message: 'settings.sort is a compatibility alias for settings.sorting; when both are present they must describe the same ordering.',
      code: 'SETTINGS_SORT_SORTING_CONFLICT',
    });
  };

  const visitBlock = (block, path) => {
    if (!isObjectRecord(block)) return;
    if (isSortablePublicBlockType(block.type)) {
      validateSettings(block.settings, `${path}.settings`);
    }
    forEachLocalizedChildBlockContainer(block, path, (blocks, blocksPath) => {
      blocks.forEach((child, index) => visitBlock(child, `${blocksPath}[${index}]`));
    });
  };

  if (operation === 'configure') {
    const targetEntry = getLiveTopologyEntry(metadata, payload?.target?.uid);
    if (isSortablePublicLiveUse(getLiveEntryUse(targetEntry))) {
      validateSettings(payload?.changes, '$.changes');
    }
  }

  if (Array.isArray(payload?.blocks)) {
    payload.blocks.forEach((block, index) => visitBlock(block, `$.blocks[${index}]`));
  } else {
    visitBlock(payload, '$');
  }

  return errors;
}

function validateTreeConnectFieldsValue(connectFields, connectFieldsPath, errors, {
  shouldAllowSameRunTarget,
  missingTargetMessage,
  metadata,
  treeCollection,
  titleField,
  sourceEntry,
  sourcePath,
  resolveTargetContext,
}) {
  if (!connectFields || typeof connectFields !== 'object' || Array.isArray(connectFields)) {
    errors.push({
      path: connectFieldsPath,
      ruleId: 'tree-connect-fields-invalid',
      message: 'tree settings.connectFields must be one object.',
      code: 'TREE_CONNECT_FIELDS_INVALID',
    });
    return;
  }
  if (!Array.isArray(connectFields.targets)) {
    errors.push({
      path: `${connectFieldsPath}.targets`,
      ruleId: 'tree-connect-targets-invalid',
      message: 'tree settings.connectFields.targets must be an array.',
      code: 'TREE_CONNECT_TARGETS_INVALID',
    });
    return;
  }
  if (sourceEntry && !TREE_LIVE_BLOCK_USES.has(getLiveEntryUse(sourceEntry))) {
    errors.push({
      path: sourcePath || connectFieldsPath,
      ruleId: 'tree-connect-source-not-tree',
      message: 'localized configure changes.connectFields target must be an existing tree block.',
      code: 'TREE_CONNECT_SOURCE_NOT_TREE',
    });
    return;
  }
  if (!treeCollection) {
    errors.push({
      path: sourcePath || connectFieldsPath,
      ruleId: 'tree-connect-source-unknown',
      message: 'tree connectFields validation requires source tree live topology with collectionName.',
      code: 'TREE_CONNECT_SOURCE_UNKNOWN',
    });
    return;
  }
  if (!getCollectionMeta(metadata, treeCollection)) {
    errors.push({
      path: sourcePath || connectFieldsPath,
      ruleId: 'missing-collection-metadata',
      message: `collectionMetadata is required for collection "${treeCollection}" before this localized tree connectFields write.`,
      code: 'REQUIRED_COLLECTION_METADATA_MISSING',
      details: {
        collectionName: treeCollection,
        path: sourcePath || connectFieldsPath,
        reason: 'tree-connect-source',
      },
    });
  }

  const seenTargetKeys = new Set();
  connectFields.targets.forEach((target, index) => {
    const targetPath = `${connectFieldsPath}.targets[${index}]`;
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      errors.push({
        path: targetPath,
        ruleId: 'tree-connect-target-invalid',
        message: 'Each tree connectFields target must be one object.',
        code: 'TREE_CONNECT_TARGET_INVALID',
      });
      return;
    }

    const liveTarget = normalizeText(target.targetId) || normalizeText(target.targetBlockUid);
    const sameRunTarget = normalizeText(target.target);
    if (!liveTarget && !(shouldAllowSameRunTarget && sameRunTarget)) {
      errors.push({
        path: targetPath,
        ruleId: 'tree-connect-target-required',
        message: missingTargetMessage,
        code: 'TREE_CONNECT_TARGET_REQUIRED',
      });
      return;
    }
    const targetKey = liveTarget ? `live:${liveTarget}` : `same-run:${sameRunTarget}`;
    if (seenTargetKeys.has(targetKey)) {
      errors.push({
        path: targetPath,
        ruleId: 'tree-connect-target-duplicate',
        message: `tree connectFields target "${liveTarget || sameRunTarget}" is duplicated.`,
        code: 'TREE_CONNECT_TARGET_DUPLICATE',
      });
      return;
    }
    seenTargetKeys.add(targetKey);

    const hasFilterPaths = Object.hasOwn(target, 'filterPaths');
    const filterPaths = hasFilterPaths
      ? Array.isArray(target.filterPaths)
        ? target.filterPaths.map((fieldPath) => normalizeText(fieldPath)).filter(Boolean)
        : []
      : [];
    if (hasFilterPaths && (!Array.isArray(target.filterPaths) || filterPaths.length !== target.filterPaths.length || filterPaths.length === 0)) {
      errors.push({
        path: `${targetPath}.filterPaths`,
        ruleId: 'tree-connect-filter-paths-invalid',
        message: 'tree connectFields filterPaths must be a non-empty string array when provided.',
        code: 'TREE_CONNECT_FILTER_PATHS_INVALID',
      });
      return;
    }

    const targetContext = typeof resolveTargetContext === 'function' ? resolveTargetContext(target, index) : null;
    const targetCollection = targetContext?.collectionName;
    if (targetContext?.error) {
      errors.push({
        path: targetContext.path || targetPath,
        ruleId: targetContext.ruleId,
        message: targetContext.message,
        code: targetContext.code,
      });
      return;
    }
    if (!targetCollection) {
      errors.push({
        path: targetPath,
        ruleId: 'tree-connect-target-unknown',
        message: 'tree connectFields target must resolve to a filterable data block with collectionName.',
        code: 'TREE_CONNECT_TARGET_UNKNOWN',
      });
      return;
    }
    if (!getCollectionMeta(metadata, targetCollection)) {
      errors.push({
        path: targetPath,
        ruleId: 'missing-collection-metadata',
        message: `collectionMetadata is required for collection "${targetCollection}" before this localized tree connectFields write.`,
        code: 'REQUIRED_COLLECTION_METADATA_MISSING',
        details: {
          collectionName: targetCollection,
          path: targetPath,
          reason: 'tree-connect-target',
        },
      });
      return;
    }
    if (
      treeCollection !== targetCollection
      && filterPaths.length === 0
    ) {
      errors.push({
        path: `${targetPath}.filterPaths`,
        ruleId: 'tree-connect-filter-paths-required',
        message: 'tree connectFields filterPaths are required when the target collection differs from the tree collection.',
        code: 'TREE_CONNECT_FILTER_PATHS_REQUIRED',
      });
      return;
    }

    if (filterPaths.length > 0) {
      validateTreeConnectFilterPathTypes({
        metadata,
        treeCollection,
        targetCollection,
        titleField,
        filterPaths,
        targetPath,
        errors,
      });
    }
  });
}

function validateTreeConnectFilterPathTypes({
  metadata,
  treeCollection,
  targetCollection,
  titleField,
  filterPaths,
  targetPath,
  errors,
}) {
  if (!metadata || !treeCollection || !targetCollection) return;
  const source = resolveCollectionFilterTargetField(metadata, treeCollection);
  if (!source?.field) return;
  const sourceKind = normalizeTreeConnectValueKind(source.field);
  if (!sourceKind) return;

  filterPaths.forEach((fieldPath, fieldPathIndex) => {
    if (!treeConnectFilterPathExists(metadata, targetCollection, fieldPath)) {
      errors.push({
        path: `${targetPath}.filterPaths[${fieldPathIndex}]`,
        ruleId: 'tree-connect-filter-path-unknown',
        message: `tree connectFields filterPaths entry "${fieldPath}" is unsupported for target collection ${targetCollection}.`,
        code: 'TREE_CONNECT_FILTER_PATH_UNKNOWN',
      });
      return;
    }
    const target = resolveFieldPathInMetadata(metadata, targetCollection, fieldPath);
    if (!target?.field) return;
    const targetKind = normalizeTreeConnectValueKind(target.field);
    if (!targetKind || targetKind === sourceKind) return;
    errors.push({
      path: `${targetPath}.filterPaths[${fieldPathIndex}]`,
      ruleId: 'tree-connect-filter-path-type-mismatch',
      message: `tree connectFields target field "${fieldPath}" is not type-compatible with the tree selected key "${source.fieldPath}". Tree titleField "${titleField || '(default)'}" only controls display; the selected filter value comes from "${source.fieldPath}". Omit filterPaths/use "${source.fieldPath}" for same-collection id filtering, or use a normal field filter/separate type collection for real type-value filtering.`,
      code: 'TREE_CONNECT_FILTER_PATH_TYPE_MISMATCH',
      details: {
        treeCollection,
        targetCollection,
        treeKeyField: source.fieldPath,
        titleField: titleField || null,
        filterPath: fieldPath,
        sourceKind,
        targetKind,
      },
    });
  });
}

function collectLocalizedTreeConnectFieldsErrors(payload, operation, metadata) {
  const errors = [];
  const shouldAllowSameRunTarget = operation === 'compose';

  const visitBlock = (block, path, siblingBlocksByKey) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return;

    if (normalizeText(block.type) === 'tree' && Object.hasOwn(block.settings || {}, 'connectFields')) {
      validateTreeConnectFieldsValue(block.settings.connectFields, `${path}.settings.connectFields`, errors, {
        shouldAllowSameRunTarget,
        missingTargetMessage: shouldAllowSameRunTarget
          ? 'tree connectFields targets must include target, targetId, or targetBlockUid.'
          : 'localized add-block tree connectFields targets must include targetId or targetBlockUid.',
        metadata,
        treeCollection: getBlockCollectionName(block),
        titleField: getBlockTitleField(block),
        resolveTargetContext(target, targetIndex) {
          const sameRunTarget = normalizeText(target.target);
          if (sameRunTarget) {
            const sameRunBlock = siblingBlocksByKey.get(sameRunTarget);
            if (!sameRunBlock) {
              return {
                error: true,
                path: `${path}.settings.connectFields.targets[${targetIndex}].target`,
                ruleId: 'tree-connect-target-unknown',
                message: `tree connectFields target "${sameRunTarget}" does not resolve to a same-run block key.`,
                code: 'TREE_CONNECT_TARGET_UNKNOWN',
              };
            }
            if (!TREE_CONNECT_TARGET_BLOCK_TYPES.has(normalizeText(sameRunBlock.type))) {
              return {
                error: true,
                path: `${path}.settings.connectFields.targets[${targetIndex}].target`,
                ruleId: 'tree-connect-target-unsupported',
                message: `tree connectFields target "${sameRunTarget}" must be a filterable data block.`,
                code: 'TREE_CONNECT_TARGET_UNSUPPORTED',
              };
            }
            return { collectionName: getBlockCollectionName(sameRunBlock) };
          }
          const liveTarget = normalizeText(target.targetId) || normalizeText(target.targetBlockUid);
          const targetEntry = getLiveTopologyEntry(metadata, liveTarget);
          if (!targetEntry) {
            return {
              error: true,
              path: `${path}.settings.connectFields.targets[${targetIndex}].${normalizeText(target.targetId) ? 'targetId' : 'targetBlockUid'}`,
              ruleId: 'tree-connect-target-unknown',
              message: `tree connectFields target "${liveTarget}" does not resolve to a live block uid.`,
              code: 'TREE_CONNECT_TARGET_UNKNOWN',
            };
          }
          if (!TREE_CONNECT_TARGET_LIVE_USES.has(getLiveEntryUse(targetEntry))) {
            return {
              error: true,
              path: `${path}.settings.connectFields.targets[${targetIndex}].${normalizeText(target.targetId) ? 'targetId' : 'targetBlockUid'}`,
              ruleId: 'tree-connect-target-unsupported',
              message: `tree connectFields target "${liveTarget}" must be a filterable data block.`,
              code: 'TREE_CONNECT_TARGET_UNSUPPORTED',
            };
          }
          return { collectionName: getLiveEntryCollectionName(targetEntry) };
        },
      });
    }

    forEachLocalizedChildBlockContainer(block, path, (blocks, blocksPath) => {
      const childBlocksByKey = collectBlocksByKey(blocks);
      blocks.forEach((child, index) => visitBlock(child, `${blocksPath}[${index}]`, childBlocksByKey));
    });
  };

  if (Array.isArray(payload?.blocks)) {
    const siblingBlocksByKey = collectBlocksByKey(payload.blocks);
    payload.blocks.forEach((block, index) => visitBlock(block, `$.blocks[${index}]`, siblingBlocksByKey));
  } else {
    visitBlock(payload, '$', collectBlocksByKey([payload]));
  }

  if (operation === 'configure' && Object.hasOwn(payload?.changes || {}, 'connectFields')) {
    const treeUid = normalizeText(payload?.target?.uid);
    const treeEntry = getLiveTopologyEntry(metadata, treeUid);
    validateTreeConnectFieldsValue(payload.changes.connectFields, '$.changes.connectFields', errors, {
      shouldAllowSameRunTarget: false,
      missingTargetMessage: 'localized configure tree connectFields targets must include targetId or targetBlockUid.',
      metadata,
      treeCollection: getLiveEntryCollectionName(treeEntry),
      titleField: getLiveEntryTitleField(treeEntry),
      sourceEntry: treeEntry,
      sourcePath: '$.target.uid',
      resolveTargetContext(target, targetIndex) {
        const liveTarget = normalizeText(target.targetId) || normalizeText(target.targetBlockUid);
        const targetEntry = getLiveTopologyEntry(metadata, liveTarget);
        const targetKey = normalizeText(target.targetId) ? 'targetId' : 'targetBlockUid';
        if (!targetEntry) {
          return {
            error: true,
            path: `$.changes.connectFields.targets[${targetIndex}].${targetKey}`,
            ruleId: 'tree-connect-target-unknown',
            message: `tree connectFields target "${liveTarget}" does not resolve to a live block uid.`,
            code: 'TREE_CONNECT_TARGET_UNKNOWN',
          };
        }
        if (!TREE_CONNECT_TARGET_LIVE_USES.has(getLiveEntryUse(targetEntry))) {
          return {
            error: true,
            path: `$.changes.connectFields.targets[${targetIndex}].${targetKey}`,
            ruleId: 'tree-connect-target-unsupported',
            message: `tree connectFields target "${liveTarget}" must be a filterable data block.`,
            code: 'TREE_CONNECT_TARGET_UNSUPPORTED',
          };
        }
        return { collectionName: getLiveEntryCollectionName(targetEntry) };
      },
    });
  }
  return errors;
}

function collectLocalizedAssignValuesErrors(payload, operation, metadata) {
  const errors = [];

  const push = (path, ruleId, message, code, details = undefined) => {
    errors.push({
      path,
      ruleId,
      message,
      code,
      ...(details ? { details } : {}),
    });
  };

  const validateAssignValuesObject = (assignValues, assignValuesPath, collectionName) => {
    const normalizedCollectionName = normalizeText(collectionName);
    const collectionMeta = getCollectionMeta(metadata, normalizedCollectionName);
    const issues = collectAssignValuesValidationIssues({
      assignValues,
      path: assignValuesPath,
      collectionName: normalizedCollectionName,
      collectionMeta,
      normalizeName: normalizeText,
      valueLabel: 'settings.assignValues',
      metadataValueLabel: 'assignValues',
      includeDetails: true,
    });
    issues.forEach((issue) => {
      push(
        issue.path,
        issue.ruleId,
        issue.message,
        issue.code,
        issue.details,
      );
    });
  };

  const validateAction = (item, path, collectionName, slot) => {
    const actionType = getActionType(item);
    if (slot === 'recordActions' && actionType === 'bulkupdate') {
      push(
        path,
        'bulk-update-must-use-actions',
        '`bulkUpdate` is a collection action and must be authored under block actions.',
        'BULK_UPDATE_MUST_USE_ACTIONS',
      );
    }
    if (slot === 'actions' && actionType === 'updaterecord') {
      push(
        path,
        'update-record-must-use-record-actions',
        '`updateRecord` is a record action and must be authored under recordActions.',
        'UPDATE_RECORD_MUST_USE_RECORD_ACTIONS',
      );
    }
    if (!hasAssignValues(item)) {
      return;
    }
    if ((slot === 'actions' && actionType !== 'bulkupdate') || (slot === 'recordActions' && actionType !== 'updaterecord')) {
      return;
    }
    validateAssignValuesObject(item.settings.assignValues, `${path}.settings.assignValues`, collectionName);
  };

  const visitActions = (items, path, collectionName, slot) => {
    if (!Array.isArray(items)) return;
    items.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      validateAction(item, itemPath, collectionName, slot);
      if (Array.isArray(item?.popup?.blocks)) {
        item.popup.blocks.forEach((block, blockIndex) => visitBlock(
          block,
          `${itemPath}.popup.blocks[${blockIndex}]`,
          collectionName,
        ));
      }
    });
  };

  const visitFieldPopups = (items, path, collectionName) => {
    if (!Array.isArray(items)) return;
    items.forEach((item, index) => {
      if (Array.isArray(item?.popup?.blocks)) {
        item.popup.blocks.forEach((block, blockIndex) => visitBlock(
          block,
          `${path}[${index}].popup.blocks[${blockIndex}]`,
          collectionName,
        ));
      }
    });
  };

  const visitBlock = (block, path, parentCollectionName = '') => {
    if (!isObjectRecord(block)) return;
    const collectionName = getLocalizedBlockCollectionName(block, parentCollectionName);
    visitActions(block.actions, `${path}.actions`, collectionName, 'actions');
    visitActions(block.recordActions, `${path}.recordActions`, collectionName, 'recordActions');
    visitFieldPopups(block.fields, `${path}.fields`, collectionName);
    if (Array.isArray(block.fieldGroups)) {
      block.fieldGroups.forEach((group, groupIndex) => {
        visitFieldPopups(group?.fields, `${path}.fieldGroups[${groupIndex}].fields`, collectionName);
      });
    }
    if (Array.isArray(block.blocks)) {
      block.blocks.forEach((child, index) => visitBlock(child, `${path}.blocks[${index}]`, collectionName));
    }
    if (Array.isArray(block.popup?.blocks)) {
      block.popup.blocks.forEach((child, index) => visitBlock(child, `${path}.popup.blocks[${index}]`, collectionName));
    }
  };

  if (Array.isArray(payload?.blocks)) {
    payload.blocks.forEach((block, index) => visitBlock(block, `$.blocks[${index}]`));
  } else {
    visitBlock(payload, '$');
  }

  if (operation === 'configure' && Object.hasOwn(payload?.changes || {}, 'assignValues')) {
    const targetUid = normalizeText(payload?.target?.uid);
    const targetEntry = getLiveTopologyEntry(metadata, targetUid);
    const targetUse = getLiveEntryUse(targetEntry);
    if (targetEntry && targetUse && !LIVE_UPDATE_ACTION_USES.has(targetUse)) {
      push(
        '$.target.uid',
        'assign-values-target-unsupported',
        'localized configure changes.assignValues requires a BulkUpdateActionModel or UpdateRecordActionModel target.',
        'ASSIGN_VALUES_TARGET_UNSUPPORTED',
      );
      return errors;
    }
    const targetCollection = getLiveEntryCollectionName(targetEntry);
    const parentCollection = targetCollection
      || getLiveEntryCollectionName(getLiveTopologyEntry(metadata, getLiveEntryParentUid(targetEntry)));
    validateAssignValuesObject(payload.changes.assignValues, '$.changes.assignValues', parentCollection);
  }

  return errors;
}

export function runLocalizedWritePreflight({
  operation,
  body,
  collectionMetadata,
  mode = DEFAULT_AUDIT_MODE,
  requirements = {},
  riskAccept = [],
  snapshotPath,
} = {}) {
  const normalizedOperation = normalizeOperation(operation);
  const normalizedBody = normalizeBody(body);
  const normalizedMetadata = normalizeMetadata(collectionMetadata);
  const extractedMetadata = extractRequiredMetadata({
    payload: normalizedBody,
    metadata: normalizedMetadata,
  });
  const localizedCollectionRefs = collectLocalizedCollectionRefs(normalizedBody);
  const treeConnectCollectionRefs = collectLocalizedTreeConnectCollectionRefs(normalizedBody, normalizedOperation, normalizedMetadata);
  const assignValuesCollectionRefs = collectLocalizedAssignValuesCollectionRefs(normalizedBody, normalizedOperation, normalizedMetadata);
  const requiredMetadata = {
    ...extractedMetadata,
    collectionRefs: [
      ...(extractedMetadata.collectionRefs || []),
      ...localizedCollectionRefs,
      ...treeConnectCollectionRefs,
      ...assignValuesCollectionRefs,
    ],
  };
  const errors = [];
  const errorSeen = new Set();
  const pushError = (issue) => {
    const key = `${issue.path}:${issue.ruleId}:${issue.message}`;
    if (errorSeen.has(key)) return;
    errorSeen.add(key);
    errors.push(issue);
  };

  collectLocalizedAssignValuesErrors(normalizedBody, normalizedOperation, normalizedMetadata)
    .filter((issue) => issue.ruleId === 'assign-values-must-be-object')
    .forEach(pushError);

  const canonicalize = canonicalizePayload({
    payload: normalizedBody,
    metadata: normalizedMetadata,
    mode,
    snapshotPath,
  });
  collectLocalizedSortAliasErrors(canonicalize.payload, normalizedOperation, normalizedMetadata).forEach(pushError);
  const cliBody = normalizeHeightSettingsForWrite(normalizedOperation, canonicalize.payload, normalizedMetadata);
  const audit = auditPayload({
    payload: cliBody,
    metadata: normalizedMetadata,
    mode,
    requirements,
    riskAccept,
    snapshotPath,
  });
  requiredMetadata.collectionRefs
    .filter((item) => !normalizedMetadata.collections?.[item.collectionName])
    .forEach((item) => {
      pushError({
        path: item.path,
        ruleId: 'missing-collection-metadata',
        message: `collectionMetadata is required for collection "${item.collectionName}" before this localized write.`,
        code: 'REQUIRED_COLLECTION_METADATA_MISSING',
        details: item,
      });
    });
  collectLocalizedMainBlockSectionErrors(cliBody).forEach(pushError);
  collectLocalizedPublicFieldObjectErrors(cliBody).forEach(pushError);
  collectLocalizedRelationPopupResourceErrors(cliBody, normalizedMetadata).forEach(pushError);
  collectLocalizedTreeConnectFieldsErrors(cliBody, normalizedOperation, normalizedMetadata).forEach(pushError);
  collectLocalizedAssignValuesErrors(cliBody, normalizedOperation, normalizedMetadata).forEach(pushError);
  audit.blockers.map(normalizeFinding).forEach(pushError);

  return {
    ok: errors.length === 0,
    operation: normalizedOperation,
    errors,
    warnings: audit.warnings.map(normalizeFinding),
    facts: {
      mode,
      operation: normalizedOperation,
      requiredCollections: summarizeCollectionRefs(requiredMetadata),
      metadataCollectionCount: audit.metadataCoverage?.collectionCount || 0,
      requiredCollectionCount: audit.metadataCoverage?.requiredCollectionCount || 0,
      canonicalizeChanged: (canonicalize.transforms || []).length > 0,
      canonicalizeTransformCodes: (canonicalize.transforms || []).map((item) => item.code),
      canonicalizeUnresolvedCodes: (canonicalize.unresolved || []).map((item) => item.code),
      ...summarizeSurfaceFacts(cliBody),
    },
    cliBody,
  };
}
