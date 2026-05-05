import { isPlainObject } from './utils.js';

const CALENDAR_TITLE_FIELD_INTERFACES = new Set(['input', 'select', 'phone', 'email', 'radioGroup']);
const CALENDAR_COLOR_FIELD_INTERFACES = new Set(['select', 'radioGroup']);
const CALENDAR_DATE_FIELD_INTERFACES = new Set(['datetime', 'datetimeNoTz', 'dateOnly', 'date']);
const CALENDAR_DATE_FIELD_TYPES = new Set(['date', 'datetime', 'datetimeNoTz', 'dateOnly', 'createdAt', 'updatedAt', 'unixTimestamp']);
const KANBAN_GROUP_FIELD_INTERFACES = new Set(['select', 'm2o']);
const ASSOCIATION_FIELD_TYPES = new Set(['belongsto', 'hasone', 'hasmany', 'belongstomany', 'belongstoarray', 'onetoone']);
const ASSOCIATION_FIELD_INTERFACES = new Set(['m2o', 'o2m', 'm2m', 'o2o', 'mbm', 'obo', 'oho', 'manytoone', 'onetomany', 'manytomany']);
const PUBLIC_DATA_SURFACE_BLOCK_TYPES = new Set(['table', 'list', 'gridCard', 'calendar', 'kanban']);
const PUBLIC_BLOCK_TYPE_BY_LIVE_USE = new Map([
  ['TableBlockModel', 'table'],
  ['ListBlockModel', 'list'],
  ['GridCardBlockModel', 'gridCard'],
  ['CalendarBlockModel', 'calendar'],
  ['KanbanBlockModel', 'kanban'],
  ['DetailsBlockModel', 'details'],
  ['MapBlockModel', 'map'],
  ['ChartBlockModel', 'chart'],
  ['TreeBlockModel', 'tree'],
  ['TreeCollectionBlockModel', 'tree'],
  ['CommentsBlockModel', 'comments'],
]);
const HIDDEN_POPUP_SETTINGS_BY_BLOCK_TYPE = new Map([
  [
    'calendar',
    [
      { key: 'quickCreatePopup', triggerLabel: 'quick create' },
      { key: 'eventPopup', triggerLabel: 'event click/view' },
    ],
  ],
  [
    'kanban',
    [
      { key: 'quickCreatePopup', triggerLabel: 'quick create' },
      { key: 'cardPopup', triggerLabel: 'card click/view' },
    ],
  ],
]);

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase();
}

function hasOwn(target, key) {
  return isPlainObject(target) && Object.prototype.hasOwnProperty.call(target, key);
}

function normalizeFilterTargetKeyValue(value) {
  if (Array.isArray(value)) {
    return normalizeText(value[0]);
  }
  return normalizeText(value);
}

function normalizeCollectionField(field) {
  if (!isPlainObject(field)) {
    return null;
  }
  const options = isPlainObject(field.options) ? field.options : {};
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

function getCollectionMeta(collectionMetadata, collectionName) {
  const normalizedCollectionName = normalizeText(collectionName);
  if (!normalizedCollectionName) return null;

  const rawCollections = collectionMetadata?.collections;
  let rawCollection = null;
  if (Array.isArray(rawCollections)) {
    rawCollection = rawCollections.find((entry) => normalizeText(entry?.name || entry?.data?.name) === normalizedCollectionName) || null;
  } else if (isPlainObject(rawCollections)) {
    rawCollection = rawCollections[normalizedCollectionName] || null;
  }

  const source = isPlainObject(rawCollection?.data) ? rawCollection.data : rawCollection;
  if (!isPlainObject(source)) return null;

  const options = isPlainObject(source.options) ? source.options : {};
  const values = isPlainObject(source.values) ? source.values : {};
  const normalizedFields = Array.isArray(source.fields) ? source.fields.map(normalizeCollectionField).filter(Boolean) : [];
  const fieldsByName = source.fieldsByName instanceof Map
    ? source.fieldsByName
    : new Map(normalizedFields.map((field) => [field.name, field]));
  const fields = normalizedFields.length > 0 ? normalizedFields : [...fieldsByName.values()];

  return {
    name: normalizedCollectionName,
    titleField: normalizeText(source.titleField || values.titleField || options.titleField),
    filterTargetKey:
      normalizeFilterTargetKeyValue(source.filterTargetKey)
      || normalizeFilterTargetKeyValue(values.filterTargetKey)
      || normalizeFilterTargetKeyValue(options.filterTargetKey),
    fields,
    fieldsByName,
  };
}

function isAssociationFieldMeta(field) {
  if (!isPlainObject(field)) return false;
  return (
    ASSOCIATION_FIELD_TYPES.has(normalizeLowerText(field.type))
    || ASSOCIATION_FIELD_INTERFACES.has(normalizeLowerText(field.interface))
  );
}

function resolveFieldPathInCollectionMetadata(collectionMetadata, collectionName, fieldPath) {
  const segments = normalizeText(fieldPath).split('.').filter(Boolean);
  let currentCollectionName = normalizeText(collectionName);
  let field = null;

  if (!currentCollectionName || segments.length === 0) return null;

  for (const [index, segment] of segments.entries()) {
    const collectionMeta = getCollectionMeta(collectionMetadata, currentCollectionName);
    if (!collectionMeta) {
      return null;
    }
    field = collectionMeta.fieldsByName.get(segment) || null;
    if (!field) {
      return null;
    }
    if (index < segments.length - 1) {
      if (!isAssociationFieldMeta(field) || !normalizeText(field.target)) {
        return null;
      }
      currentCollectionName = normalizeText(field.target);
    }
  }

  return {
    collectionName: normalizeText(field?.target || currentCollectionName),
    field,
  };
}

export function getPublicBlockCollectionName(block) {
  return (
    normalizeText(block?.collection)
    || normalizeText(block?.resource?.collectionName)
    || normalizeText(block?.resource?.collection)
    || normalizeText(block?.resourceInit?.collectionName)
    || normalizeText(block?.resourceInit?.collection)
  );
}

export function getHiddenPopupSettingsForBlockType(blockType) {
  return HIDDEN_POPUP_SETTINGS_BY_BLOCK_TYPE.get(normalizeText(blockType)) || [];
}

export function getPublicBlockTypeFromLiveUse(liveUse) {
  return PUBLIC_BLOCK_TYPE_BY_LIVE_USE.get(normalizeText(liveUse)) || '';
}

export function isPublicDataSurfaceBlockType(blockType) {
  return PUBLIC_DATA_SURFACE_BLOCK_TYPES.has(normalizeText(blockType));
}

export function forEachBlockHiddenPopup(settings, block, visitor) {
  if (!isPlainObject(settings)) return;
  for (const popupSetting of getHiddenPopupSettingsForBlockType(block?.type)) {
    if (!hasOwn(settings, popupSetting.key)) continue;
    visitor(settings[popupSetting.key], popupSetting);
  }
}

export function isCalendarDateFieldMeta(field) {
  return !!field
    && !isAssociationFieldMeta(field)
    && (
      CALENDAR_DATE_FIELD_INTERFACES.has(normalizeText(field.interface))
      || CALENDAR_DATE_FIELD_TYPES.has(normalizeText(field.type))
    );
}

export function isCalendarTitleFieldMeta(field) {
  return !!field
    && !isAssociationFieldMeta(field)
    && CALENDAR_TITLE_FIELD_INTERFACES.has(normalizeText(field.interface));
}

export function isCalendarColorFieldMeta(field) {
  return !!field
    && !isAssociationFieldMeta(field)
    && CALENDAR_COLOR_FIELD_INTERFACES.has(normalizeText(field.interface));
}

export function isKanbanGroupFieldMeta(field) {
  return !!field
    && KANBAN_GROUP_FIELD_INTERFACES.has(normalizeText(field.interface));
}

export function collectCalendarKanbanMainBlockSemanticIssues(block, path, collectionMetadata, { directSettingsPath = false } = {}) {
  const issues = [];
  const push = (issuePath, ruleId, message) => {
    issues.push({
      path: issuePath,
      ruleId,
      message,
    });
  };

  if (!isPlainObject(block)) {
    return issues;
  }

  const type = normalizeText(block.type);
  const settings = isPlainObject(block.settings) ? block.settings : {};
  const settingsPath = directSettingsPath ? path : `${path}.settings`;
  const collection = getPublicBlockCollectionName(block);
  if (!collection || !collectionMetadata || Object.keys(collectionMetadata).length === 0) {
    return issues;
  }

  const collectionMeta = getCollectionMeta(collectionMetadata, collection);
  if (!collectionMeta) {
    return issues;
  }

  if (type === 'calendar') {
    const hasAnyFieldBinding = ['titleField', 'colorField', 'startField', 'endField'].some((key) => hasOwn(settings, key));
    const dateFieldCount = collectionMeta.fields.filter((field) => isCalendarDateFieldMeta(field)).length;

    if (dateFieldCount === 0) {
      push(
        `${path}.collection`,
        'calendar-date-fields-missing',
        `calendar block collection ${collection} must expose at least one date-capable field.`,
      );
    }

    const validateBoundField = (key, validator, messageSuffix) => {
      if (!hasOwn(settings, key)) return;
      const fieldPath = normalizeText(settings[key]);
      if (!fieldPath) {
        push(
          `${settingsPath}.${key}`,
          'calendar-field-binding-required',
          `calendar settings.${key} must be a non-empty field path.`,
        );
        return;
      }
      const resolved = resolveFieldPathInCollectionMetadata(collectionMetadata, collection, fieldPath);
      if (!resolved?.field || !validator(resolved.field)) {
        push(
          `${settingsPath}.${key}`,
          'calendar-field-binding-invalid',
          `calendar settings.${key} must reference ${messageSuffix}; got "${fieldPath}".`,
        );
      }
    };

    validateBoundField('titleField', isCalendarTitleFieldMeta, 'a CalendarBlockModel title field');
    validateBoundField('colorField', isCalendarColorFieldMeta, 'a CalendarBlockModel color field');
    validateBoundField('startField', isCalendarDateFieldMeta, 'an existing date-capable field');
    validateBoundField('endField', isCalendarDateFieldMeta, 'an existing date-capable field');

    if (hasAnyFieldBinding && !hasOwn(settings, 'startField')) {
      push(
        `${settingsPath}.startField`,
        'calendar-start-field-required',
        'calendar settings.startField is required when configuring a calendar block.',
      );
    }

    return issues;
  }

  if (type === 'kanban' && hasOwn(settings, 'groupField')) {
    const groupFieldName = normalizeText(settings.groupField);
    if (!groupFieldName) {
      push(
        `${settingsPath}.groupField`,
        'kanban-group-field-required',
        'kanban settings.groupField must be a non-empty field name.',
      );
      return issues;
    }
    const groupField = resolveFieldPathInCollectionMetadata(collectionMetadata, collection, groupFieldName)?.field || null;
    if (!isKanbanGroupFieldMeta(groupField)) {
      push(
        `${settingsPath}.groupField`,
        'kanban-group-field-invalid',
        `kanban settings.groupField must reference a select or m2o field; got "${groupFieldName}".`,
      );
    }
  }

  return issues;
}

export function getPublicCollectionMeta(collectionMetadata, collectionName) {
  return getCollectionMeta(collectionMetadata, collectionName);
}

export function getPublicCollectionFieldMeta(collectionMetadata, collectionName, fieldName) {
  const collectionMeta = getCollectionMeta(collectionMetadata, collectionName);
  const normalizedFieldName = normalizeText(fieldName);
  if (!collectionMeta || !normalizedFieldName) return null;
  return collectionMeta.fieldsByName.get(normalizedFieldName) || null;
}

export function resolvePublicFieldPathInCollectionMetadata(collectionMetadata, collectionName, fieldPath) {
  return resolveFieldPathInCollectionMetadata(collectionMetadata, collectionName, fieldPath);
}

export function isPublicAssociationFieldMeta(field) {
  return isAssociationFieldMeta(field);
}

export const PUBLIC_RELATION_FIELD_TITLE_FIELD_REQUIRED_RULE_ID = 'relation-field-title-field-required-when-collection-title-is-id';

export function getPublicRelationFieldObjectPath(item) {
  if (typeof item === 'string') {
    return normalizeText(item);
  }
  return normalizeText(item?.field || item?.fieldPath);
}

export function buildPublicRelationFieldTitleFieldRequiredMessage(fieldPath, targetCollection) {
  const normalizedFieldPath = normalizeText(fieldPath) || '(unknown field)';
  const normalizedTargetCollection = normalizeText(targetCollection) || '(unknown collection)';
  return `Relation field "${normalizedFieldPath}" targets collection "${normalizedTargetCollection}" whose default titleField is "id". You must explicitly set titleField on this relation field object. A readable field such as "name", "title", or "code" is recommended when available.`;
}

export function getPublicRelationFieldTitleFieldRequirement(collectionMetadata, sourceCollectionName, fieldPath) {
  const normalizedSourceCollectionName = normalizeText(sourceCollectionName);
  const normalizedFieldPath = normalizeText(fieldPath);
  if (!normalizedSourceCollectionName || !normalizedFieldPath || normalizedFieldPath.includes('.')) {
    return null;
  }

  const resolved = resolveFieldPathInCollectionMetadata(
    collectionMetadata,
    normalizedSourceCollectionName,
    normalizedFieldPath,
  );
  if (!isAssociationFieldMeta(resolved?.field)) {
    return null;
  }

  const targetCollection = normalizeText(resolved?.field?.target);
  if (!targetCollection) {
    return null;
  }

  const targetCollectionMeta = getCollectionMeta(collectionMetadata, targetCollection);
  const effectiveTargetCollectionTitleField = normalizeLowerText(targetCollectionMeta?.titleField) || 'id';
  if (effectiveTargetCollectionTitleField !== 'id') {
    return null;
  }

  return {
    sourceCollection: normalizedSourceCollectionName,
    relationField: normalizeText(resolved?.field?.name) || normalizedFieldPath,
    targetCollection,
    targetCollectionTitleField: normalizeText(targetCollectionMeta?.titleField) || 'id',
  };
}
