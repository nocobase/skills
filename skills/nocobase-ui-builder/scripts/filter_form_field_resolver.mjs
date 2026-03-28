function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

export function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

const ASSOCIATION_TYPES = new Set([
  'belongsto',
  'belongstomany',
  'hasmany',
  'hasone',
]);

const ASSOCIATION_INTERFACES = new Set([
  'm2o',
  'm2m',
  'o2m',
  'oho',
  'obo',
  'o2o',
  'onetomany',
  'manytoone',
  'manytomany',
]);

const SELECT_INTERFACES = new Set([
  'select',
  'multipleselect',
  'radiogroup',
  'checkbox',
  'checkboxgroup',
  'boolean',
  'enum',
]);

const NUMERIC_INTERFACES = new Set([
  'integer',
  'number',
  'float',
  'double',
  'decimal',
]);

const NUMERIC_TYPES = new Set([
  'integer',
  'float',
  'double',
  'decimal',
  'id',
  'snowflakeid',
  'bigint',
]);

const DATETIME_TYPES = new Set([
  'datetime',
  'datetimetz',
  'createdat',
  'updatedat',
  'unixtimestamp',
]);

export function isAssociationFieldMeta(fieldMeta) {
  const fieldType = normalizeOptionalText(fieldMeta?.type).toLowerCase();
  const fieldInterface = normalizeOptionalText(fieldMeta?.interface).toLowerCase();
  return Boolean(normalizeOptionalText(fieldMeta?.target))
    || ASSOCIATION_TYPES.has(fieldType)
    || ASSOCIATION_INTERFACES.has(fieldInterface);
}

export function getFieldTitle(fieldMeta) {
  return normalizeOptionalText(fieldMeta?.uiSchema?.title)
    || normalizeOptionalText(fieldMeta?.title)
    || normalizeOptionalText(fieldMeta?.name);
}

function getFieldsByName(collectionMeta) {
  if (!collectionMeta || typeof collectionMeta !== 'object') {
    return new Map();
  }
  if (collectionMeta.fieldsByName instanceof Map) {
    return collectionMeta.fieldsByName;
  }
  const fields = Array.isArray(collectionMeta.fields) ? collectionMeta.fields : [];
  return new Map(
    fields
      .filter((field) => isPlainObject(field))
      .map((field) => [normalizeOptionalText(field.name), field])
      .filter(([name]) => Boolean(name)),
  );
}

export function getCollectionMeta(metadata, collectionName) {
  const normalizedCollectionName = normalizeOptionalText(collectionName);
  if (!normalizedCollectionName || metadata == null) {
    return null;
  }

  if (metadata instanceof Map) {
    return metadata.get(normalizedCollectionName) || null;
  }

  if (Array.isArray(metadata)) {
    return metadata.find((item) => normalizeOptionalText(item?.name) === normalizedCollectionName) || null;
  }

  if (isPlainObject(metadata.collections)) {
    return metadata.collections[normalizedCollectionName] || null;
  }

  if (metadata.collections instanceof Map) {
    return metadata.collections.get(normalizedCollectionName) || null;
  }

  if (Array.isArray(metadata.collections)) {
    return metadata.collections.find((item) => normalizeOptionalText(item?.name) === normalizedCollectionName) || null;
  }

  if (isPlainObject(metadata)) {
    return metadata[normalizedCollectionName] || null;
  }

  return null;
}

function getFieldMeta(collectionMeta, fieldName) {
  const normalizedFieldName = normalizeOptionalText(fieldName);
  if (!collectionMeta || !normalizedFieldName) {
    return null;
  }
  const fieldsByName = getFieldsByName(collectionMeta);
  return fieldsByName.get(normalizedFieldName) || null;
}

export function resolveFieldMeta(metadata, collectionName, fieldPath) {
  const normalizedCollectionName = normalizeOptionalText(collectionName);
  const normalizedFieldPath = normalizeOptionalText(fieldPath);
  if (!normalizedCollectionName || !normalizedFieldPath) {
    return null;
  }

  const segments = normalizedFieldPath
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  let currentCollection = getCollectionMeta(metadata, normalizedCollectionName);
  if (!currentCollection) {
    return null;
  }

  let rootField = null;
  let currentField = null;
  let previousAssociationField = null;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    currentField = getFieldMeta(currentCollection, segment);
    if (!currentField) {
      const expectedTargetKey = normalizeOptionalText(previousAssociationField?.targetKey);
      if (index === segments.length - 1 && expectedTargetKey && expectedTargetKey === segment) {
        currentField = {
          name: segment,
          type: '',
          interface: '',
          target: '',
          foreignKey: '',
          targetKey: '',
        };
      } else {
        return null;
      }
    }

    if (!rootField) {
      rootField = currentField;
    }

    if (index === segments.length - 1) {
      return {
        collection: currentCollection,
        field: currentField,
        rootField,
        parentAssociationField: previousAssociationField,
        segments,
        isDotted: segments.length > 1,
      };
    }

    if (!isAssociationFieldMeta(currentField) || !normalizeOptionalText(currentField.target)) {
      return null;
    }

    previousAssociationField = currentField;
    currentCollection = getCollectionMeta(metadata, currentField.target);
    if (!currentCollection) {
      return null;
    }
  }

  return null;
}

function buildDescriptorFromField(fieldMeta, fallbackName) {
  const normalizedName = normalizeOptionalText(fieldMeta?.name) || fallbackName;
  const descriptor = {
    name: normalizedName,
    title: getFieldTitle(fieldMeta) || normalizedName,
    interface: normalizeOptionalText(fieldMeta?.interface) || 'input',
    type: normalizeOptionalText(fieldMeta?.type) || 'string',
  };

  const target = normalizeOptionalText(fieldMeta?.target);
  const foreignKey = normalizeOptionalText(fieldMeta?.foreignKey);
  const targetKey = normalizeOptionalText(fieldMeta?.targetKey);
  if (target) {
    descriptor.target = target;
  }
  if (foreignKey) {
    descriptor.foreignKey = foreignKey;
  }
  if (targetKey) {
    descriptor.targetKey = targetKey;
  }

  return descriptor;
}

function resolvePreferredUses(fieldMeta) {
  if (isAssociationFieldMeta(fieldMeta)) {
    return ['FilterFormRecordSelectFieldModel'];
  }

  const fieldInterface = normalizeOptionalText(fieldMeta?.interface).toLowerCase();
  const fieldType = normalizeOptionalText(fieldMeta?.type).toLowerCase();

  if (SELECT_INTERFACES.has(fieldInterface) || fieldType === 'boolean' || fieldType === 'enum') {
    return ['SelectFieldModel'];
  }
  if (fieldInterface === 'date') {
    return ['DateOnlyFilterFieldModel'];
  }
  if (fieldInterface === 'datetimenotz') {
    return ['DateTimeNoTzFilterFieldModel'];
  }
  if (fieldInterface === 'datetime' || fieldInterface === 'datetimetz' || DATETIME_TYPES.has(fieldType)) {
    return ['DateTimeTzFilterFieldModel'];
  }
  if (fieldInterface === 'percent' || fieldType === 'percent') {
    return ['PercentFieldModel', 'NumberFieldModel'];
  }
  if (fieldInterface === 'time' || fieldType === 'time') {
    return ['TimeFieldModel'];
  }
  if (NUMERIC_INTERFACES.has(fieldInterface) || NUMERIC_TYPES.has(fieldType)) {
    return ['NumberFieldModel'];
  }
  return ['InputFieldModel'];
}

function normalizeAllowedUses(allowedUses) {
  const source = allowedUses instanceof Set
    ? [...allowedUses]
    : Array.isArray(allowedUses)
      ? allowedUses
      : [];
  const normalized = new Set();
  for (const entry of source) {
    const use = normalizeOptionalText(typeof entry === 'string' ? entry : entry?.use);
    if (use) {
      normalized.add(use);
    }
  }
  return normalized.size > 0 ? normalized : null;
}

function chooseResolvedUse(preferredUses, allowedUses) {
  if (!Array.isArray(preferredUses) || preferredUses.length === 0) {
    return 'InputFieldModel';
  }
  const normalizedAllowedUses = normalizeAllowedUses(allowedUses);
  if (!normalizedAllowedUses) {
    return preferredUses[0];
  }
  for (const use of preferredUses) {
    if (normalizedAllowedUses.has(use)) {
      return use;
    }
  }
  if (normalizedAllowedUses.has('InputFieldModel')) {
    return 'InputFieldModel';
  }
  return preferredUses[0];
}

export function resolveFilterFieldModelSpec({
  metadata,
  collectionName,
  fieldPath,
  allowedUses,
} = {}) {
  const normalizedCollectionName = normalizeOptionalText(collectionName);
  const normalizedFieldPath = normalizeOptionalText(fieldPath);
  if (!normalizedCollectionName || !normalizedFieldPath) {
    return null;
  }

  const resolution = resolveFieldMeta(metadata, normalizedCollectionName, normalizedFieldPath);
  const fallbackName = normalizedFieldPath.split('.').map((segment) => segment.trim()).filter(Boolean).at(-1)
    || normalizedFieldPath;
  const descriptorSourceField = resolution?.isDotted ? resolution?.field : (resolution?.rootField || resolution?.field);
  const descriptor = buildDescriptorFromField(descriptorSourceField, fallbackName);
  const preferredUses = resolvePreferredUses(resolution?.field || null);

  return {
    collectionName: normalizedCollectionName,
    fieldPath: normalizedFieldPath,
    descriptor,
    resolvedField: resolution?.field || null,
    resolvedCollection: resolution?.collection || null,
    rootField: resolution?.rootField || null,
    parentAssociationField: resolution?.parentAssociationField || null,
    preferredUses,
    use: chooseResolvedUse(preferredUses, allowedUses),
  };
}
